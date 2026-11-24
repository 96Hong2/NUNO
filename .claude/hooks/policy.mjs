// PreToolUse 판정. 순수 함수라 git 과 파일을 읽지 않는다. 시험은 policy.test.mjs.
// 실수를 막는 장치다. 셸 문법을 꼬아 돌아가는 길은 CI verify 와 브랜치 보호가 맡는다.
import { posix } from "node:path";

const PROTECTED = [
  ".github",
  ".claude/hooks",
  ".claude/settings.json",
  ".claude/settings.local.json",
];
// 경로를 풀 수 없는 단어($VAR 가 든 것)는 이 글자가 보이는지로만 본다.
const PROTECTED_TEXT =
  /(?:^|\/)(\.github|\.claude\/hooks|\.claude\/settings(?:\.local)?\.json)(?:\/|$)/;
const TEST_FILE = /\.test\.tsx?$/;
const WRAPPERS = new Set(["sudo", "env", "command", "builtin", "nohup", "time", "exec", "xargs"]);
const WRAPPERS_WITH_ARG = new Set(["timeout", "nice"]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash"]);
const INTERPRETERS = new Set(["node", "python", "python3", "ruby", "perl", "deno", "bun"]);
const WRITES_ALL = new Set(["rm", "rmdir", "unlink", "mv", "tee", "touch", "chmod", "truncate"]);
const WRITES_LAST = new Set(["cp", "ln", "install", "rsync"]);
const REMOVES = new Set(["rm", "rmdir", "unlink", "mv"]);
const WRITE_API =
  /\b(?:write|append|copy|rename|unlink|rm|truncate|symlink|chmod)|open\([^)]*["'][wa]/i;

export const REASON = {
  noVerify: "--no-verify 는 쓰지 않는다. 옵션을 빼고 다시 실행하고, 막히면 그 오류를 고친다.",
  protectedPath: (path) =>
    `${path} 는 훅과 CI 설정이라 고치지 않는다. 바꿔야 하면 무엇을 왜 바꿀지 기획자에게 묻는다.`,
  existingTest: (path) =>
    `${path} 는 main 에 이미 있는 시험이라 고치지 않는다. 새 시험 파일을 더하거나, 꼭 고쳐야 하면 기획자에게 묻는다.`,
  badInput: "훅 입력을 읽지 못해 이 도구 호출을 막았다. 다시 하고, 계속 막히면 기획자에게 알린다.",
};

// 저장소 최상위 기준 경로(rel, "/" 구분, 최상위는 "")를 판정한다. mainTests 는 origin/main 의 경로 Set.
// removes 면 보호 경로를 품은 폴더(.claude, 최상위)를 지우거나 옮기는 것도 막는다.
export function pathReason(rel, mainTests, { removes = false } = {}) {
  for (const path of PROTECTED) {
    if (rel === path || rel.startsWith(`${path}/`)) return REASON.protectedPath(path);
    if (removes && (rel === "" || path.startsWith(`${rel}/`))) return REASON.protectedPath(path);
  }
  if (TEST_FILE.test(rel) && mainTests.has(rel)) return REASON.existingTest(rel);
  return null;
}

// 글롭 단어. 셸처럼 * 와 ? 는 / 를 넘지 않고, 맨 앞 와일드카드는 숨김 파일에 맞지 않는다.
function globReason(rel, mainTests, removes) {
  const parts = rel.split("/");
  const fixed = parts
    .slice(
      0,
      parts.findIndex((part) => /[*?[]/.test(part)),
    )
    .join("/");
  const inside = fixed && pathReason(fixed, mainTests);
  if (inside) return inside;
  const pattern = parts.map((part) => {
    const body = part
      .replace(/[.+^${}()|\\]/g, "\\$&")
      .replaceAll("*", "[^/]*")
      .replaceAll("?", "[^/]");
    return /^[*?]/.test(part) ? `(?!\\.)${body}` : body;
  });
  const glob = new RegExp(`^${pattern.join("/")}$`);
  for (const path of PROTECTED) {
    const hits = removes
      ? path.split("/").map((_, k, all) => all.slice(0, k + 1).join("/"))
      : [path];
    if (hits.some((hit) => glob.test(hit))) return REASON.protectedPath(path);
  }
  for (const test of mainTests) {
    if (TEST_FILE.test(test) && glob.test(test)) return REASON.existingTest(test);
  }
  return null;
}

// 명령 속 경로 글자를 저장소 기준 경로로 바꾼다. 저장소 밖이거나 알 수 없으면 null.
function toRel(text, cwd, root) {
  if (text === "" || text.startsWith("~")) return null;
  let rel;
  if (text.startsWith("/")) {
    if (root === null) return null;
    rel = posix.relative(root, posix.normalize(text));
  } else {
    if (cwd === null) return null;
    rel = posix.normalize(posix.join(cwd, text));
  }
  if (rel === "." || rel === "") return "";
  return rel === ".." || rel.startsWith("../") ? null : rel.replace(/\/+$/, "");
}

function wordReason(text, cwd, context, removes = false) {
  if (text.includes("$")) {
    const hit = PROTECTED_TEXT.exec(text);
    return hit ? REASON.protectedPath(hit[1]) : null;
  }
  const rel = toRel(text, cwd, context.root);
  if (rel === null) return null;
  if (/[*?[]/.test(rel)) return globReason(rel, context.mainTests, removes);
  return pathReason(rel, context.mainTests, { removes });
}

// 셸 명령을 단순 명령 단위로 나눈다. 따옴표, 백슬래시, 주석, heredoc 본문, 리다이렉트만 알아본다.
// 단어는 { text, quoted }. $( ), 백틱, 괄호 안쪽은 따로 나뉜 명령으로 본다.
export function parseCommand(command) {
  const segments = [];
  const heredocs = [];
  let segment = { words: [], redirects: [] };
  let word = null;
  let target = null; // "out": 쓰는 리다이렉트 대상, "in": 읽는 쪽이라 버린다
  const add = (text, quoted = false) => {
    word ??= { text: "", quoted: false };
    word.text += text;
    word.quoted ||= quoted;
  };
  const endWord = () => {
    if (word !== null) {
      if (target === "out") segment.redirects.push(word.text);
      else if (target === null) segment.words.push(word);
      target = null;
    }
    word = null;
  };
  const endSegment = () => {
    endWord();
    target = null;
    if (segment.words.length > 0 || segment.redirects.length > 0) segments.push(segment);
    segment = { words: [], redirects: [] };
  };

  let i = 0;
  while (i < command.length) {
    const c = command[i];
    const next = command[i + 1];
    if (c === "'") {
      const end = command.indexOf("'", i + 1);
      add(command.slice(i + 1, end === -1 ? command.length : end), true);
      i = end === -1 ? command.length : end + 1;
    } else if (c === '"') {
      let text = "";
      i += 1;
      while (i < command.length && command[i] !== '"') {
        if (command[i] === "\\" && i + 1 < command.length) i += 1;
        text += command[i];
        i += 1;
      }
      add(text, true);
      i += 1;
    } else if (c === "\\") {
      if (next !== "\n") add(next ?? "");
      i += 2;
    } else if (c === "#" && word === null) {
      while (i < command.length && command[i] !== "\n") i += 1;
    } else if (c === "\n") {
      endSegment();
      i += 1;
      // heredoc 본문은 명령이 아니다. 구분자 줄까지 건너뛴다.
      for (const delimiter of heredocs.splice(0)) {
        while (i < command.length) {
          const end = command.indexOf("\n", i);
          const line = command.slice(i, end === -1 ? command.length : end);
          i = end === -1 ? command.length : end + 1;
          if (line.replace(/^\t+/, "") === delimiter) break;
        }
      }
    } else if (c === "<" && next === "<" && command[i + 2] !== "<") {
      endWord();
      const match = /^-?[ \t]*(['"]?)([^\s'";|&<>()]+)\1/.exec(command.slice(i + 2));
      if (match) heredocs.push(match[2]);
      i += 2 + (match ? match[0].length : 0);
    } else if (c === ">" || (c === "&" && next === ">")) {
      // 2> 의 숫자는 단어가 아니라 fd 다.
      if (word !== null && !word.quoted && /^\d+$/.test(word.text)) word = null;
      endWord();
      i += c === "&" ? 2 : 1;
      if (command[i] === ">" || command[i] === "|") i += 1;
      if (command[i] === "&" && /[\d-]/.test(command[i + 1] ?? "")) {
        i += 1; // >&1, >&- 는 fd 복제라 파일 대상이 없다.
        while (/[\d-]/.test(command[i] ?? "")) i += 1;
      } else {
        if (command[i] === "&") i += 1;
        target = "out";
      }
    } else if (c === "<") {
      endWord();
      i += next === "<" ? 3 : 1;
      target = "in";
    } else if (";|&()`".includes(c) || (c === "$" && next === "(")) {
      endSegment();
      i += c === "$" ? 2 : 1;
    } else if (c === " " || c === "\t") {
      endWord();
      i += 1;
    } else {
      add(c);
      i += 1;
    }
  }
  endSegment();
  return segments;
}

// 앞에 붙은 VAR=값 과 sudo, env 같은 감싸는 명령을 건너뛴 명령 이름의 자리.
function commandIndex(words) {
  let at = 0;
  let wrapped = false;
  while (at < words.length) {
    const { text, quoted } = words[at];
    const name = posix.basename(text);
    if (!quoted && /^[A-Za-z_]\w*=/.test(text)) at += 1;
    else if (WRAPPERS.has(name) || WRAPPERS_WITH_ARG.has(name)) {
      wrapped = true;
      at += 1;
    } else if (wrapped && (text.startsWith("-") || /^\d+[smhd]?$/.test(text))) at += 1;
    else break;
  }
  return at;
}

// git 의 쓰기 대상과 훅 건너뛰기. -C 는 git 이 볼 폴더를 바꾼다.
function gitReason(args, cwd, context) {
  let k = 0;
  let gitCwd = cwd;
  while (k < args.length && args[k].text.startsWith("-")) {
    if (["-C", "-c", "--git-dir", "--work-tree"].includes(args[k].text)) {
      if (args[k].text === "-C") gitCwd = toRel(args[k + 1]?.text ?? "", gitCwd, context.root);
      k += 2;
    } else k += 1;
  }
  const sub = args[k]?.text;
  const rest = args.slice(k + 1);
  const bare = rest.filter((word) => !word.quoted).map((word) => word.text);
  if ((sub === "commit" || sub === "push") && bare.includes("--no-verify")) return REASON.noVerify;
  // commit 의 -n 은 --no-verify 와 같다. push 의 -n 은 dry-run 이라 commit 에만 건다.
  if (sub === "commit" && bare.some((text) => /^-[a-zA-Z]*n[a-zA-Z]*$/.test(text))) {
    return REASON.noVerify;
  }
  if (sub !== "rm" && sub !== "mv") return null;
  for (const word of rest.filter((w) => !w.text.startsWith("-"))) {
    const reason = wordReason(word.text, gitCwd, context, true);
    if (reason) return reason;
  }
  return null;
}

// 한 줄 코드(node -e, python -c)는 쓰기 API 와 보호 경로 글자가 함께 보일 때만 막는다.
function inlineCodeReason(args) {
  if (!args.some((word) => !word.quoted && /^-[a-zA-Z]*[ec]$/.test(word.text))) return null;
  const code = args.map((word) => word.text).join(" ");
  if (!WRITE_API.test(code)) return null;
  const hit = /(\.github|\.claude\/hooks|\.claude\/settings(?:\.local)?\.json)(?![\w.-])/.exec(
    code,
  );
  return hit ? REASON.protectedPath(hit[1]) : null;
}

// Bash 명령 하나를 판정한다. context 는 { cwd: 저장소 기준 폴더나 null, root: 저장소 절대 경로나 null, mainTests }.
export function commandReason(command, context, depth = 0) {
  let cwd = context.cwd;
  for (const { words, redirects } of parseCommand(command)) {
    for (const text of redirects) {
      const reason = wordReason(text, cwd, context);
      if (reason) return reason;
    }
    const at = commandIndex(words);
    if (at >= words.length) continue;
    const name = posix.basename(words[at].text);
    const args = words.slice(at + 1);
    const bare = args.filter((word) => !word.quoted).map((word) => word.text);
    const operands = args.filter((word) => word.quoted || !word.text.startsWith("-"));
    let targets = [];

    if (name === "cd") {
      const to = operands[0]?.text;
      cwd = to === undefined || to.includes("$") ? null : toRel(to, cwd, context.root);
      continue;
    }
    if (SHELLS.has(name) || name === "eval") {
      const index = args.findIndex((word) => !word.quoted && /^-[a-zA-Z]*c$/.test(word.text));
      const code = name === "eval" ? bare.join(" ") : index === -1 ? "" : args[index + 1]?.text;
      if (code && depth < 3) {
        const reason = commandReason(code, { ...context, cwd }, depth + 1);
        if (reason) return reason;
      }
      continue;
    }
    if (name === "git") {
      const reason = gitReason(args, cwd, context);
      if (reason) return reason;
      continue;
    }
    if (INTERPRETERS.has(name)) {
      const reason = inlineCodeReason(args);
      if (reason) return reason;
    }

    const inPlace =
      (name === "sed" && bare.some((t) => /^-[a-zA-Z]*i/.test(t) || t.startsWith("--in-place"))) ||
      (name === "perl" && bare.some((t) => /^-(?![MI])[a-zA-Z]*i/.test(t)));
    if (WRITES_ALL.has(name) || inPlace || bare.includes("--write") || bare.includes("--fix")) {
      targets = operands;
    } else if (WRITES_LAST.has(name)) {
      targets = operands.slice(-1);
    }
    for (const word of targets) {
      const reason = wordReason(word.text, cwd, context, REMOVES.has(name));
      if (reason) return reason;
    }
  }
  return null;
}
