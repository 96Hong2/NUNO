// PreToolUse: git 훅 건너뛰기, 훅과 CI 설정 고치기, main 에 있는 시험 고치기를 막는다.
// 막으면 stdout 에 permissionDecision deny 를 내고, 통과면 아무것도 내지 않는다.
// 실수를 막는 장치다. 셸 문법을 일부러 꼬아 돌아가는 길은 CI verify 와 브랜치 보호가 맡는다.
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { VERIFY_OK_FILE, gitTopLevel, readHookInput, runGit } from "./hook-input.mjs";

const PROTECTED = [
  ".claude/hooks",
  ".claude/settings.json",
  ".claude/settings.local.json",
  ".github",
];
// 풀지 못한 변수가 든 단어는 이 글자가 보이는지로만 판정한다.
const PROTECTED_LITERALS = [...PROTECTED, ".git/config", ".git/hooks", VERIFY_OK_FILE];
const TEST_FILE = /\.test\.tsx?$/i;

const REASON = {
  noVerify:
    "git 훅을 건너뛰는 --no-verify(commit 의 -n)는 쓰지 않는다. 옵션을 빼고 다시 실행하고, 훅이 막으면 그 오류를 고친다.",
  hooksPath:
    "core.hooksPath 를 바꿔 git 훅을 끄지 않는다. 그 설정을 빼고 다시 실행하고, 훅이 막으면 그 오류를 고친다.",
  gitConfigEnv:
    "GIT_CONFIG_* 환경 변수로 git 설정을 넣지 않는다. git 훅을 끌 수 있어서다. 필요한 설정은 git -c 로 넣는다.",
  protectedPath: (path) =>
    `${path} 는 훅과 CI 설정이라 고치지 않는다. 바꿔야 하면 무엇을 왜 바꿀지 기획자에게 묻는다.`,
  existingTest: (path) =>
    `${path} 는 main 에 이미 있는 시험이라 고치지 않는다. 새 시험 파일을 더하거나, 꼭 고쳐야 하면 기획자에게 묻는다.`,
  badInput:
    "훅 입력을 읽지 못해 이 도구 호출을 막았다. 같은 호출을 다시 하고, 계속 막히면 기획자에게 알린다.",
};

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

// ---------- 셸 명령 나누기 ----------
// 따옴표, $( ), heredoc, 주석을 알아보는 만큼만 읽는다. 완전한 셸 해석기가 아니다.

function skipHeredocBody(text, start, delimiters) {
  let i = start;
  for (const delimiter of delimiters) {
    for (;;) {
      if (i >= text.length) return i;
      const end = text.indexOf("\n", i);
      const line = end === -1 ? text.slice(i) : text.slice(i, end);
      i = end === -1 ? text.length : end + 1;
      if (line.replace(/^\t+/, "") === delimiter) break;
    }
  }
  return i;
}

// 주석은 줄 끝까지다. 줄바꿈은 남겨 heredoc 본문 건너뛰기가 그대로 돌게 한다.
function skipComment(text, start) {
  const end = text.indexOf("\n", start);
  return end === -1 ? text.length : end;
}

// text[start] 가 heredoc 연산자 << 바로 뒤일 때 구분자를 읽는다.
function readHeredocDelimiter(text, start) {
  let i = start;
  if (text[i] === "-") i += 1;
  while (text[i] === " " || text[i] === "\t") i += 1;
  const quote = text[i] === "'" || text[i] === '"' ? text[i] : "";
  if (quote) i += 1;
  let word = "";
  while (i < text.length && !/[\s;|&<>()]/.test(text[i]) && text[i] !== quote) {
    word += text[i];
    i += 1;
  }
  if (quote && text[i] === quote) i += 1;
  return { word, next: i };
}

function readDoubleQuoted(text, start, nested) {
  let out = "";
  let i = start;
  while (i < text.length && text[i] !== '"') {
    if (text[i] === "\\" && i + 1 < text.length) {
      out += text[i + 1];
      i += 2;
    } else if (text[i] === "$" && text[i + 1] === "(") {
      const { inner, next } = readParen(text, i + 2, nested);
      out += `$(${inner})`;
      i = next;
    } else {
      out += text[i];
      i += 1;
    }
  }
  return { out, next: i + 1 };
}

