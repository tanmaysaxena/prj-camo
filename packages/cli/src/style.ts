import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { cssDeclarations, lineCol, lineStarts, maskCode, maskCss, type Comment } from "./style-lex.js";
import {
  DEFAULT_OFF,
  DEFAULT_RAW_ELEMENTS,
  RULE_IDS,
  localDeclarations,
  runtimeSetVars,
  ruleArbitrarySpacingRadiusShadow,
  ruleArbitraryTypeSize,
  ruleHardcodedColor,
  ruleInlineStyleLiteral,
  ruleNamespaceRedeclare,
  ruleRawElement,
  ruleUnknownVar,
  type RawFinding,
  type RuleId,
} from "./style-rules.js";
import type { TokenFile } from "./types.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface AllowEntry {
  path: string;
  reason: string;
}
export interface RuleConfig {
  severity?: "error" | "off";
  allow?: AllowEntry[];
  /** raw-element only: JSX tag names to flag. */
  elements?: string[];
  /** unknown-var only: do not report var(--x, fallback). */
  ignoreWithFallback?: boolean;
}
export interface BaselineEntry {
  rule: string;
  path: string;
  count: number;
  reason: string;
}
export interface StyleConfig {
  $schema?: string;
  schemaVersion: 1;
  scan: { include: string[]; exclude?: string[] };
  tokenFiles?: string[];
  overrideFile?: string;
  externalVars?: string[];
  rules?: Partial<Record<RuleId, RuleConfig>>;
  baseline?: BaselineEntry[];
}

export class ConfigError extends Error {}

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;

export function validateStyleConfig(raw: unknown): StyleConfig {
  const errs: string[] = [];
  const c = raw as Record<string, unknown>;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new ConfigError("camo.check.json must be a JSON object");
  const known = new Set(["$schema", "schemaVersion", "scan", "tokenFiles", "overrideFile", "externalVars", "rules", "baseline"]);
  for (const k of Object.keys(c)) if (!known.has(k)) errs.push(`unknown top-level key "${k}"`);
  if (c.schemaVersion !== 1) errs.push("schemaVersion must be 1");
  const strList = (v: unknown, label: string) => {
    if (v === undefined) return;
    if (!Array.isArray(v) || !v.every(isStr)) errs.push(`${label} must be an array of non-empty strings`);
  };
  const scan = c.scan as Record<string, unknown> | undefined;
  if (!scan || typeof scan !== "object") errs.push("scan is required");
  else {
    strList(scan.include, "scan.include");
    if (!Array.isArray(scan.include) || scan.include.length === 0) errs.push("scan.include needs at least one entry");
    strList(scan.exclude, "scan.exclude");
  }
  strList(c.tokenFiles, "tokenFiles");
  strList(c.externalVars, "externalVars");
  if (c.overrideFile !== undefined && !isStr(c.overrideFile)) errs.push("overrideFile must be a non-empty string");
  if (c.rules !== undefined) {
    if (typeof c.rules !== "object" || c.rules === null || Array.isArray(c.rules)) errs.push("rules must be an object");
    else {
      for (const [id, rc] of Object.entries(c.rules as Record<string, unknown>)) {
        if (!(RULE_IDS as readonly string[]).includes(id)) {
          errs.push(`unknown rule "${id}" (known: ${RULE_IDS.join(", ")})`);
          continue;
        }
        const r = rc as Record<string, unknown>;
        if (typeof r !== "object" || r === null) {
          errs.push(`rules.${id} must be an object`);
          continue;
        }
        for (const k of Object.keys(r)) if (!["severity", "allow", "elements", "ignoreWithFallback"].includes(k)) errs.push(`rules.${id}: unknown key "${k}"`);
        if (r.severity !== undefined && r.severity !== "error" && r.severity !== "off") errs.push(`rules.${id}.severity must be "error" or "off"`);
        if (r.allow !== undefined) {
          if (!Array.isArray(r.allow)) errs.push(`rules.${id}.allow must be an array`);
          else
            r.allow.forEach((a, i) => {
              const e = a as Record<string, unknown>;
              if (!e || !isStr(e.path)) errs.push(`rules.${id}.allow[${i}].path must be a non-empty string`);
              if (!e || !isStr(e.reason) || !(e.reason as string).trim()) errs.push(`rules.${id}.allow[${i}] needs a non-empty reason`);
            });
        }
        if (r.elements !== undefined && id !== "raw-element") errs.push(`rules.${id}: "elements" applies to raw-element only`);
        if (r.elements !== undefined) strList(r.elements, `rules.${id}.elements`);
        if (r.ignoreWithFallback !== undefined && (id !== "unknown-var" || typeof r.ignoreWithFallback !== "boolean"))
          errs.push(`rules.${id}.ignoreWithFallback must be a boolean on unknown-var only`);
      }
    }
  }
  if (c.baseline !== undefined) {
    if (!Array.isArray(c.baseline)) errs.push("baseline must be an array");
    else {
      const seen = new Set<string>();
      c.baseline.forEach((b, i) => {
        const e = b as Record<string, unknown>;
        if (!e || typeof e !== "object") return void errs.push(`baseline[${i}] must be an object`);
        if (!(RULE_IDS as readonly string[]).includes(e.rule as string)) errs.push(`baseline[${i}].rule "${String(e.rule)}" is not a known rule`);
        if (!isStr(e.path)) errs.push(`baseline[${i}].path must be a non-empty string`);
        if (!Number.isInteger(e.count) || (e.count as number) < 1) errs.push(`baseline[${i}].count must be an integer >= 1`);
        if (typeof e.reason !== "string") errs.push(`baseline[${i}].reason must be a string`);
        const key = `${String(e.rule)}\0${String(e.path)}`;
        if (seen.has(key)) errs.push(`baseline[${i}] duplicates (${String(e.rule)}, ${String(e.path)})`);
        seen.add(key);
      });
    }
  }
  if (errs.length) throw new ConfigError(errs.map((e) => `config: ${e}`).join("\n"));
  return raw as StyleConfig;
}

