// PreToolUse: git 훅 건너뛰기, 훅과 CI 설정 고치기, main 에 있는 시험 고치기를 막는다.
// 막으면 stdout 에 permissionDecision deny 를 내고, 통과면 아무것도 내지 않는다.
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { gitTopLevel, readHookInput, runGit } from "./hook-input.mjs";

const PROTECTED = [
  ".claude/hooks",
  ".claude/settings.json",
  ".claude/settings.local.json",
  ".github",
];

const REASON = {
  noVerify:
    "git 훅을 건너뛰는 --no-verify(commit 의 -n)는 쓰지 않는다. 옵션을 빼고 다시 실행하고, 훅이 막으면 그 오류를 고친다.",
  hooksPath:
    "core.hooksPath 를 바꿔 git 훅을 끄지 않는다. 그 설정을 빼고 다시 실행하고, 훅이 막으면 그 오류를 고친다.",
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
// 따옴표, $( ), heredoc 을 알아보는 만큼만 읽는다. 완전한 셸 해석기가 아니다.

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
  const pendingHeredocs = [];
  while (i < text.length) {
    const c = text[i];
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
  }
  nested.push(inner);
  return { inner, next: i };
}

// 명령 문자열을 단순 명령 단위로 나눈다. 각 단위는 { words, redirects }.
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
    } else if (c === ";" || c === "(" || c === ")") {
      endSegment();
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
  return globToRegExp(pattern).test(name);
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

// 단어가 보호 경로와 어떤 관계인지: "inside"(그 경로이거나 안쪽), "ancestor"(그 경로를 품은 폴더), null.
function protectedRelation(word, cwd, root) {
  const expanded = expandVariables(word, cwd);
  if (expanded.includes("$")) {
    // 풀지 못한 변수가 있으면 글자로만 본다.
    const hit = PROTECTED.find((p) => expanded.includes(p));
    return hit ? { relation: "inside", path: hit } : null;
  }
  const absolute = resolve(cwd, expanded);
  const rel = relative(root, absolute);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    const rootWithSep = root.endsWith(sep) ? root : root + sep;
    const absWithSep = absolute.endsWith(sep) ? absolute : absolute + sep;
    return rootWithSep.startsWith(absWithSep) ? { relation: "ancestor", path: PROTECTED[0] } : null;
  }
  const parts = rel === "" ? [] : rel.split(sep);
  for (const path of PROTECTED) {
    const target = path.split("/");
    const length = Math.min(parts.length, target.length);
    let matched = true;
    for (let k = 0; k < length; k += 1) {
      if (!segmentMatches(parts[k], target[k])) {
        matched = false;
        break;
      }
    }
    if (matched) return { relation: parts.length < target.length ? "ancestor" : "inside", path };
  }
  return null;
}

function pathRelativeToRoot(file, root) {
  const rel = relative(root, file);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return rel.split(sep).join("/");
}

// ---------- 명령 검사 ----------

