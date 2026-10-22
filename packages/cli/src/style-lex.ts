/**
 * Small lexers for the style scanner. Both keep string length and newlines intact
 * so offsets map straight back to line/column in the original source.
 */

export interface Comment {
  /** 1-based line the comment starts / ends on. */
  startLine: number;
  endLine: number;
  /** Comment body without delimiters. */
  text: string;
}

export interface Masked {
  /** Source with every comment replaced by spaces (newlines kept). Strings are kept. */
  masked: string;
  comments: Comment[];
}

function lineOf(starts: number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

export function lineStarts(src: string): number[] {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

export function lineCol(starts: number[], offset: number): { line: number; col: number } {
  const line = lineOf(starts, offset);
  return { line, col: offset - starts[line - 1]! + 1 };
}

const REGEX_PREV = "(,=:[!&|?;{";

/**
 * Mask comments in JS/TS/JSX source. Understands '...' and "..." strings (ended by a
 * newline if unterminated, which contains JSX text apostrophes to one line), template
 * literals with nested `${}` and simple regex literals.
 */
export function maskCode(src: string): Masked {
  const n = src.length;
  const starts = lineStarts(src);
  const out = src.split("");
  const comments: Comment[] = [];
  const tpl: number[] = []; // brace depth for each open `${`
  let prevSig = "";

  const addComment = (a: number, b: number, bodyA: number, bodyB: number) => {
    comments.push({ startLine: lineOf(starts, a), endLine: lineOf(starts, Math.max(a, b - 1)), text: src.slice(bodyA, bodyB) });
    for (let k = a; k < b; k++) if (out[k] !== "\n" && out[k] !== "\r") out[k] = " ";
  };
  const skipString = (i: number): number => {
    const q = src[i]!;
    let k = i + 1;
    while (k < n) {
      const c = src[k]!;
      if (c === "\\") k += 2;
      else if (c === q) return k + 1;
      else if (c === "\n") return k;
      else k++;
    }
    return n;
  };
  /** Scan template text from `i` (just after ` or }); returns the index to resume code at. */
  const scanTemplate = (i: number): number => {
    let k = i;
    while (k < n) {
      const c = src[k]!;
      if (c === "\\") k += 2;
      else if (c === "`") return k + 1;
      else if (c === "$" && src[k + 1] === "{") {
        tpl.push(0);
        return k + 2;
      } else k++;
    }
    return n;
  };

  let i = 0;
  while (i < n) {
    const c = src[i]!;
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      let e = src.indexOf("\n", i);
      if (e < 0) e = n;
      addComment(i, e, i + 2, e);
      i = e;
    } else if (c === "/" && d === "*") {
      let e = src.indexOf("*/", i + 2);
      const end = e < 0 ? n : e + 2;
      if (e < 0) e = n;
      addComment(i, end, i + 2, e);
      i = end;
    } else if (c === "'" || c === '"') {
      i = skipString(i);
      prevSig = c;
    } else if (c === "`") {
      i = scanTemplate(i + 1);
      prevSig = "`";
    } else if (c === "{") {
      if (tpl.length) tpl[tpl.length - 1]!++;
      prevSig = c;
      i++;
    } else if (c === "}") {
      if (tpl.length) {
        if (tpl[tpl.length - 1] === 0) {
          tpl.pop();
          i = scanTemplate(i + 1);
          prevSig = "`";
          continue;
        }
        tpl[tpl.length - 1]!--;
      }
      prevSig = c;
      i++;
    } else if (c === "/" && (prevSig === "" || REGEX_PREV.includes(prevSig))) {
      // regex literal: skip to the closing slash on the same line
      let k = i + 1;
      let inClass = false;
      while (k < n && src[k] !== "\n") {
        const ch = src[k]!;
        if (ch === "\\") k += 2;
        else if (ch === "[") {
          inClass = true;
          k++;
        } else if (ch === "]") {
          inClass = false;
          k++;
        } else if (ch === "/" && !inClass) break;
        else k++;
      }
      if (k < n && src[k] === "/") i = k + 1;
      else i++;
      prevSig = "x";
    } else {
      if (c !== " " && c !== "\t" && c !== "\n" && c !== "\r") prevSig = c;
      i++;
    }
  }
  return { masked: out.join(""), comments };
}

/** Mask comments in CSS. Strings are kept; unquoted url(...) is skipped intact. */
export function maskCss(src: string): Masked {
  const n = src.length;
  const starts = lineStarts(src);
  const out = src.split("");
  const comments: Comment[] = [];
  let i = 0;
  while (i < n) {
    const c = src[i]!;
    if (c === "/" && src[i + 1] === "*") {
      let e = src.indexOf("*/", i + 2);
      const end = e < 0 ? n : e + 2;
      if (e < 0) e = n;
      comments.push({ startLine: lineOf(starts, i), endLine: lineOf(starts, Math.max(i, end - 1)), text: src.slice(i + 2, e) });
      for (let k = i; k < end; k++) if (out[k] !== "\n" && out[k] !== "\r") out[k] = " ";
      i = end;
    } else if (c === '"' || c === "'") {
      let k = i + 1;
      while (k < n && src[k] !== c && src[k] !== "\n") k += src[k] === "\\" ? 2 : 1;
      i = k + 1;
    } else if ((c === "u" || c === "U") && /^url\(\s*[^\s"')]/i.test(src.slice(i, i + 12)) && !/[\w-]/.test(src[i - 1] ?? "")) {
      const e = src.indexOf(")", i);
      i = e < 0 ? n : e + 1;
    } else i++;
  }
  return { masked: out.join(""), comments };
}

/** Index of the bracket matching the opener at `open`, skipping quoted strings; -1 if unbalanced. */
export function matchClose(text: string, open: number): number {
  const o = text[open]!;
  const close = o === "(" ? ")" : o === "[" ? "]" : "}";
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i]!;
    if (c === '"' || c === "'" || c === "`") {
      let k = i + 1;
      while (k < text.length && text[k] !== c) k += text[k] === "\\" ? 2 : 1;
      i = k;
    } else if (c === o) depth++;
    else if (c === close && --depth === 0) return i;
  }
  return -1;
}

export interface CssDecl {
  name: string;
  offset: number;
  /** Declared where it is visible app-wide (:root/html/body/:host, @theme, @property). */
  global: boolean;
}

const GLOBAL_HEADER = /(^|[\s,>+~])(:root|html|body|:host)(?![\w-])|^@theme\b|^@property\b/;

/** Collect custom-property declarations from masked CSS, with their scope. */
export function cssDeclarations(masked: string): CssDecl[] {
  const decls: CssDecl[] = [];
  const stack: string[] = [];
  let stmt = 0;
  let paren = 0;
  const isGlobal = () => stack.some((h) => GLOBAL_HEADER.test(h));
  const flush = (end: number) => {
    const text = masked.slice(stmt, end);
    const m = /^(\s*)(--[A-Za-z0-9_-]+)\s*:/.exec(text);
    if (m && stack.length > 0) decls.push({ name: m[2]!, offset: stmt + m[1]!.length, global: isGlobal() });
  };
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i]!;
    if (c === '"' || c === "'") {
      let k = i + 1;
      while (k < masked.length && masked[k] !== c && masked[k] !== "\n") k += masked[k] === "\\" ? 2 : 1;
      i = k;
    } else if (c === "(") paren++;
    else if (c === ")") paren = Math.max(0, paren - 1);
    else if (paren > 0) continue;
    else if (c === "{") {
      const raw = masked.slice(stmt, i);
      const header = raw.trim();
      const pm = /^@property\s+(--[A-Za-z0-9_-]+)/.exec(header);
      if (pm) decls.push({ name: pm[1]!, offset: stmt + raw.indexOf("--"), global: true });
      stack.push(header);
      stmt = i + 1;
    } else if (c === "}") {
      flush(i);
      stack.pop();
      stmt = i + 1;
    } else if (c === ";") {
      flush(i);
      stmt = i + 1;
    }
  }
  return decls;
}