// ---------------------------------------------------------------------------
// Globs and files
// ---------------------------------------------------------------------------

const GLOB_CHARS = /[*?]/;

function globToRegex(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

/** Match a root-relative, forward-slash path against a glob or a plain path/segment name. */
export function matchesGlob(path: string, pattern: string): boolean {
  const p = pattern.replace(/^\.\//, "").replace(/\/+$/, "");
  if (!GLOB_CHARS.test(p)) {
    if (path === p || path.startsWith(p + "/")) return true;
    return !p.includes("/") && path.split("/").includes(p);
  }
  const re = globToRegex(p);
  if (re.test(path)) return true;
  return !p.includes("/") && re.test(basename(path));
}

const CSS_EXT = new Set([".css"]);
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);
const JSX_EXT = new Set([".tsx", ".jsx"]);
const SKIP_DIRS = new Set(["node_modules", ".git", ".next"]);

function walk(root: string, rel: string, out: string[]): void {
  const abs = join(root, rel);
  let st;
  try {
    st = statSync(abs);
  } catch {
    return;
  }
  if (st.isFile()) {
    out.push(rel.split("\\").join("/"));
    return;
  }
  const names = readdirSync(abs).sort();
  for (const name of names) {
    if (SKIP_DIRS.has(name)) continue;
    walk(root, rel ? join(rel, name) : name, out);
  }
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

export interface Finding {
  rule: RuleId;
  path: string;
  line: number;
  col: number;
  message: string;
  snippet: string;
  /** "fail" counts against the exit code; "baselined" is covered by an exact-count baseline entry. */
  status: "fail" | "baselined";
}

export interface BaselineIssue {
  kind: "stale" | "todo-reason";
  rule: string;
  path: string;
  message: string;
}

export interface StyleResult {
  findings: Finding[];
  issues: BaselineIssue[];
  summary: {
    filesScanned: number;
    total: number;
    failing: number;
    baselined: number;
    issues: number;
    byRule: Record<string, { total: number; failing: number; baselined: number }>;
  };
  ok: boolean;
  /** Config as it should now be written, when `updateBaseline` ran. */
  updatedBaseline?: BaselineEntry[];
}

interface Marker {
  rules: Set<string> | null;
  reason: string;
  startLine: number;
  endLine: number;
}

function markersOf(comments: Comment[]): Marker[] {
  const out: Marker[] = [];
  for (const c of comments) {
    const m = /camo-ok(?:\(([^)]*)\))?\s*:[ \t]*([^\n]*)/.exec(c.text);
    if (!m) continue;
    const rules = m[1] ? new Set(m[1].split(",").map((s) => s.trim()).filter(Boolean)) : null;
    out.push({ rules, reason: (m[2] ?? "").replace(/\*+\/?\s*$/, "").trim(), startLine: c.startLine, endLine: c.endLine });
  }
  return out;
}

export interface RunOptions {
  root: string;
  config: StyleConfig;
  tokensPath: string;
  updateBaseline?: boolean;
}

function readTokenInfo(tokensPath: string): { vocabulary: Set<string>; baseVars: Set<string> } {
  const tokens = JSON.parse(readFileSync(tokensPath, "utf8")) as TokenFile;
  const vocabulary = new Set<string>();
  for (const t of Object.values(tokens.tokens)) vocabulary.add(t.css);
  const baseVars = new Set(vocabulary);
  const basePath = join(dirname(tokensPath), "camo-base.css");
  if (existsSync(basePath)) {
    for (const n of localDeclarations(maskCss(readFileSync(basePath, "utf8")).masked)) baseVars.add(n);
  }
  return { vocabulary, baseVars };
}

function externalMatcher(list: string[]): (name: string) => boolean {
  const exact = new Set<string>();
  const patterns: RegExp[] = [/^--tw-/];
  for (const e of list) {
    if (e.includes("*")) patterns.push(new RegExp("^" + e.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$"));
    else exact.add(e);
  }
  return (name) => exact.has(name) || patterns.some((p) => p.test(name));
}

const RULE_ORDER = new Map<string, number>(RULE_IDS.map((r, i) => [r, i]));

export function runStyleCheck(opts: RunOptions): StyleResult {
  const { root, config } = opts;
  const rules = config.rules ?? {};
  const exclude = config.scan.exclude ?? [];
  const tokenFilePats = config.tokenFiles ?? [];

  // Files to scan.
  const all: string[] = [];
  for (const inc of config.scan.include) {
    const rel = inc.replace(/^\.\//, "").replace(/\/+$/, "");
    if (!existsSync(join(root, rel))) throw new ConfigError(`config: scan.include entry not found: ${inc}`);
    walk(root, rel, all);
  }
  const files = [...new Set(all)]
    .filter((p) => CSS_EXT.has(extname(p)) || CODE_EXT.has(extname(p)))
    .filter((p) => !exclude.some((g) => matchesGlob(p, g)))
    .sort();

  const isTokenFile = (p: string) => tokenFilePats.some((g) => matchesGlob(p, g));
  const overrideFile = config.overrideFile;
  const isOverrideFile = (p: string) => (overrideFile ? matchesGlob(p, overrideFile) : basename(p) === "camo-ui-override.css");

  // Literal tokenFiles outside the scan list still declare variables.
  const extraTokenFiles: string[] = [];
  for (const g of tokenFilePats) {
    if (GLOB_CHARS.test(g)) continue;
    const rel = g.replace(/^\.\//, "");
    if (!existsSync(join(root, rel))) throw new ConfigError(`config: tokenFiles entry not found: ${g}`);
    if (!files.includes(rel)) extraTokenFiles.push(rel);
  }

  const { vocabulary, baseVars } = readTokenInfo(opts.tokensPath);

  interface Loaded {
    path: string;
    src: string;
    masked: string;
    comments: Comment[];
    kind: "css" | "code";
  }
  const load = (p: string): Loaded => {
    const src = readFileSync(join(root, p), "utf8");
    const kind = CSS_EXT.has(extname(p)) ? "css" : "code";
    const { masked, comments } = kind === "css" ? maskCss(src) : maskCode(src);
    return { path: p, src, masked, comments, kind };
  };
  const loaded = files.map(load);

  // Pass 1: custom properties declared anywhere in the app. A name set in ANY scanned file (a :root rule,
  // a component rule, a Tailwind [--x:..] utility, a style object or gsap.set("--x")) is a component API,
  // not a typo; unknown-var catches names that nothing declares. See docs/style-guard.md.
  const globalVars = new Set(baseVars);
  for (const f of [...loaded, ...extraTokenFiles.map(load)]) {
    for (const n of localDeclarations(f.masked)) globalVars.add(n);
    if (f.kind === "css") for (const d of cssDeclarations(f.masked)) globalVars.add(d.name);
    else for (const n of runtimeSetVars(f.masked)) globalVars.add(n);
  }
  const know = { global: globalVars, external: externalMatcher(config.externalVars ?? []) };

  const sevOf = (id: RuleId) => rules[id]?.severity ?? (DEFAULT_OFF.has(id) ? "off" : "error");
  const allowed = (id: RuleId, p: string) => (rules[id]?.allow ?? []).some((a) => matchesGlob(p, a.path));

  // Pass 2: rules.
  const raw: Finding[] = [];
  for (const f of loaded) {
    const ext = extname(f.path);
    const starts = lineStarts(f.src);
    const markers = markersOf(f.comments);
    const active = (id: RuleId) => sevOf(id) !== "off" && !allowed(id, f.path);
    const exemptTokens = isTokenFile(f.path);
    const per: Partial<Record<RuleId, RawFinding[]>> = {};

    if (active("hardcoded-color") && !exemptTokens) per["hardcoded-color"] = ruleHardcodedColor(f.masked, f.kind);
    if (active("arbitrary-type-size") && !exemptTokens) per["arbitrary-type-size"] = ruleArbitraryTypeSize(f.masked);
    if (active("arbitrary-spacing-radius-shadow") && !exemptTokens) per["arbitrary-spacing-radius-shadow"] = ruleArbitrarySpacingRadiusShadow(f.masked);
    if (active("raw-element") && JSX_EXT.has(ext)) per["raw-element"] = ruleRawElement(f.masked, rules["raw-element"]?.elements ?? DEFAULT_RAW_ELEMENTS);
    if (active("inline-style-literal") && JSX_EXT.has(ext)) per["inline-style-literal"] = ruleInlineStyleLiteral(f.masked);
    if (active("unknown-var")) per["unknown-var"] = ruleUnknownVar(f.masked, know, { ignoreWithFallback: rules["unknown-var"]?.ignoreWithFallback ?? false });
    if (active("namespace-redeclare") && !isOverrideFile(f.path)) per["namespace-redeclare"] = ruleNamespaceRedeclare(f.masked, f.kind, vocabulary);

    // A colour inside an inline style is reported once, by the more specific rule.
    const styleOffsets = new Set((per["inline-style-literal"] ?? []).map((r) => r.offset));
    if (per["hardcoded-color"]) per["hardcoded-color"] = per["hardcoded-color"].filter((r) => !styleOffsets.has(r.offset));

    for (const id of RULE_IDS) {
      for (const r of per[id] ?? []) {
        const { line, col } = lineCol(starts, r.offset);
        const near = markers.filter((m) => line >= m.startLine && line <= m.endLine + 1 && (m.rules === null || m.rules.has(id)));
        if (near.some((m) => m.reason)) continue;
        raw.push({
          rule: id,
          path: f.path,
          line,
          col,
          message: near.length ? `${r.message} (camo-ok found but it needs a reason after the colon)` : r.message,
          snippet: r.snippet,
          status: "fail",
        });
      }
    }
  }

  // Baseline / ratchet.
  const groups = new Map<string, Finding[]>();
  for (const f of raw) {
    const k = `${f.rule}\0${f.path}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(f);
  }
  let baseline = config.baseline ?? [];
  let updatedBaseline: BaselineEntry[] | undefined;
  if (opts.updateBaseline) {
    const prev = new Map(baseline.map((b) => [`${b.rule}\0${b.path}`, b]));
    updatedBaseline = [...groups.entries()]
      .map(([k, list]) => {
        const old = prev.get(k);
        return { rule: list[0]!.rule as string, path: list[0]!.path, count: list.length, reason: old?.reason?.trim() ? old.reason : "TODO" };
      })
      .sort((a, b) => (RULE_ORDER.get(a.rule)! - RULE_ORDER.get(b.rule)!) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    baseline = updatedBaseline;
  }
  const baseMap = new Map(baseline.map((b) => [`${b.rule}\0${b.path}`, b]));
  const issues: BaselineIssue[] = [];
  for (const b of baseline) {
    const actual = groups.get(`${b.rule}\0${b.path}`)?.length ?? 0;
    if (actual < b.count) {
      issues.push({
        kind: "stale",
        rule: b.rule,
        path: b.path,
        message: `baseline allows ${b.count} ${b.rule} finding(s) in ${b.path} but only ${actual} remain; tighten baseline (run camo check style --update-baseline)`,
      });
    }
    if (!b.reason.trim() || b.reason.trim().toUpperCase() === "TODO") {
      issues.push({
        kind: "todo-reason",
        rule: b.rule,
        path: b.path,
        message: `baseline entry for ${b.rule} in ${b.path} has no real reason (empty or TODO); write why this debt is accepted`,
      });
    }
  }
  for (const [k, list] of groups) {
    const b = baseMap.get(k);
    if (b && list.length <= b.count) for (const f of list) f.status = "baselined";
    else if (b) for (const f of list) f.message += ` (baseline allows ${b.count}, found ${list.length})`;
  }

  const findings = raw.sort(
    (a, b) =>
      (RULE_ORDER.get(a.rule)! - RULE_ORDER.get(b.rule)!) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) || a.line - b.line || a.col - b.col,
  );
  issues.sort((a, b) => (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) || (a.kind < b.kind ? -1 : 1));
  const byRule: StyleResult["summary"]["byRule"] = {};
  for (const f of findings) {
    const s = (byRule[f.rule] ??= { total: 0, failing: 0, baselined: 0 });
    s.total++;
    if (f.status === "fail") s.failing++;
    else s.baselined++;
  }
  const failing = findings.filter((f) => f.status === "fail").length;
  return {
    findings,
    issues,
    summary: { filesScanned: files.length, total: findings.length, failing, baselined: findings.length - failing, issues: issues.length, byRule },
    ok: failing === 0 && issues.length === 0,
    updatedBaseline,
  };
}

// ---------------------------------------------------------------------------
// CLI front end
// ---------------------------------------------------------------------------

export const STYLE_USAGE = `  camo check style [--config <camo.check.json>] [--root <dir>] [--tokens <file>] [--json] [--update-baseline] [--show-baselined]
`;

interface StyleArgs {
  config: string;
  root?: string;
  tokens?: string;
  json: boolean;
  updateBaseline: boolean;
  showBaselined: boolean;
}

export function parseStyleArgs(rest: string[]): StyleArgs | string {
  const a: StyleArgs = { config: "camo.check.json", json: false, updateBaseline: false, showBaselined: false };
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i]!;
    if (flag === "--json") a.json = true;
    else if (flag === "--update-baseline") a.updateBaseline = true;
    else if (flag === "--show-baselined") a.showBaselined = true;
    else if (flag === "--config" || flag === "--root" || flag === "--tokens") {
      const v = rest[++i];
      if (v === undefined) return `${flag} needs a value`;
      a[flag.slice(2) as "config" | "root" | "tokens"] = v;
    } else return `unknown argument "${flag}"`;
  }
  return a;
}

export function formatText(r: StyleResult, showBaselined: boolean): string {
  const lines: string[] = [];
  for (const id of RULE_IDS) {
    const list = r.findings.filter((f) => f.rule === id && (showBaselined || f.status === "fail"));
    if (list.length === 0) continue;
    lines.push(`${id} (${list.length})`);
    for (const f of list) lines.push(`  ${f.path}:${f.line}:${f.col}  ${f.message}${f.status === "baselined" ? " [baselined]" : ""}`);
    lines.push("");
  }
  if (r.issues.length) {
    lines.push(`baseline (${r.issues.length})`);
    for (const i of r.issues) lines.push(`  ${i.path}  ${i.message}`);
    lines.push("");
  }
  const s = r.summary;
  const parts = Object.entries(s.byRule).map(([k, v]) => `${k}: ${v.failing} failing / ${v.baselined} baselined`);
  lines.push(`camo check style: ${s.filesScanned} file(s) scanned, ${s.failing} failing, ${s.baselined} baselined, ${s.issues} baseline issue(s)`);
  if (parts.length) lines.push(`  ${parts.join("\n  ")}`);
  lines.push(r.ok ? "ok" : "FAIL");
  return lines.join("\n");
}

/** `camo check style ...`; returns the exit code (0 ok, 1 findings/baseline problems, 2 usage/config). */
export function styleMain(rest: string[], defaultTokens: string, io: { out: (s: string) => void; err: (s: string) => void }): number {
  const args = parseStyleArgs(rest);
  if (typeof args === "string") {
    io.err(`camo: ${args}\nusage:\n${STYLE_USAGE}`);
    return 2;
  }
  const configPath = resolve(args.config);
  let config: StyleConfig;
  let rawConfig: Record<string, unknown>;
  try {
    let text: string;
    try {
      text = readFileSync(configPath, "utf8");
    } catch {
      throw new ConfigError(`cannot read config file: ${configPath}`);
    }
    try {
      rawConfig = JSON.parse(text) as Record<string, unknown>;
    } catch (e) {
      throw new ConfigError(`config file is not valid JSON (${configPath}): ${(e as Error).message}`);
    }
    config = validateStyleConfig(rawConfig);
  } catch (e) {
    io.err(`camo: ${(e as Error).message}`);
    return 2;
  }
  const root = resolve(args.root ?? dirname(configPath));
  let result: StyleResult;
  try {
    result = runStyleCheck({ root, config, tokensPath: resolve(args.tokens ?? defaultTokens), updateBaseline: args.updateBaseline });
  } catch (e) {
    if (e instanceof ConfigError || (e as NodeJS.ErrnoException).code === "ENOENT") {
      io.err(`camo: ${(e as Error).message}`);
      return 2;
    }
    throw e;
  }
  if (args.updateBaseline && result.updatedBaseline) {
    const next = { ...rawConfig, baseline: result.updatedBaseline };
    if (result.updatedBaseline.length === 0) delete (next as Record<string, unknown>).baseline;
    writeFileSync(configPath, JSON.stringify(next, null, 2) + "\n", "utf8");
    io.err(`camo: wrote ${result.updatedBaseline.length} baseline entr${result.updatedBaseline.length === 1 ? "y" : "ies"} to ${relative(process.cwd(), configPath) || configPath}`);
  }
  if (args.json) io.out(JSON.stringify({ ok: result.ok, summary: result.summary, findings: result.findings, issues: result.issues }, null, 2));
  else io.out(formatText(result, args.showBaselined));
  return result.ok ? 0 : 1;
}
