// PreToolUse 판정. 순수 함수라 git 과 파일을 읽지 않는다. 시험은 policy.test.mjs.
// 실수를 막는 장치다. 셸 문법을 꼬아 돌아가는 길은 CI verify 와 브랜치 보호가 맡는다.
import { posix } from "node:path";

const PROTECTED = [
  ".github",
  ".claude/hooks",
  ".claude/settings.json",
  ".claude/settings.local.json",
];
// 경로로 풀 수 없는 글자($VAR 가 든 단어, 한 줄 코드)는 이 글자가 보이는지로 본다.
const PROTECTED_TEXT =
  /(?:^|[^\w.-])(\.github|\.claude\/hooks|\.claude\/settings(?:\.local)?\.json)(?![\w.-])/;
const TEST_FILE = /\.test\.tsx?$/;
const WRAPPERS = new Set([
  "sudo",
  "env",
  "command",
  "builtin",
  "nohup",
  "time",
  "exec",
  "timeout",
  "nice",
]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash"]);
const INTERPRETERS = new Set(["node", "python", "python3", "ruby", "perl", "deno", "bun"]);
const WRITES_ALL = new Set(["rm", "rmdir", "unlink", "mv", "tee", "touch", "chmod", "truncate"]);
const WRITES_LAST = new Set(["cp", "ln", "install", "rsync"]);
const REMOVES = new Set(["rm", "rmdir", "unlink", "mv"]);
// git checkout, restore 로 이 판에서 가져오는 것은 되돌리기라 막지 않는다.
const SAFE_REFS = new Set(["HEAD", "main", "origin/main"]);
// 한 줄 코드가 파일을 쓰거나 지우는 호출. stdout.write 와 읽기는 잡지 않는다.
const WRITE_API =
  /\b(?:writeFile(?:Sync)?|appendFile(?:Sync)?|createWriteStream|copyFile(?:Sync)?|cpSync|rename(?:Sync)?|unlink(?:Sync)?|rmSync|rmdirSync|truncate(?:Sync)?|symlink(?:Sync)?|chmod(?:Sync)?|write_text|write_bytes|os\.(?:remove|replace)|shutil\.(?:copy\w*|move|rmtree))\s*\(|\bopen\s*\([^)]*,\s*["'][rbt]*[wax+][rbt+]*["']/;

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
  const parts = rel.replace(/\*+/g, "*").split("/");
  const fixed = parts
    .slice(
      0,
      parts.findIndex((part) => /[*?[]/.test(part)),
    )
    .join("/");
  const inside = fixed && pathReason(fixed, mainTests);
  if (inside) return inside;
  let glob;
  try {
    const pattern = parts.map((part) => {
      const body = part
        .replace(/[.+^${}()|\\]/g, "\\$&")
        .replaceAll("*", "[^/]*")
        .replaceAll("?", "[^/]");
      return /^[*?]/.test(part) ? `(?!\\.)${body}` : body;
    });
    glob = new RegExp(`^${pattern.join("/")}$`);
  } catch {
    return null; // 짝 없는 [ 처럼 글롭이 아닌 글자다.
  }
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

// 명령 속 경로 글자를 그 경로를 품은 가장 깊은 worktree 기준 경로로 바꾼다. 저장소 밖이면 null.
function locate(text, cwd, roots) {
  if (text === "" || text.startsWith("~")) return null;
  if (!text.startsWith("/") && cwd === null) return null;
  const absolute = posix.resolve(cwd ?? "/", text);
  let best = null;
  for (const root of roots) {
    const inside = absolute === root || absolute.startsWith(`${root}/`);
    if (inside && (best === null || root.length > best.length)) best = root;
  }
  return best === null ? null : posix.relative(best, absolute);
}

function wordReason(text, cwd, context, removes = false) {
  if (text.includes("$")) {
    const hit = PROTECTED_TEXT.exec(text);
    return hit ? REASON.protectedPath(hit[1]) : null;
  }
  const rel = locate(text, cwd, context.roots);
  if (rel === null) return null;
  if (/[*?[]/.test(rel)) return globReason(rel, context.mainTests, removes);
  return pathReason(rel, context.mainTests, { removes });
}

// heredoc 구분자. <<EOF, <<-EOF, <<'EOF', <<"EOF", <<\EOF 를 알아본다.
function heredocDelimiter(text) {
  const match = /^-?[ \t]*\\?(['"]?)([^\s'";|&<>()\\]+)\1/.exec(text);
  return match ? { delimiter: match[2], length: match[0].length } : null;
}

// text[start] 부터 heredoc 본문을 구분자 줄까지 읽는다. 본문과 그다음 자리를 낸다.
function readHeredocBody(text, start, delimiter) {
  let i = start;
  const body = [];
  while (i < text.length) {
    const end = text.indexOf("\n", i);
    const line = text.slice(i, end === -1 ? text.length : end);
    i = end === -1 ? text.length : end + 1;
    if (line.replace(/^\t+/, "") === delimiter) break;
    body.push(line);
  }
  return { body: body.join("\n"), next: i };
}

// $( 바로 뒤에서 짝이 맞는 ) 자리를 찾는다. 안쪽 따옴표, 괄호, heredoc 본문을 건너뛴다.
function matchParen(text, start) {
  let depth = 1;
  let i = start;
  const pending = [];
  while (i < text.length) {
    const c = text[i];
    if (c === "\\") {
      i += 2;
    } else if (c === "'") {
      const end = text.indexOf("'", i + 1);
      i = end === -1 ? text.length : end + 1;
    } else if (c === '"') {
      i += 1;
      while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
      i += 1;
    } else if (c === "<" && text[i + 1] === "<" && text[i + 2] !== "<") {
      const found = heredocDelimiter(text.slice(i + 2));
      if (found) pending.push(found.delimiter);
      i += 2 + (found ? found.length : 0);
    } else if (c === "\n" && pending.length > 0) {
      i += 1;
      for (const delimiter of pending.splice(0)) i = readHeredocBody(text, i, delimiter).next;
    } else if (c === "(") {
      depth += 1;
      i += 1;
    } else if (c === ")") {
      depth -= 1;
      if (depth === 0) return i;
      i += 1;
    } else {
      i += 1;
    }
  }
  return text.length;
}

// 셸 명령을 단순 명령 단위로 나눈다. 따옴표, 백슬래시, 주석, heredoc, 리다이렉트, 파이프만 알아본다.
// 단어는 { text, quoted }. $( ) 와 백틱 안쪽은 nested 에 넣어 따로 판정한다.
// heredoc 본문은 그 heredoc 을 연 명령의 heredoc 에 붙인다. 인터프리터에 넘긴 코드를 보려고서다.
export function parseCommand(command) {
  const segments = [];
  const nested = [];
  const heredocs = [];
  let segment = { words: [], redirects: [], heredoc: "", pipe: false };
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
  const endSegment = (pipe = false) => {
    endWord();
    target = null;
    segment.pipe = pipe;
    if (segment.words.length > 0 || segment.redirects.length > 0) segments.push(segment);
    segment = { words: [], redirects: [], heredoc: "", pipe: false };
  };
  const substitution = (start) => {
    const end = matchParen(command, start);
    nested.push(command.slice(start, end));
    return end + 1;
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
        if (command[i] === "\\" && i + 1 < command.length) {
          text += command[i + 1];
          i += 2;
        } else if (command[i] === "$" && command[i + 1] === "(") {
          i = substitution(i + 2);
          text += "$()";
        } else {
          text += command[i];
          i += 1;
        }
      }
      add(text, true);
      i += 1;
    } else if (c === "\\") {
      if (next !== "\n") add(next ?? "");
      i += 2;
    } else if (c === "#" && word === null) {
      while (i < command.length && command[i] !== "\n") i += 1;
    } else if (c === "\n") {
      const opened = heredocs.splice(0);
      endSegment();
      i += 1;
      // heredoc 본문은 명령이 아니다. 구분자 줄까지 읽어 그 명령에 붙인다.
      for (const { delimiter, owner } of opened) {
        const { body, next: after } = readHeredocBody(command, i, delimiter);
        owner.heredoc += `${body}\n`;
        i = after;
      }
    } else if (c === "<" && next === "<" && command[i + 2] !== "<") {
      endWord();
      const found = heredocDelimiter(command.slice(i + 2));
      if (found) heredocs.push({ delimiter: found.delimiter, owner: segment });
      i += 2 + (found ? found.length : 0);
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
    } else if (c === "$" && next === "(") {
      endWord();
      i = substitution(i + 2);
    } else if (c === "`") {
      const end = command.indexOf("`", i + 1);
      nested.push(command.slice(i + 1, end === -1 ? command.length : end));
      i = end === -1 ? command.length : end + 1;
    } else if (c === "|" && next !== "|") {
      endSegment(true);
      i += next === "&" ? 2 : 1;
    } else if (";|&()".includes(c)) {
      endSegment();
      i += c === next && (c === "|" || c === "&") ? 2 : 1;
    } else if (c === " " || c === "\t") {
      endWord();
      i += 1;
    } else {
      add(c);
      i += 1;
    }
  }
  endSegment();
  return { segments, nested };
}

// 앞에 붙은 VAR=값 과 sudo, env, xargs 같은 감싸는 명령을 건너뛴 명령 이름의 자리.
function commandIndex(words) {
  let at = 0;
  let wrapped = false;
  let viaXargs = false;
  while (at < words.length) {
    const { text, quoted } = words[at];
    const name = posix.basename(text);
    if (!quoted && /^[A-Za-z_]\w*=/.test(text)) {
      at += 1;
    } else if (WRAPPERS.has(name) || name === "xargs") {
      wrapped = true;
      viaXargs ||= name === "xargs";
      at += 1;
    } else if (wrapped && (text.startsWith("-") || /^\d+[smhd]?$/.test(text))) {
      at += 1;
    } else {
      break;
    }
  }
  return { at, viaXargs };
}

function isWriting(name, bare) {
  if (WRITES_ALL.has(name) || WRITES_LAST.has(name)) return true;
  if (name === "sed") return bare.some((t) => /^-[a-zA-Z]*i/.test(t) || t.startsWith("--in-place"));
  if (name === "perl") return bare.some((t) => /^-(?![MI])[a-zA-Z]*i/.test(t));
  return bare.includes("--write") || bare.includes("--fix");
}

// sed 스크립트와 perl -e 코드는 경로가 아니다. 빈 단어(macOS sed -i '')도 뺀다.
function fileOperands(name, args) {
  const skip = new Set();
  const scriptFlag = name === "perl" ? /^-[a-zA-Z]*e$/ : /^-(?:e|f)$/;
  args.forEach((word, k) => {
    if (!word.quoted && scriptFlag.test(word.text)) skip.add(k + 1);
  });
  const operands = args.filter(
    (word, k) => !skip.has(k) && word.text !== "" && (word.quoted || !word.text.startsWith("-")),
  );
  const hasScriptFlag = skip.size > 0 || args.some((w) => w.text.startsWith("--expression"));
  return name === "sed" && !hasScriptFlag ? operands.slice(1) : operands;
}

// git 의 쓰기 대상과 훅 건너뛰기. -C 는 git 이 볼 폴더를 바꾼다.
function gitReason(args, cwd, context) {
  let k = 0;
  let gitCwd = cwd;
  while (k < args.length && args[k].text.startsWith("-")) {
    if (["-C", "-c", "--git-dir", "--work-tree"].includes(args[k].text)) {
      if (args[k].text === "-C") gitCwd = posix.resolve(gitCwd ?? "/", args[k + 1]?.text ?? "");
      k += 2;
    } else {
      k += 1;
    }
  }
  const sub = args[k]?.text;
  const rest = args.slice(k + 1);
  const bare = rest.filter((word) => !word.quoted).map((word) => word.text);
  if ((sub === "commit" || sub === "push") && bare.includes("--no-verify")) return REASON.noVerify;
  // commit 의 -n 은 --no-verify 와 같다. push 의 -n 은 dry-run 이라 commit 에만 건다.
  if (sub === "commit" && bare.some((text) => /^-[a-zA-Z]*n[a-zA-Z]*$/.test(text))) {
    return REASON.noVerify;
  }

  let paths = [];
  let removes = false;
  if (sub === "rm" || sub === "mv") {
    paths = rest.filter((w) => !w.text.startsWith("-"));
    removes = true;
  } else if (sub === "checkout" || sub === "restore") {
    // 다른 판에서 경로를 가져오면 그 경로를 덮어쓴다. HEAD, main, origin/main 은 되돌리기다.
    let ref = null;
    if (sub === "checkout") {
      const dash = rest.findIndex((w) => !w.quoted && w.text === "--");
      const plain = rest.filter((w, n) => (dash === -1 || n < dash) && !w.text.startsWith("-"));
      if (dash !== -1) {
        ref = plain[0]?.text ?? null;
        paths = rest.slice(dash + 1);
      } else if (plain.length >= 2) {
        ref = plain[0].text;
        paths = plain.slice(1);
      }
    } else {
      const valueAt = new Set();
      rest.forEach((w, n) => {
        if (w.text.startsWith("--source=")) {
          ref = w.text.slice("--source=".length);
        } else if (w.text === "--source" || w.text === "-s") {
          ref = rest[n + 1]?.text ?? null;
          valueAt.add(n + 1);
        }
      });
      paths = rest.filter((w, n) => !valueAt.has(n) && !w.text.startsWith("-"));
    }
    if (ref === null || SAFE_REFS.has(ref)) return null;
  }
  for (const word of paths) {
    const reason = wordReason(word.text, gitCwd, context, removes);
    if (reason) return reason;
  }
  return null;
}

// 한 줄 코드(node -e, python -c)와 인터프리터에 heredoc 으로 넘긴 코드는
// 파일 쓰기 호출과 보호 경로 글자가 함께 보일 때 막는다.
function inlineCodeReason(args, heredoc) {
  const flagged = args.some((word) => !word.quoted && /^-[a-zA-Z]*[ec]$/.test(word.text));
  if (!flagged && !heredoc) return null;
  const code = `${flagged ? args.map((word) => word.text).join(" ") : ""}\n${heredoc}`;
  if (!WRITE_API.test(code)) return null;
  const hit = PROTECTED_TEXT.exec(code);
  return hit ? REASON.protectedPath(hit[1]) : null;
}

// find 는 -delete 나 쓰기 명령을 품은 -exec 가 있을 때 시작 경로를 본다. find . 은 막지 않는다.
function findReason(args, cwd, context) {
  const starts = [];
  for (const word of args) {
    if ((!word.quoted && word.text.startsWith("-")) || word.text === "!") break;
    starts.push(word);
  }
  const exec = args.findIndex((w) => ["-exec", "-execdir", "-ok", "-okdir"].includes(w.text));
  const execName = exec === -1 ? "" : posix.basename(args[exec + 1]?.text ?? "");
  const execBare = exec === -1 ? [] : args.slice(exec + 2).map((w) => w.text);
  const writes =
    args.some((w) => w.text === "-delete") || (exec !== -1 && isWriting(execName, execBare));
  if (!writes) return null;
  for (const word of starts) {
    const reason = wordReason(word.text, cwd, context);
    if (reason) return reason;
  }
  return null;
}

// Bash 명령 하나를 판정한다.
// context 는 { cwd: 절대 경로나 null, roots: 저장소 worktree 최상위 절대 경로들, mainTests }.
export function commandReason(command, context, depth = 0) {
  const { segments, nested } = parseCommand(command);
  let cwd = context.cwd;
  const stack = [];
  for (const [index, { words, redirects, heredoc }] of segments.entries()) {
    for (const text of redirects) {
      const reason = wordReason(text, cwd, context);
      if (reason) return reason;
    }
    const { at, viaXargs } = commandIndex(words);
    if (at >= words.length) continue;
    const name = posix.basename(words[at].text);
    const args = words.slice(at + 1);
    const bare = args.filter((word) => !word.quoted).map((word) => word.text);

    if (name === "cd" || name === "pushd") {
      if (name === "pushd") stack.push(cwd);
      const to = args.find((word) => word.quoted || !word.text.startsWith("-"))?.text;
      const unknown = to === undefined || to.includes("$") || to.startsWith("~");
      cwd = unknown || (cwd === null && !to.startsWith("/")) ? null : posix.resolve(cwd ?? "/", to);
      continue;
    }
    if (name === "popd") {
      cwd = stack.length > 0 ? stack.pop() : null;
      continue;
    }
    if (SHELLS.has(name) || name === "eval") {
      const flag = args.findIndex((word) => !word.quoted && /^-[a-zA-Z]*c$/.test(word.text));
      const code = name === "eval" ? bare.join(" ") : flag === -1 ? heredoc : args[flag + 1]?.text;
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
    if (name === "find") {
      const reason = findReason(args, cwd, context);
      if (reason) return reason;
      continue;
    }
    if (INTERPRETERS.has(name)) {
      const reason = inlineCodeReason(args, heredoc);
      if (reason) return reason;
    }
    if (!isWriting(name, bare)) continue;

    const operands = fileOperands(name, args);
    let targets = operands;
    if (WRITES_LAST.has(name)) {
      // 대상이 폴더면 원본 이름으로 그 안에 생긴다. cp /tmp/hooks .claude/ 는 .claude/hooks 를 덮는다.
      const last = operands.at(-1);
      const base = last?.text.replace(/\/+$/, "");
      const inside = operands
        .slice(0, -1)
        .map((w) => ({ text: `${base}/${posix.basename(w.text)}` }));
      targets = last ? [last, ...inside] : [];
    }
    // xargs 로 부른 쓰기 명령은 바로 앞 파이프 단계의 경로 인자를 대상으로 받는다.
    if (viaXargs && index > 0 && segments[index - 1].pipe) {
      const feed = segments[index - 1].words
        .slice(1)
        .filter((w) => w.quoted || !w.text.startsWith("-"));
      targets = [...targets, ...feed];
    }
    for (const word of targets) {
      const reason = wordReason(word.text, cwd, context, REMOVES.has(name) && !viaXargs);
      if (reason) return reason;
    }
  }
  if (depth < 3) {
    for (const inner of nested) {
      const reason = commandReason(inner, context, depth + 1);
      if (reason) return reason;
    }
  }
  return null;
}