// $( 바로 뒤에서 짝이 맞는 ) 까지 읽는다. 안쪽 명령은 nested 에 넣어 따로 검사한다.
function readParen(text, start, nested) {
  let depth = 1;
  let i = start;
  let inner = "";
  let wordStart = true;
  const pendingHeredocs = [];
  while (i < text.length) {
    const c = text[i];
    const startsWord = /[\s;|&()]/.test(c);
    if (c === "#" && wordStart) {
      i = skipComment(text, i);
      continue;
    }
    if (c === "\\" && i + 1 < text.length) {
      inner += c + text[i + 1];
      i += 2;
    } else if (c === "'") {
      const end = text.indexOf("'", i + 1);
      const stop = end === -1 ? text.length : end;
      inner += text.slice(i, stop + 1);
      i = stop + 1;
    } else if (c === '"') {
      const { out, next } = readDoubleQuoted(text, i + 1, nested);
      inner += `"${out.replaceAll('"', '\\"')}"`;
      i = next;
    } else if (c === "<" && text[i + 1] === "<" && text[i + 2] !== "<") {
      const { word, next } = readHeredocDelimiter(text, i + 2);
      if (word) pendingHeredocs.push(word);
      inner += " ";
      i = next;
    } else if (c === "\n" && pendingHeredocs.length > 0) {
      inner += "\n";
      i = skipHeredocBody(text, i + 1, pendingHeredocs.splice(0));
    } else if (c === "(") {
      depth += 1;
      inner += c;
      i += 1;
    } else if (c === ")") {
      depth -= 1;
      i += 1;
      if (depth === 0) break;
      inner += c;
    } else {
      inner += c;
      i += 1;
    }
    wordStart = startsWord;
  }
  nested.push(inner);
  return { inner, next: i };
}

// 명령 문자열을 단순 명령 단위로 나눈다. 각 단위는 { words, redirects }.
// 괄호 서브셸의 시작과 끝은 { subshell: "(" }, { subshell: ")" } 로 넣는다.
export function parseCommand(text) {
  const nested = [];
  const segments = [];
  let words = [];
  let redirects = [];
  let token = null;
  let redirectOp = null;
  const pendingHeredocs = [];
  let expectHeredocWord = false;

  const pushToken = () => {
    if (token === null) return;
    if (expectHeredocWord) {
      pendingHeredocs.push(token);
      expectHeredocWord = false;
    } else if (redirectOp !== null) {
      redirects.push({ op: redirectOp, target: token });
      redirectOp = null;
    } else {
      words.push(token);
    }
    token = null;
  };
  const endSegment = () => {
    pushToken();
    if (words.length > 0 || redirects.length > 0) segments.push({ words, redirects });
    words = [];
    redirects = [];
    redirectOp = null;
  };

  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "\\" && i + 1 < text.length) {
      if (text[i + 1] !== "\n") token = (token ?? "") + text[i + 1];
      i += 2;
    } else if (c === "#" && token === null) {
      i = skipComment(text, i);
    } else if (c === "'") {
      const end = text.indexOf("'", i + 1);
      const stop = end === -1 ? text.length : end;
      token = (token ?? "") + text.slice(i + 1, stop);
      i = stop + 1;
    } else if (c === '"') {
      const { out, next } = readDoubleQuoted(text, i + 1, nested);
      token = (token ?? "") + out;
      i = next;
    } else if (c === "$" && text[i + 1] === "(") {
      const { inner, next } = readParen(text, i + 2, nested);
      token = (token ?? "") + `$(${inner})`;
      i = next;
    } else if (c === "`") {
      const end = text.indexOf("`", i + 1);
      const stop = end === -1 ? text.length : end;
      nested.push(text.slice(i + 1, stop));
      token = (token ?? "") + text.slice(i, stop + 1);
      i = stop + 1;
    } else if (c === " " || c === "\t") {
      pushToken();
      i += 1;
    } else if (c === "\n") {
      endSegment();
      i += 1;
      if (pendingHeredocs.length > 0) i = skipHeredocBody(text, i, pendingHeredocs.splice(0));
    } else if (c === ";") {
      endSegment();
      i += 1;
    } else if (c === "(" || c === ")") {
      endSegment();
      segments.push({ subshell: c });
      i += 1;
    } else if (c === "&" || c === "|") {
      if (c === "&" && text[i + 1] === ">") {
        pushToken();
        const append = text[i + 2] === ">";
        redirectOp = append ? "&>>" : "&>";
        i += append ? 3 : 2;
        continue;
      }
      endSegment();
      i += text[i + 1] === c ? 2 : 1;
    } else if (c === ">" || c === "<") {
      const fd = token !== null && /^\d+$/.test(token) ? token : "";
      if (fd) token = null;
      else pushToken();
      if (text.startsWith("<<<", i)) {
        redirectOp = "<<<";
        i += 3;
        continue;
      }
      let op = c;
      let j = i + 1;
      if (text[j] === c) {
        op += c;
        j += 1;
      }
      if (op === "<<") {
        if (text[j] === "-") j += 1;
        expectHeredocWord = true;
        i = j;
        continue;
      }
      if (text[j] === "|" || text[j] === "&") {
        op += text[j];
        j += 1;
      }
      redirectOp = fd + op;
      i = j;
    } else {
      token = (token ?? "") + c;
      i += 1;
    }
  }
  endSegment();
  return { segments, nested };
}