const WRAPPERS = new Set(["sudo", "command", "builtin", "nohup", "time", "exec", "env", "xargs"]);
const REMOVE_COMMANDS = new Set(["rm", "rmdir", "unlink", "shred"]);
const MOVE_COMMANDS = new Set(["mv", "cp", "ln", "install", "rsync"]);
const WRITE_COMMANDS = new Set(["tee", "touch", "chmod", "chown", "truncate", "mkdir"]);
const IN_PLACE_EDITORS = new Set(["sed", "gsed", "perl"]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash"]);
const INTERPRETERS = new Set(["node", "python", "python3", "ruby", "deno", "bun"]);

function stripWrappers(words) {
  // { 명령; } 묶음의 중괄호는 명령 이름이 아니다.
  let rest = words.filter((word) => word !== "{" && word !== "}");
  for (;;) {
    while (rest.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(rest[0])) rest = rest.slice(1);
    if (rest.length > 0 && WRAPPERS.has(basename(rest[0]))) {
      rest = rest.slice(1);
      while (rest.length > 0 && rest[0].startsWith("-")) rest = rest.slice(1);
      continue;
    }
    return rest;
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

function checkGit(args, cwd, root) {
  let k = 0;
  let gitCwd = cwd;
  while (k < args.length && args[k].startsWith("-")) {
    const option = args[k];
    if (option === "-C" || option === "-c") {
      const value = args[k + 1] ?? "";
      if (option === "-C") gitCwd = resolve(gitCwd, expandVariables(value, gitCwd));
      if (option === "-c" && /^core\.hookspath=/i.test(value)) return REASON.hooksPath;
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
      const hit = protectedRelation(word, gitCwd, root);
      if (!hit) continue;
      const isMoveTarget = sub === "mv" && index === paths.length - 1;
      if (hit.relation === "inside") return REASON.protectedPath(hit.path);
      if ((sub === "rm" || sub === "mv") && !isMoveTarget) return REASON.protectedPath(hit.path);
    }
  }
  return null;
}

function checkFileCommand(name, args, cwd, root) {
  const operands = args.filter((word) => !(word.startsWith("-") && word.length > 1));
  if (REMOVE_COMMANDS.has(name)) {
    for (const word of operands) {
      const hit = protectedRelation(word, cwd, root);
      if (hit) return REASON.protectedPath(hit.path);
    }
    return null;
  }
  if (MOVE_COMMANDS.has(name)) {
    const target = operands.at(-1);
    const sources = operands.slice(0, -1);
    for (const word of sources) {
      const hit = protectedRelation(word, cwd, root);
      if (!hit) continue;
      if (hit.relation === "inside" || name === "mv" || name === "rsync") {
        return REASON.protectedPath(hit.path);
      }
    }
    if (target !== undefined) {
      const hit = protectedRelation(target, cwd, root);
      if (hit?.relation === "inside") return REASON.protectedPath(hit.path);
      if (hit?.relation === "ancestor") {
        // 보호 경로의 부모 폴더로 같은 이름을 옮기거나 베끼면 덮어쓴다.
        const targetAbs = resolve(cwd, expandVariables(target, cwd));
        for (const path of PROTECTED) {
          const protectedAbs = resolve(root, path);
          const sameParent = dirname(protectedAbs) === targetAbs;
          const sameName = sources.some(
            (word) => basename(word.replace(/\/+$/, "")) === basename(path),
          );
          if (sameParent && sameName) return REASON.protectedPath(path);
        }
      }
    }
    return null;
  }
  if (WRITE_COMMANDS.has(name)) {
    for (const word of operands) {
      const hit = protectedRelation(word, cwd, root);
      if (hit?.relation === "inside") return REASON.protectedPath(hit.path);
    }
    return null;
  }
  if (name === "dd") {
    for (const word of args.filter((w) => w.startsWith("of="))) {
      const hit = protectedRelation(word.slice(3), cwd, root);
      if (hit?.relation === "inside") return REASON.protectedPath(hit.path);
    }
    return null;
  }
  if (IN_PLACE_EDITORS.has(name)) {
    const inPlace = args.some((word) => /^-[a-zA-Z]*i/.test(word) || word.startsWith("--in-place"));
    if (!inPlace) return null;
    for (const word of operands) {
      const hit = protectedRelation(word, cwd, root);
      if (hit?.relation === "inside") return REASON.protectedPath(hit.path);
    }
  }
  return null;
}

export function checkCommand(command, startCwd, root, depth = 0) {
  if (depth > 5) return null;
  const { segments, nested } = parseCommand(command);
  let cwd = startCwd;
  for (const { words: rawWords, redirects } of segments) {
    for (const { op, target } of redirects) {
      if (!op.includes(">") || op.endsWith("&")) continue;
      const hit = protectedRelation(target, cwd, root);
      if (hit?.relation === "inside") return REASON.protectedPath(hit.path);
    }
    const words = stripWrappers(rawWords);
    if (words.length === 0) continue;
    const name = basename(words[0]);
    const args = words.slice(1);
    let reason = null;
    if (name === "cd") {
      const to = args.find((word) => !word.startsWith("-"));
      cwd = to === undefined ? homedir() : resolve(cwd, expandVariables(to, cwd));
    } else if (name === "git") {
      reason = checkGit(args, cwd, root);
    } else if (SHELLS.has(name)) {
      const index = args.findIndex((word) => /^-[a-zA-Z]*c$/.test(word));
      if (index !== -1 && args[index + 1] !== undefined) {
        reason = checkCommand(args[index + 1], cwd, root, depth + 1);
      }
    } else if (name === "eval") {
      reason = checkCommand(args.join(" "), cwd, root, depth + 1);
    } else if (INTERPRETERS.has(name)) {
      // 한 줄 코드 안에 보호 경로가 보이면 쓰기로 본다.
      const inline = args.some((word) => ["-e", "-c", "--eval", "-p", "--print"].includes(word));
      const hit = inline ? PROTECTED.find((p) => args.some((word) => word.includes(p))) : null;
      if (hit) reason = REASON.protectedPath(hit);
    } else {
      reason = checkFileCommand(name, args, cwd, root);
    }
    if (reason) return reason;
  }
  for (const inner of nested) {
    const reason = checkCommand(inner, cwd, root, depth + 1);
    if (reason) return reason;
  }
  return null;
}

// ---------- 파일 편집 검사 ----------

function checkFileEdit(filePath, root) {
  const rel = pathRelativeToRoot(filePath, root);
  if (rel === null) return null;
  const hit = PROTECTED.find((p) => rel === p || rel.startsWith(`${p}/`));
  if (hit) return REASON.protectedPath(rel);
  if (/\.test\.tsx?$/.test(rel)) {
    const onMain = runGit(root, ["cat-file", "-e", `origin/main:${rel}`]);
    if (onMain.status === 0) return REASON.existingTest(rel);
  }
  return null;
}

// ---------- 시작 ----------

function main() {
  const { input } = readHookInput();
  if (input === null) deny(REASON.badInput);

  const toolName = input.tool_name;
  const toolInput = input.tool_input ?? {};
  const cwd = typeof input.cwd === "string" && input.cwd ? input.cwd : process.cwd();

  if (toolName === "Bash") {
    if (typeof toolInput.command !== "string") deny(REASON.badInput);
    const root = gitTopLevel(cwd);
    if (root === null) return;
    const reason = checkCommand(toolInput.command, cwd, root);
    if (reason) deny(reason);
    return;
  }

  if (toolName === "Edit" || toolName === "Write" || toolName === "MultiEdit") {
    if (typeof toolInput.file_path !== "string" || toolInput.file_path === "")
      deny(REASON.badInput);
    const filePath = resolve(cwd, toolInput.file_path);
    const root = gitTopLevel(dirname(filePath));
    if (root === null) return;
    const reason = checkFileEdit(filePath, root);
    if (reason) deny(reason);
  }
}

try {
  main();
} catch (error) {
  deny(`${REASON.badInput} (${error instanceof Error ? error.message : String(error)})`);
}
