import { cssDeclarations, matchClose } from "./style-lex.js";

export const RULE_IDS = [
  "hardcoded-color",
  "arbitrary-type-size",
  "arbitrary-spacing-radius-shadow",
  "raw-element",
  "inline-style-literal",
  "unknown-var",
  "namespace-redeclare",
] as const;
export type RuleId = (typeof RULE_IDS)[number];

/** Rules that are off unless the config turns them on. */
export const DEFAULT_OFF: ReadonlySet<RuleId> = new Set(["arbitrary-spacing-radius-shadow"]);

export const DEFAULT_RAW_ELEMENTS = ["button", "select", "input", "textarea"];

export interface RawFinding {
  rule: RuleId;
  offset: number;
  message: string;
  snippet: string;
}

export interface Span {
  start: number;
  end: number;
}

// ---------------------------------------------------------------------------
// Colour detection (rule 1, reused by rule 5)
// ---------------------------------------------------------------------------

const NAMED_COLORS = [
  "white", "black", "red", "green", "blue", "yellow", "orange", "purple", "pink", "gray", "grey", "silver",
  "gold", "navy", "teal", "aqua", "cyan", "magenta", "maroon", "olive", "lime", "brown", "crimson", "indigo",
  "violet", "tomato", "coral", "salmon", "ivory", "beige", "khaki",
];
const NAMED_RE = new RegExp(`(?<![\\w-])(?:${NAMED_COLORS.join("|")})(?![\\w-])`, "i");
const COLOR_FN_RE = /(?<![\w-])(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color)\(/g;
const COLOR_SPACE_RE = /^\s*(srgb|srgb-linear|display-p3|a98-rgb|prophoto-rgb|rec2020|xyz|xyz-d50|xyz-d65)\b/;
const HEX_RE = /#([0-9a-fA-F]{3,8})(?![\w-])/g;
const ATTR_BEFORE_RE = /(?:href|id|htmlFor|for|to|name|key|xlinkHref|aria-[\w-]+)\s*=\s*\{?["'`]$/;

/** Ranges of url(...) calls. */
export function urlSpans(text: string): Span[] {
  const spans: Span[] = [];
  const re = /(?<![\w-])url\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const open = m.index + m[0].length - 1;
    const close = matchClose(text, open);
    if (close < 0) continue;
    spans.push({ start: m.index, end: close + 1 });
    re.lastIndex = close + 1;
  }
  return spans;
}

const inSpans = (spans: Span[], at: number) => spans.some((s) => at >= s.start && at < s.end);

/** Remove nested var(...) groups and ${...} groups so only literal parts remain. */
function stripDynamic(inner: string): string {
  let out = inner;
  for (let guard = 0; guard < 50; guard++) {
    const m = /(?<![\w-])var\(|\$\{/.exec(out);
    if (!m) break;
    const open = m[0] === "${" ? m.index + 1 : m.index + 3;
    const close = matchClose(out, open);
    out = out.slice(0, m.index) + " " + (close < 0 ? "" : out.slice(close + 1));
  }
  return out;
}

export interface ColorHit {
  index: number;
  length: number;
  text: string;
}

/**
 * Literal colours in `text`: hex, colour functions with numeric literal arguments, and
 * color-mix() containing a literal colour. Ignores url(...), html entities, issue numbers,
 * fragment/id attributes, and (in CSS) hex-looking id selectors.
 */
export function findColors(text: string, kind: "css" | "code"): ColorHit[] {
  const hits: ColorHit[] = [];
  const covered: Span[] = [];
  const urls = urlSpans(text);

  COLOR_FN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = COLOR_FN_RE.exec(text))) {
    if (inSpans(urls, m.index)) continue;
    const name = m[1]!.toLowerCase();
    const open = m.index + m[0].length - 1;
    const close = matchClose(text, open);
    if (close < 0) continue;
    const inner = text.slice(open + 1, close);
    if (name === "color" && !COLOR_SPACE_RE.test(inner)) continue;
    if (inner.includes("${")) continue; // interpolated: not a literal colour
    const rest = stripDynamic(inner);
    if (/(^|[\s,(])from(?![\w-])/.test(rest)) continue;
    let literal: boolean;
    if (name === "color-mix") {
      HEX_RE.lastIndex = 0;
      literal = HEX_RE.test(rest) || NAMED_RE.test(rest) || /(?<![\w-])(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([^)]*\d/i.test(rest);
    } else literal = /\d/.test(rest);
    covered.push({ start: m.index, end: close + 1 });
    COLOR_FN_RE.lastIndex = close + 1;
    if (literal) hits.push({ index: m.index, length: close + 1 - m.index, text: text.slice(m.index, close + 1) });
  }

  HEX_RE.lastIndex = 0;
  while ((m = HEX_RE.exec(text))) {
    const digits = m[1]!;
    const at = m.index;
    if (![3, 4, 6, 8].includes(digits.length)) continue;
    if (inSpans(urls, at) || inSpans(covered, at)) continue;
    const prev = text[at - 1] ?? "";
    if (/[A-Za-z0-9&\\]/.test(prev)) continue;
    const before = text.slice(Math.max(0, at - 40), at);
    if (kind === "css") {
      // A hex-looking id selector (`#fade {`): the next structural character is `{`.
      const tail = text.slice(at + m[0].length, at + m[0].length + 400);
      const nx = tail.search(/[;{}]/);
      if (nx >= 0 && tail[nx] === "{") continue;
    } else {
      if (ATTR_BEFORE_RE.test(before)) continue;
      if (/^\d+$/.test(digits)) {
        const prevSig = before.trimEnd().slice(-1);
        const nextSig = /^\s*(\S?)/.exec(text.slice(at + m[0].length, at + m[0].length + 20))?.[1] ?? "";
        if (!"'\"`(:,=[".includes(prevSig) || /[A-Za-z0-9]/.test(nextSig)) continue;
      }
    }
    hits.push({ index: at, length: m[0].length, text: m[0] });
  }
  return hits.sort((a, b) => a.index - b.index);
}

export function ruleHardcodedColor(masked: string, kind: "css" | "code"): RawFinding[] {
  return findColors(masked, kind).map((h) => ({
    rule: "hardcoded-color" as const,
    offset: h.index,
    message: `hard-coded colour ${clip(h.text)}; use a design token (var(--color-...) / a Tailwind token utility)`,
    snippet: clip(h.text),
  }));
}

// ---------------------------------------------------------------------------
// Rules 2 and 3: arbitrary sizes
// ---------------------------------------------------------------------------

export function ruleArbitraryTypeSize(masked: string): RawFinding[] {
  const out: RawFinding[] = [];
  const push = (m: RegExpExecArray, n: string) => {
    if (Number(n) === 0) return;
    out.push({
      rule: "arbitrary-type-size",
      offset: m.index,
      message: `arbitrary type size ${clip(m[0])}; use the type scale (ds-* classes / a type token)`,
      snippet: clip(m[0]),
    });
  };
  let m: RegExpExecArray | null;
  const tw = /(?<![\w-])text-\[(\d*\.?\d+)(?:px|rem|em)\](?![\w-])/g;
  while ((m = tw.exec(masked))) push(m, m[1]!);
  const css = /(?<![\w-])font-size\s*:\s*(\d*\.?\d+)(?:px|rem|em)(?![\w%-])/g;
  while ((m = css.exec(masked))) push(m, m[1]!);
  const obj = /(?<![\w-])fontSize\s*:\s*["'`](\d*\.?\d+)(?:px|rem|em)["'`]/g;
  while ((m = obj.exec(masked))) push(m, m[1]!);
  return out;
}

export function ruleArbitrarySpacingRadiusShadow(masked: string): RawFinding[] {
  const out: RawFinding[] = [];
  const re = /(?<![\w-])(?:rounded|shadow)(?:-(?:t|r|b|l|s|e|tl|tr|bl|br|ss|se|es|ee|x|y|inset))?-\[[^\]\s]+\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    out.push({
      rule: "arbitrary-spacing-radius-shadow",
      offset: m.index,
      message: `arbitrary value ${clip(m[0])}; use a radius/shadow token`,
      snippet: clip(m[0]),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rule 4: raw elements
// ---------------------------------------------------------------------------

export function ruleRawElement(masked: string, elements: string[]): RawFinding[] {
  if (elements.length === 0) return [];
  const re = new RegExp(`<(${elements.map((e) => e.replace(/[^\w-]/g, "")).join("|")})(?=[\\s/>])`, "g");
  const out: RawFinding[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    out.push({
      rule: "raw-element",
      offset: m.index,
      message: `raw <${m[1]}>; use the design-system primitive`,
      snippet: `<${m[1]}`,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rule 5: inline style literals
// ---------------------------------------------------------------------------

const STYLE_COLOR_KEY =
  /^(color|background|backgroundcolor|backgroundimage|border|bordertop|borderright|borderbottom|borderleft|bordercolor|bordertopcolor|borderrightcolor|borderbottomcolor|borderleftcolor|outline|outlinecolor|fill|stroke|boxshadow|textshadow|caretcolor|accentcolor|stopcolor|floodcolor|textdecorationcolor)$/;

function splitTopLevel(text: string): Array<{ start: number; text: string }> {
  const parts: Array<{ start: number; text: string }> = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '"' || c === "'" || c === "`") {
      let k = i + 1;
      while (k < text.length && text[k] !== c) k += text[k] === "\\" ? 2 : 1;
      i = k;
    } else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      parts.push({ start, text: text.slice(start, i) });
      start = i + 1;
    }
  }
  parts.push({ start, text: text.slice(start) });
  return parts;
}

/** Colours in a style value expression: literal colours plus named colours inside string literals. */
function valueColors(value: string): ColorHit[] {
  const hits = findColors(value, "code");
  const strRe = /(["'`])((?:\\.|(?!\1).)*)\1/g;
  let m: RegExpExecArray | null;
  while ((m = strRe.exec(value))) {
    const body = stripDynamic(m[2]!);
    const nm = NAMED_RE.exec(body);
    if (nm && !/var\(/.test(m[2]!.slice(0, nm.index).slice(-4))) {
      hits.push({ index: m.index + 1 + (m[2]!.indexOf(nm[0]) >= 0 ? m[2]!.indexOf(nm[0]) : 0), length: nm[0].length, text: nm[0] });
    }
  }
  return hits;
}

export function ruleInlineStyleLiteral(masked: string): RawFinding[] {
  const out: RawFinding[] = [];
  const re = /style\s*=\s*\{\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    const open = m.index + m[0].length - 1;
    const close = matchClose(masked, open);
    if (close < 0) continue;
    const body = masked.slice(open + 1, close);
    for (const prop of splitTopLevel(body)) {
      const pm = /^(\s*)(?:["'`]?)([A-Za-z][\w-]*)(?:["'`]?)\s*:\s*/.exec(prop.text);
      if (!pm) continue;
      if (!STYLE_COLOR_KEY.test(pm[2]!.replace(/-/g, "").toLowerCase())) continue;
      const valueStart = open + 1 + prop.start + pm[0].length;
      const value = prop.text.slice(pm[0].length);
      for (const h of valueColors(value)) {
        out.push({
          rule: "inline-style-literal",
          offset: valueStart + h.index,
          message: `inline style "${pm[2]}" uses literal colour ${clip(h.text)}; use var(--token) or a prop`,
          snippet: clip(h.text),
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rules 6 and 7: custom properties
// ---------------------------------------------------------------------------

const VAR_RE = /(?<![\w-])var\(\s*(--[A-Za-z0-9_-]+)(?![\w$-])/g;
const LOCAL_DECL_RE = /(--[A-Za-z0-9_-]+)["'`]?\s*:/g;

/** Names set locally in a file: `--x:` in a rule, `"--x":` in a style object, setProperty, @property. */
export function localDeclarations(masked: string): Set<string> {
  const names = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(LOCAL_DECL_RE.source, "g");
  while ((m = re.exec(masked))) names.add(m[1]!);
  const sp = /setProperty\(\s*["'`](--[A-Za-z0-9_-]+)/g;
  while ((m = sp.exec(masked))) names.add(m[1]!);
  const pr = /@property\s+(--[A-Za-z0-9_-]+)/g;
  while ((m = pr.exec(masked))) names.add(m[1]!);
  return names;
}

export interface VarKnowledge {
  /** Declared app-wide: tokenFiles, packaged files, @property/@theme/:root in scanned CSS. */
  global: Set<string>;
  external: (name: string) => boolean;
}

/** Names set from code as string literals ("--x"): style objects, gsap.set, setProperty. */
export function runtimeSetVars(masked: string): Set<string> {
  const names = new Set<string>();
  const re = /["'`](--[A-Za-z0-9_-]+)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) names.add(m[1]!);
  return names;
}

export function ruleUnknownVar(masked: string, know: VarKnowledge, opts: { ignoreWithFallback: boolean; extraLocal?: Set<string> }): RawFinding[] {
  const local = localDeclarations(masked);
  for (const n of opts.extraLocal ?? []) local.add(n);
  const out: RawFinding[] = [];
  const re = new RegExp(VAR_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    const name = m[1]!;
    if (know.global.has(name) || local.has(name) || know.external(name)) continue;
    if (opts.ignoreWithFallback && /^\s*,/.test(masked.slice(m.index + m[0].length, m.index + m[0].length + 8))) continue;
    out.push({
      rule: "unknown-var",
      offset: m.index,
      message: `var(${name}) is not declared by any token file, the Camo base, this file, or externalVars (typo or renamed token?)`,
      snippet: `var(${name})`,
    });
  }
  return out;
}

export function ruleNamespaceRedeclare(masked: string, kind: "css" | "code", vocabulary: Set<string>): RawFinding[] {
  const out: RawFinding[] = [];
  const decls: Array<{ name: string; offset: number }> = [];
  if (kind === "css") decls.push(...cssDeclarations(masked));
  else {
    const re = new RegExp(LOCAL_DECL_RE.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(masked))) decls.push({ name: m[1]!, offset: m.index });
  }
  for (const d of decls) {
    if (!vocabulary.has(d.name)) continue;
    out.push({
      rule: "namespace-redeclare",
      offset: d.offset,
      message: `${d.name} is part of the Camo vocabulary and may only be set in the generated override file (camo.config.json overrides)`,
      snippet: d.name,
    });
  }
  return out;
}

function clip(s: string): string {
  const one = s.replace(/\s+/g, " ");
  return one.length > 60 ? one.slice(0, 57) + "..." : one;
}