// ---------- 경로 판정 ----------

function globToRegExp(segment) {
  let pattern = "";
  for (let i = 0; i < segment.length; i += 1) {
    const c = segment[i];
    if (c === "*") pattern += "[^/]*";
    else if (c === "?") pattern += "[^/]";
    else if (c === "[") {
      const end = segment.indexOf("]", i + 1);
      if (end === -1) pattern += "\\[";
      else {
        pattern += `[${segment.slice(i + 1, end).replace(/^!/, "^")}]`;
        i = end;
      }
    } else if (c === "{") {
      const end = segment.indexOf("}", i + 1);
      if (end === -1) pattern += "\\{";
      else {
        const options = segment.slice(i + 1, end).split(",");
        pattern += `(${options.map((o) => o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`;
        i = end;
      }
    } else pattern += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${pattern}$`);
}

function segmentMatches(pattern, name) {
  if (pattern === name) return true;
  if (!/[*?[{]/.test(pattern)) return false;
  // 셸 기본값처럼 . 으로 시작하는 이름은 . 으로 시작하는 패턴만 잡는다.
  if (name.startsWith(".") && !pattern.startsWith(".")) return false;
  try {
    return globToRegExp(pattern).test(name);
  } catch {
    // [z-a] 처럼 정규식이 되지 않는 글롭은 글자 그대로 비교한 결과(다름)로 본다.
    return false;
  }
}

function expandVariables(word, cwd) {
  // 값이 없는 변수는 그대로 두어 글자 비교로 넘긴다.
  const projectDir = process.env.CLAUDE_PROJECT_DIR;
  const expanded = projectDir ? word.replace(/\$\{?CLAUDE_PROJECT_DIR\}?/g, projectDir) : word;
  return expanded
    .replace(/^~(?=\/|$)/, homedir())
    .replace(/\$\{?HOME\}?/g, homedir())
    .replace(/\$\{?PWD\}?/g, cwd);
}

// 있는 가장 가까운 상위 폴더를 실제 경로로 풀고 나머지 이름을 붙인다.
// macOS 는 대소문자를 가리지 않아 .CLAUDE 도 .claude 를 연다. 실제 이름으로 맞춰 비교한다.
function realPath(path) {
  let dir = path;
  const rest = [];
  while (!existsSync(dir)) {
    const parent = dirname(dir);
    if (parent === dir) return path;
    rest.unshift(basename(dir));
    dir = parent;
  }
  try {
    return join(realpathSync.native(dir), ...rest);
  } catch {
    return path;
  }
}

const splitPath = (path) => (path === sep ? [""] : path.split(sep));

function isInside(root, path) {
  const rel = relative(root, path);
  return !(rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel));
}

// 저장소마다 보호 경로의 실제 절대 경로. git 쪽 자리는 worktree 에서도 맞게 git 에게 묻는다.
const protectedCache = new Map();
function protectedPaths(root) {
  if (!protectedCache.has(root)) {
    const list = PROTECTED.map((label) => ({ label, abs: join(root, label) }));
    const gitPaths = runGit(root, [
      "rev-parse",
      "--git-path",
      "config",
      "--git-path",
      "hooks",
      "--git-path",
      VERIFY_OK_FILE,
    ]);
    if (gitPaths.status === 0) {
      for (const line of gitPaths.stdout.split("\n").filter(Boolean)) {
        const abs = realPath(resolve(root, line));
        const label = isInside(root, abs) ? relative(root, abs).split(sep).join("/") : abs;
        list.push({ label, abs });
      }
    }
    protectedCache.set(root, list);
  }
  return protectedCache.get(root);
}

// origin/main 에 있는 시험 파일 목록. origin/main 이 없으면 빈 목록이다.
const testCache = new Map();
function mainTests(root) {
  if (!testCache.has(root)) {
    const listed = runGit(root, ["ls-tree", "-r", "-z", "--name-only", "origin/main"]);
    const files =
      listed.status === 0 ? listed.stdout.split("\0").filter((f) => TEST_FILE.test(f)) : [];
    testCache.set(root, files);
  }
  return testCache.get(root);
}

// 단어가 보호 경로와 어떤 관계인지: "inside"(그 경로이거나 안쪽), "ancestor"(그 경로를 품은 폴더), null.
function protectedRelation(word, cwd, root) {
  const expanded = expandVariables(word, cwd);
  if (expanded.includes("$")) {
    const hit = PROTECTED_LITERALS.find((p) => expanded.includes(p));
    return hit ? { relation: "inside", label: hit } : null;
  }
  const parts = splitPath(realPath(resolve(cwd, expanded)));
  for (const { label, abs } of protectedPaths(root)) {
    const target = splitPath(abs);
    const length = Math.min(parts.length, target.length);
    let matched = true;
    for (let k = 0; k < length; k += 1) {
      if (!segmentMatches(parts[k], target[k])) {
        matched = false;
        break;
      }
    }
    if (matched) return { relation: parts.length < target.length ? "ancestor" : "inside", label };
  }
  return null;
}

// 단어가 origin/main 에 있는 시험 파일을 가리키면 그 경로를 낸다. 글롭도 본다.
function mainTestHit(word, cwd, root) {
  const expanded = expandVariables(word, cwd);
  if (expanded.includes("$")) return null;
  const absolute = realPath(resolve(cwd, expanded));
  if (!isInside(root, absolute)) return null;
  const parts = relative(root, absolute).toLowerCase().split(sep);
  const last = parts.at(-1) ?? "";
  if (!TEST_FILE.test(last) && !/[*?[{]/.test(last)) return null;
  return (
    mainTests(root).find((file) => {
      const names = file.toLowerCase().split("/");
      return names.length === parts.length && names.every((n, k) => segmentMatches(parts[k], n));
    }) ?? null
  );
}

// 쓰는 자리의 단어 하나를 판정한다. ancestor 가 참이면 보호 경로를 품은 폴더도 막는다(지우기, 옮기기 원본).
function guardPath(word, cwd, roots, { ancestor = false } = {}) {
  for (const root of roots) {
    const hit = protectedRelation(word, cwd, root);
    if (hit && (hit.relation === "inside" || ancestor)) return REASON.protectedPath(hit.label);
    const test = mainTestHit(word, cwd, root);
    if (test) return REASON.existingTest(test);
  }
  return null;
}

// ---------- 명령 검사 ----------

const WRAPPERS = new Set([
  "sudo",
  "command",
  "builtin",
  "nohup",
  "time",
  "exec",
  "env",
  "xargs",
  "timeout",
  "nice",
]);
// 감싸는 명령의 옵션 가운데 값을 띄어 받는 것. timeout 은 옵션 뒤에 시간 값이 하나 더 온다.
const WRAPPER_VALUE_OPTIONS = {
  timeout: new Set(["-s", "--signal", "-k", "--kill-after"]),
  nice: new Set(["-n", "--adjustment"]),
};
const REMOVE_COMMANDS = new Set(["rm", "rmdir", "unlink", "shred"]);
const MOVE_COMMANDS = new Set(["mv", "cp", "ln", "install", "rsync"]);
const WRITE_COMMANDS = new Set(["tee", "touch", "chmod", "chown", "truncate", "mkdir"]);
const IN_PLACE_EDITORS = new Set(["sed", "gsed", "perl"]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash"]);
const INTERPRETERS = new Set(["node", "python", "python3", "ruby", "deno", "bun", "perl"]);
// 한 줄 코드 옵션: -e, -c, -p 와 그 묶음(-pe, -ne), --eval=…
const INLINE_CODE_OPTION = /^(?:-[a-zA-Z]*[ecpE]|--eval(?:=.*)?|--print(?:=.*)?)$/s;
// 한 줄 코드가 파일을 쓰거나 지우는지. 읽기(readFileSync, json.load)는 잡지 않는다.
const WRITE_API =
  /\b(?:writeFile|appendFile|createWriteStream|copyFile|cpSync|rename|unlink|rmSync|rmdir|rm|truncate|symlink|chmod|shutil|os\.remove|os\.replace|write_text|write_bytes)|\bopen\s*\([^)]*,\s*["'][^"']*[wax+]/;

const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s;
const GIT_CONFIG_ENV = /^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+|PARAMETERS)$/;

function assignmentReason(word) {
  const match = ASSIGNMENT.exec(word);
  if (!match) return null;
  if (GIT_CONFIG_ENV.test(match[1])) return REASON.gitConfigEnv;
  if (/hookspath/i.test(match[2])) return REASON.hooksPath;
  return null;
}

// 앞에 붙은 VAR=값 과 감싸는 명령을 벗긴다. 벗긴 대입이 git 설정을 넣으면 reason 에 담는다.
function stripWrappers(words) {
  // { 명령; } 묶음의 중괄호는 명령 이름이 아니다.
  let rest = words.filter((word) => word !== "{" && word !== "}");
  let reason = null;
  for (;;) {
    while (rest.length > 0 && ASSIGNMENT.test(rest[0])) {
      reason ??= assignmentReason(rest[0]);
      rest = rest.slice(1);
    }
    const name = rest.length > 0 ? basename(rest[0]) : "";
    if (!WRAPPERS.has(name)) return { words: rest, reason };
    rest = rest.slice(1);
    const valued = WRAPPER_VALUE_OPTIONS[name];
    while (rest.length > 0 && rest[0].startsWith("-")) {
      rest = rest.slice(valued?.has(rest[0]) ? 2 : 1);
    }
    if (name === "timeout" && rest.length > 0) rest = rest.slice(1);
  }
}

function isNoVerifyLong(word) {
  const name = word.split("=")[0];
  return name.length >= "--no-v".length && "--no-verify".startsWith(name);
}

const COMMIT_VALUE_SHORT = "mFcCt";
const COMMIT_OPTIONAL_SHORT = "uS";
const COMMIT_VALUE_LONG = new Set([
  "--message",
  "--file",
  "--reuse-message",
  "--reedit-message",
  "--template",
  "--author",
  "--date",
  "--cleanup",
  "--fixup",
  "--squash",
  "--trailer",
  "--pathspec-from-file",
]);
// git 전역 옵션 가운데 값을 띄어 받는 것. 값을 하위 명령으로 읽지 않게 건너뛴다.
const GIT_VALUE_OPTIONS = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--config-env",
  "--exec-path",
]);

function commitSkipsHooks(args) {
  for (let k = 0; k < args.length; k += 1) {
    const word = args[k];
    if (word === "--") return false;
    if (word.startsWith("--")) {
      if (isNoVerifyLong(word)) return true;
      if (!word.includes("=") && COMMIT_VALUE_LONG.has(word)) k += 1;
      continue;
    }
    if (word.startsWith("-") && word.length > 1) {
      for (let m = 1; m < word.length; m += 1) {
        const flag = word[m];
        if (flag === "n") return true;
        if (COMMIT_OPTIONAL_SHORT.includes(flag)) break;
        if (COMMIT_VALUE_SHORT.includes(flag)) {
          if (m === word.length - 1) k += 1;
          break;
        }
      }
    }
  }
  return false;
}

function checkGit(args, cwd, roots) {
  let k = 0;
  let gitCwd = cwd;
  while (k < args.length && args[k].startsWith("-")) {
    const option = args[k];
    if (GIT_VALUE_OPTIONS.has(option)) {
      const value = args[k + 1] ?? "";
      if (option === "-C") gitCwd = resolve(gitCwd, expandVariables(value, gitCwd));
      if ((option === "-c" || option === "--config-env") && /^core\.hookspath=/i.test(value)) {
        return REASON.hooksPath;
      }
      k += 2;
    } else {
      if (/^--config-env=core\.hookspath=/i.test(option)) return REASON.hooksPath;
      k += 1;
    }
  }
  const sub = args[k];
  const rest = args.slice(k + 1);
  if (sub === "commit" && commitSkipsHooks(rest)) return REASON.noVerify;
  if (sub === "push" && rest.some((word) => word.startsWith("--") && isNoVerifyLong(word))) {
    return REASON.noVerify;
  }
  if (sub === "config") {
    const keyIndex = rest.findIndex((word) => word.toLowerCase() === "core.hookspath");
    const reading = rest.some((word) =>
      ["--get", "--get-all", "get", "--unset", "unset"].includes(word),
    );
    if (keyIndex !== -1 && keyIndex < rest.length - 1 && !reading) return REASON.hooksPath;
  }
  if (sub === "rm" || sub === "mv" || sub === "checkout" || sub === "restore") {
    const paths = rest.filter((word) => !word.startsWith("-"));
    for (const [index, word] of paths.entries()) {
      const isMoveTarget = sub === "mv" && index === paths.length - 1;
      const removes = (sub === "rm" || sub === "mv") && !isMoveTarget;
      const reason = guardPath(word, gitCwd, roots, { ancestor: removes });
      if (reason) return reason;
    }
  }
  return null;
}

// 보호 경로의 부모 폴더로 같은 이름을 옮기거나 베끼면 덮어쓴다.
function overwritesByName(target, sources, cwd, roots) {
  const targetAbs = realPath(resolve(cwd, expandVariables(target, cwd)));
  for (const root of roots) {
    for (const { label, abs } of protectedPaths(root)) {
      const sameName = sources.some((word) => basename(word.replace(/\/+$/, "")) === basename(abs));
      if (dirname(abs) === targetAbs && sameName) return REASON.protectedPath(label);
    }
  }
  return null;
}

function checkFileCommand(name, args, cwd, roots) {
  const operands = args.filter((word) => !(word.startsWith("-") && word.length > 1));
  const firstReason = (words, options) => {
    for (const word of words) {
      const reason = guardPath(word, cwd, roots, options);
      if (reason) return reason;
    }
    return null;
  };
  if (REMOVE_COMMANDS.has(name)) return firstReason(operands, { ancestor: true });
  if (MOVE_COMMANDS.has(name)) {
    // cp, ln, install 은 원본을 읽기만 한다. mv 와 --remove-source-files 를 준 rsync 만 원본을 지운다.
    const target = operands.at(-1);
    const sources = operands.slice(0, -1);
    const removesSource =
      name === "mv" || (name === "rsync" && args.includes("--remove-source-files"));
    if (removesSource) {
      const reason = firstReason(sources, { ancestor: true });
      if (reason) return reason;
    }
    if (target === undefined) return null;
    return firstReason([target]) ?? overwritesByName(target, sources, cwd, roots);
  }
  if (WRITE_COMMANDS.has(name)) return firstReason(operands);
  if (name === "dd") {
    return firstReason(args.filter((w) => w.startsWith("of=")).map((w) => w.slice(3)));
  }
  if (IN_PLACE_EDITORS.has(name)) {
    // perl 의 -Mstrict, -Ilib 에 든 i 는 제자리 편집이 아니다.
    const shortInPlace = name === "perl" ? /^-(?![MI])[a-zA-Z]*i/ : /^-[a-zA-Z]*i/;
    const inPlace = args.some((word) => shortInPlace.test(word) || word.startsWith("--in-place"));
    if (inPlace) return firstReason(operands);
  }
  return null;
}

// node -e, python -c 같은 한 줄 코드는 쓰기 API 와 보호 경로 글자가 함께 보일 때만 막는다.
function checkInlineCode(args) {
  if (!args.some((word) => INLINE_CODE_OPTION.test(word))) return null;
  const code = args.join(" ");
  if (!WRITE_API.test(code)) return null;
  const hit = PROTECTED_LITERALS.find((p) => code.includes(p));
  return hit ? REASON.protectedPath(hit) : null;
}

export function checkCommand(command, startCwd, roots, depth = 0) {
  if (depth > 5) return null;
  const { segments, nested } = parseCommand(command);
  let cwd = startCwd;
  // 괄호 서브셸 안의 cd 는 서브셸이 끝나면 되돌린다.
  const subshellCwds = [];
  for (const segment of segments) {
    if (segment.subshell === "(") {
      subshellCwds.push(cwd);
      continue;
    }
    if (segment.subshell === ")") {
      if (subshellCwds.length > 0) cwd = subshellCwds.pop();
      continue;
    }
    for (const { op, target } of segment.redirects) {
      if (!op.includes(">") || op.endsWith("&")) continue;
      const reason = guardPath(target, cwd, roots);
      if (reason) return reason;
    }
    const { words, reason: envReason } = stripWrappers(segment.words);
    if (envReason) return envReason;
    if (words.length === 0) continue;
    const name = basename(words[0]);
    const args = words.slice(1);
    let reason = null;
    if (name === "cd") {
      const to = args.find((word) => !word.startsWith("-"));
      cwd = to === undefined ? homedir() : resolve(cwd, expandVariables(to, cwd));
    } else if (name === "export") {
      reason = args.map(assignmentReason).find(Boolean) ?? null;
    } else if (name === "git") {
      reason = checkGit(args, cwd, roots);
    } else if (SHELLS.has(name)) {
      const index = args.findIndex((word) => /^-[a-zA-Z]*c$/.test(word));
      if (index !== -1 && args[index + 1] !== undefined) {
        reason = checkCommand(args[index + 1], cwd, roots, depth + 1);
      }
    } else if (name === "eval") {
      reason = checkCommand(args.join(" "), cwd, roots, depth + 1);
    } else {
      if (INTERPRETERS.has(name)) reason = checkInlineCode(args);
      reason ??= checkFileCommand(name, args, cwd, roots);
    }
    if (reason) return reason;
  }
  for (const inner of nested) {
    const reason = checkCommand(inner, cwd, roots, depth + 1);
    if (reason) return reason;
  }
  return null;
}

// ---------- 시작 ----------

// 경로 판정 루트: 주어진 폴더들의 git 최상위. 하나라도 보호 경로에 걸리면 막는다.
function repoRoots(...dirs) {
  const roots = dirs
    .filter((dir) => typeof dir === "string" && dir !== "")
    .map((dir) => gitTopLevel(dir))
    .filter((root) => root !== null)
    .map((root) => realPath(root));
  return [...new Set(roots)];
}

function main() {
  const { input } = readHookInput();
  if (input === null) deny(REASON.badInput);

  const toolName = input.tool_name;
  const toolInput = input.tool_input ?? {};
  const cwd = typeof input.cwd === "string" && input.cwd ? input.cwd : process.cwd();
  const projectDir = process.env.CLAUDE_PROJECT_DIR;

  if (toolName === "Bash") {
    if (typeof toolInput.command !== "string") deny(REASON.badInput);
    // 루트가 하나도 없어도 git 옵션 판정은 돈다.
    const reason = checkCommand(toolInput.command, cwd, repoRoots(cwd, projectDir));
    if (reason) deny(reason);
    return;
  }

  if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(toolName)) {
    const rawPath = toolInput.file_path ?? toolInput.notebook_path;
    if (typeof rawPath !== "string" || rawPath === "") deny(REASON.badInput);
    const filePath = realPath(resolve(cwd, rawPath));
    const roots = repoRoots(dirname(filePath), cwd, projectDir);
    const reason = guardPath(filePath, dirname(filePath), roots);
    if (reason) deny(reason);
  }
}

try {
  main();
} catch (error) {
  deny(`${REASON.badInput} (${error instanceof Error ? error.message : String(error)})`);
}
