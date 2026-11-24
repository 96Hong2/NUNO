// PreToolUse 판정. 순수 함수라 git 과 파일을 읽지 않는다. 시험은 policy.test.mjs.
// 실수를 막는 장치다. 셸 문법을 꼬아 돌아가는 길은 CI verify 와 브랜치 보호가 맡는다.

const PROTECTED = /(?:^|\/)(\.github|\.claude\/hooks|\.claude\/settings(?:\.local)?\.json)(?:\/|$)/;
const TEST_FILE = /\.test\.tsx?$/;
// 인자로 받은 경로를 쓰거나 지우는 명령. cp 같은 것은 마지막 인자(대상)만 쓴다.
const WRITES_ALL = new Set(["rm", "rmdir", "unlink", "mv", "tee", "touch", "chmod", "truncate"]);
const WRITES_LAST = new Set(["cp", "ln", "install", "rsync"]);
const IN_PLACE = new Set(["sed", "perl"]);

export const REASON = {
  noVerify: "--no-verify 는 쓰지 않는다. 옵션을 빼고 다시 실행하고, 막히면 그 오류를 고친다.",
  protectedPath: (path) =>
    `${path} 는 훅과 CI 설정이라 고치지 않는다. 바꿔야 하면 무엇을 왜 바꿀지 기획자에게 묻는다.`,
  existingTest: (path) =>
    `${path} 는 main 에 이미 있는 시험이라 고치지 않는다. 새 시험 파일을 더하거나, 꼭 고쳐야 하면 기획자에게 묻는다.`,
  badInput: "훅 입력을 읽지 못해 이 도구 호출을 막았다. 다시 하고, 계속 막히면 기획자에게 알린다.",
};

// 저장소 최상위 기준 경로(rel, "/" 구분)를 판정한다. mainTests 는 origin/main 의 시험 경로 Set.
export function pathReason(rel, mainTests) {
  const hit = PROTECTED.exec(rel);
  if (hit) return REASON.protectedPath(hit[1]);
  if (TEST_FILE.test(rel) && mainTests.has(rel)) return REASON.existingTest(rel);
  return null;
}

// 명령에 쓰인 경로 글자 하나. 상대 경로나 절대 경로라 저장소 경로와 끝이 맞는지로 본다.
function wordReason(word, mainTests) {
  const path = word.replace(/^\.\//, "").replace(/\/+$/, "");
  const hit = PROTECTED.exec(path);
  if (hit) return REASON.protectedPath(hit[1]);
  if (!TEST_FILE.test(path)) return null;
  for (const test of mainTests) {
    if (path === test || path.endsWith(`/${test}`) || test.endsWith(`/${path}`)) {
      return REASON.existingTest(test);
    }
  }
  return null;
}

function words(segment) {
  return segment
    .split(/\s+/)
    .map((word) => word.replace(/^[("'$`{]+|[)"'`}]+$/g, ""))
    .filter(Boolean);
}

// Bash 명령을 ; && || | 줄바꿈으로 자르고, 쓰는 자리의 경로만 본다. 읽기만 하는 명령은 통과한다.
export function commandReason(command, mainTests) {
  for (const segment of command.split(/&&|\|\||[;|\n]|(?<![>&])&(?![>&])/)) {
    if (/\bgit\b/.test(segment) && /(?:^|\s)--no-verify\b/.test(segment)) return REASON.noVerify;
    for (const match of segment.matchAll(/(?<![<&\d])\d?>>?\s*([^\s<>&]+)/g)) {
      const reason = wordReason(match[1].replace(/^["']|["']$/g, ""), mainTests);
      if (reason) return reason;
    }
    const list = words(segment);
    // sh -c "…", $( … ), sudo 처럼 감싼 명령도 잡도록 명령 이름을 단어 어디서나 찾는다.
    const at = list.findIndex((word, index) => {
      const name = word.split("/").at(-1);
      if (WRITES_ALL.has(name) || WRITES_LAST.has(name)) return true;
      if (IN_PLACE.has(name)) return list.slice(index + 1).some((w) => /^-[a-zA-Z]*i/.test(w));
      return name === "git" && ["rm", "mv"].includes(list[index + 1]);
    });
    if (at === -1) continue;
    const name = list[at].split("/").at(-1);
    const operands = list.slice(at + 1).filter((word) => !word.startsWith("-"));
    const targets = WRITES_LAST.has(name) ? operands.slice(-1) : operands;
    const removes = ["rm", "rmdir", "mv", "git"].includes(name);
    for (const word of targets) {
      // 지우거나 옮기면 .claude 폴더째로도 훅이 사라진다.
      if (removes && /(?:^|\/)\.claude\/?$/.test(word)) return REASON.protectedPath(".claude");
      const reason = wordReason(word, mainTests);
      if (reason) return reason;
    }
  }
  return null;
}
