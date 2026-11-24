// PreToolUse 판정. 순수 함수라 git 과 파일을 읽지 않는다.
// Edit 와 Write 로 훅, CI 설정, main 에 있는 시험을 고치는 것과 git --no-verify 만 막는다.
// Bash 로 파일을 쓰는 길은 보지 않는다. 그쪽의 최종 방어는 PR 리뷰와 CI 다.

const PROTECTED = [
  ".github",
  ".claude/hooks",
  ".claude/settings.json",
  ".claude/settings.local.json",
];
const TEST_FILE = /\.test\.tsx?$/;
const NO_VERIFY = /\bgit\b[^;&|\n]*\s(?:commit|push)\b[^;&|\n]*\s--no-verify\b/;

export const REASON = {
  noVerify: "--no-verify 는 쓰지 않는다. 옵션을 빼고 다시 실행하고, 막히면 그 오류를 고친다.",
  protectedPath: (path) =>
    `${path} 는 훅과 CI 설정이라 고치지 않는다. 바꿔야 하면 무엇을 왜 바꿀지 기획자에게 묻는다.`,
  existingTest: (path) =>
    `${path} 는 main 에 이미 있는 시험이라 고치지 않는다. 새 시험 파일을 더하거나, 꼭 고쳐야 하면 기획자에게 묻는다.`,
  badInput: "훅 입력을 읽지 못해 이 도구 호출을 막았다. 다시 하고, 계속 막히면 기획자에게 알린다.",
};

// 저장소 최상위 기준 경로(rel, "/" 구분)를 판정한다. mainTests 는 origin/main 의 경로 Set.
export function pathReason(rel, mainTests) {
  const hit = PROTECTED.find((path) => rel === path || rel.startsWith(`${path}/`));
  if (hit) return REASON.protectedPath(hit);
  if (TEST_FILE.test(rel) && mainTests.has(rel)) return REASON.existingTest(rel);
  return null;
}

// 커밋 메시지처럼 heredoc 본문과 따옴표 안에 쓴 글자는 빼고 본다.
export function commandReason(command) {
  const bare = command
    .replace(/<<-?\s*\\?(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\n|$|\))/g, "")
    .replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, "");
  return NO_VERIFY.test(bare) ? REASON.noVerify : null;
}
