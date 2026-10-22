import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import { matchesGlob, type StyleResult } from "../src/style.js";
import { lineCol, lineStarts, maskCode, maskCss } from "../src/style-lex.js";
import { findColors } from "../src/style-rules.js";

const fixtures = resolve(import.meta.dirname, "../../../fixtures");
const tokens = resolve(fixtures, "tokens.min.json");

async function run(argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(argv, { out: (s: string) => out.push(String(s)), err: (s: string) => err.push(String(s)) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

async function check(configPath: string, extra: string[] = []) {
  const r = await run(["check", "style", "--config", configPath, "--tokens", tokens, "--json", ...extra]);
  let json: (StyleResult & { ok: boolean }) | undefined;
  try {
    json = JSON.parse(r.out);
  } catch {
    /* usage or config error: no JSON */
  }
  return { ...r, json };
}

const fixtureConfig = (name: string) => resolve(fixtures, "style", name, "camo.check.json");

function tmpCopy(name: string) {
  const dir = mkdtempSync(join(tmpdir(), "camo-style-"));
  cpSync(resolve(fixtures, "style", name), dir, { recursive: true });
  return join(dir, "camo.check.json");
}

function patchConfig(path: string, fn: (c: Record<string, any>) => void) {
  const c = JSON.parse(readFileSync(path, "utf8"));
  fn(c);
  writeFileSync(path, JSON.stringify(c, null, 2));
}

const countsByRule = (r: StyleResult) => Object.fromEntries(Object.entries(r.summary.byRule).map(([k, v]) => [k, v.failing]));

describe("camo check style: fixture apps", () => {
  it("passes a clean app (no false positives on the tricky inputs)", async () => {
    const r = await check(fixtureConfig("clean"));
    expect(r.json!.findings).toEqual([]);
    expect(r.code).toBe(0);
  });

  it("reports every rule on the violations app, with positions", async () => {
    const r = await check(fixtureConfig("violations"));
    expect(r.code).toBe(1);
    expect(countsByRule(r.json!)).toEqual({
      "hardcoded-color": 3,
      "arbitrary-type-size": 2,
      "arbitrary-spacing-radius-shadow": 2,
      "raw-element": 2,
      "inline-style-literal": 2,
      "unknown-var": 1,
      "namespace-redeclare": 1,
    });
    const at = (rule: string) => r.json!.findings.filter((f) => f.rule === rule).map((f) => `${f.path}:${f.line}:${f.col}`);
    expect(at("hardcoded-color")).toEqual(["app/color.tsx:1:19", "app/color.tsx:2:19", "app/color.tsx:3:23"]);
    expect(at("arbitrary-type-size")).toEqual(["app/size.module.css:2:3", "app/size.tsx:2:24"]);
    expect(at("inline-style-literal")).toEqual(["app/inline.tsx:5:17", "app/inline.tsx:7:23"]);
    expect(at("unknown-var")).toEqual(["app/vars.module.css:3:15"]);
    expect(at("namespace-redeclare")).toEqual(["app/redeclare.module.css:2:3"]);
  });

  it("does not flag the colour in a comment, nor the same colour twice (inline-style vs hardcoded-color)", async () => {
    const r = await check(fixtureConfig("violations"));
    expect(r.json!.findings.some((f) => f.snippet === "#ffffff")).toBe(false);
    expect(r.json!.findings.filter((f) => f.path === "app/inline.tsx").every((f) => f.rule === "inline-style-literal")).toBe(true);
  });

  it("an off rule reports nothing, and rule 3 is off by default", async () => {
    const p = tmpCopy("violations");
    patchConfig(p, (c) => {
      c.rules = { "raw-element": { severity: "off" } };
    });
    const r = await check(p);
    const rules = Object.keys(r.json!.summary.byRule);
    expect(rules).not.toContain("raw-element");
    expect(rules).not.toContain("arbitrary-spacing-radius-shadow");
    expect(rules).toContain("hardcoded-color");
  });

  it("raw-element honours a custom element list and allow paths", async () => {
    const p = tmpCopy("violations");
    patchConfig(p, (c) => {
      c.rules["raw-element"] = { elements: ["form"], allow: [{ path: "app/raw.tsx", reason: "demo" }] };
    });
    expect((await check(p)).json!.summary.byRule["raw-element"]).toBeUndefined();
    patchConfig(p, (c) => {
      c.rules["raw-element"] = { elements: ["form"] };
    });
    expect((await check(p)).json!.summary.byRule["raw-element"]!.failing).toBe(1);
  });

  it("camo-ok needs a reason, is scoped to the same or next line, and can name rules", async () => {
    const r = await check(fixtureConfig("escapes"));
    expect(r.code).toBe(1);
    const f = r.json!.findings.map((x) => `${x.rule} ${x.path}:${x.line}`);
    expect(f).toEqual(["hardcoded-color app/ok.tsx:5", "hardcoded-color app/ok.tsx:6", "raw-element app/ok.tsx:12"]);
    const noReason = r.json!.findings.find((x) => x.line === 5)!;
    expect(noReason.message).toContain("needs a reason");
    // the allow-listed legacy path and the two properly escaped colours never appear
    expect(f.some((x) => x.includes("legacy"))).toBe(false);
  });

  it("an unknown-var is resolved by externalVars patterns and the packaged vocabulary", async () => {
    const p = tmpCopy("violations");
    expect((await check(p)).json!.summary.byRule["unknown-var"]!.failing).toBe(1);
    patchConfig(p, (c) => {
      c.externalVars = ["--color-surface-bsae"];
    });
    expect((await check(p)).json!.summary.byRule["unknown-var"]).toBeUndefined();
  });

  it("output is deterministic and text mode groups by rule", async () => {
    const a = await check(fixtureConfig("violations"));
    const b = await check(fixtureConfig("violations"));
    expect(a.out).toBe(b.out);
    const t = await run(["check", "style", "--config", fixtureConfig("violations"), "--tokens", tokens]);
    expect(t.code).toBe(1);
    expect(t.out).toMatch(/^hardcoded-color \(3\)\n {2}app\/color\.tsx:1:19 /);
    expect(t.out).toContain("FAIL");
    expect(t.out.indexOf("hardcoded-color (")).toBeLessThan(t.out.indexOf("namespace-redeclare ("));
  });
});

describe("camo check style: baseline ratchet", () => {
  it("passes when the count matches exactly, and hides baselined findings by default", async () => {
    const r = await check(fixtureConfig("baseline"));
    expect(r.code).toBe(0);
    expect(r.json!.summary.baselined).toBe(2);
    const text = await run(["check", "style", "--config", fixtureConfig("baseline")]);
    expect(text.out).not.toContain("app/a.tsx:1");
    const shown = await run(["check", "style", "--config", fixtureConfig("baseline"), "--show-baselined"]);
    expect(shown.out).toContain("app/a.tsx:1:21");
  });

  it("fails when a baselined file exceeds its count", async () => {
    const p = tmpCopy("baseline");
    patchConfig(p, (c) => (c.baseline[0].count = 1));
    const r = await check(p);
    expect(r.code).toBe(1);
    expect(r.json!.summary.failing).toBe(2);
    expect(r.json!.findings[0]!.message).toContain("baseline allows 1, found 2");
  });

  it("fails on an unbaselined finding", async () => {
    const p = tmpCopy("baseline");
    patchConfig(p, (c) => (c.baseline = []));
    expect((await check(p)).code).toBe(1);
  });

  it("fails on a stale baseline (count higher than actual) with 'tighten baseline'", async () => {
    const p = tmpCopy("baseline");
    patchConfig(p, (c) => (c.baseline[0].count = 3));
    const r = await check(p);
    expect(r.code).toBe(1);
    expect(r.json!.issues).toHaveLength(1);
    expect(r.json!.issues[0]!.kind).toBe("stale");
    expect(r.json!.issues[0]!.message).toContain("tighten baseline");
    // an entry for a file that no longer has findings is stale too
    patchConfig(p, (c) => c.baseline.push({ rule: "raw-element", path: "app/gone.tsx", count: 1, reason: "x" }));
    expect((await check(p)).json!.issues).toHaveLength(2);
  });

  it("fails while a baseline reason is TODO or empty", async () => {
    const p = tmpCopy("baseline");
    patchConfig(p, (c) => (c.baseline[0].reason = "TODO"));
    let r = await check(p);
    expect(r.code).toBe(1);
    expect(r.json!.issues[0]!.kind).toBe("todo-reason");
    patchConfig(p, (c) => (c.baseline[0].reason = "  "));
    r = await check(p);
    expect(r.json!.issues[0]!.kind).toBe("todo-reason");
  });

  it("--update-baseline writes counts with TODO reasons, keeps real reasons, and still fails until filled in", async () => {
    const p = tmpCopy("baseline");
    patchConfig(p, (c) => {
      c.baseline = [];
      c.scan.include = ["app"];
    });
    writeFileSync(join(resolve(p, ".."), "app", "b.module.css"), ".x { font-size: 13px; }\n");
    let r = await check(p, ["--update-baseline"]);
    expect(r.code).toBe(1);
    const written = JSON.parse(readFileSync(p, "utf8"));
    expect(written.baseline).toEqual([
      { rule: "hardcoded-color", path: "app/a.tsx", count: 2, reason: "TODO" },
      { rule: "arbitrary-type-size", path: "app/b.module.css", count: 1, reason: "TODO" },
    ]);
    expect(r.json!.issues.every((i) => i.kind === "todo-reason")).toBe(true);
    // fill the reasons in by hand: now it passes
    patchConfig(p, (c) => c.baseline.forEach((b: any) => (b.reason = "accepted debt")));
    expect((await check(p)).code).toBe(0);
    // fix one finding and update again: the count tightens and the reason is kept
    writeFileSync(join(resolve(p, ".."), "app", "a.tsx"), 'export const one = "#111111";\n');
    r = await check(p, ["--update-baseline"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(readFileSync(p, "utf8")).baseline[0]).toEqual({ rule: "hardcoded-color", path: "app/a.tsx", count: 1, reason: "accepted debt" });
  });
});

describe("camo check style: usage and config errors (exit 2)", () => {
  it("rejects a missing config, bad JSON, unknown rules and reasonless allow entries", async () => {
    expect((await check(resolve(fixtures, "style", "nope.json"))).code).toBe(2);
    const p = tmpCopy("clean");
    writeFileSync(p, "{ not json");
    expect((await check(p)).code).toBe(2);
    const q = tmpCopy("clean");
    patchConfig(q, (c) => (c.rules["no-such-rule"] = { severity: "error" }));
    const bad = await check(q);
    expect(bad.code).toBe(2);
    expect(bad.err).toContain('unknown rule "no-such-rule"');
    const r = tmpCopy("clean");
    patchConfig(r, (c) => (c.rules["raw-element"].allow[0].reason = ""));
    const noReason = await check(r);
    expect(noReason.code).toBe(2);
    expect(noReason.err).toContain("needs a non-empty reason");
    const s = tmpCopy("clean");
    patchConfig(s, (c) => (c.tokenFiles = ["app/missing.css"]));
    expect((await check(s)).code).toBe(2);
  });
  it("rejects bad arguments and an unknown check", async () => {
    expect((await run(["check", "style", "--bogus"])).code).toBe(2);
    expect((await run(["check", "colour"])).code).toBe(2);
    expect((await run(["check"])).code).toBe(2);
    expect((await run(["check", "style", "--config"])).code).toBe(2);
  });
  it("lists the command in the help text", async () => {
    const r = await run(["frobnicate"]);
    expect(r.err).toContain("camo check style");
  });
});

describe("hardcoded-color heuristics", () => {
  const hits = (s: string, kind: "css" | "code" = "code") => findColors(s, kind).map((h) => h.text);
  it("flags hex of 3, 4, 6 and 8 digits and literal colour functions", () => {
    expect(hits('"#fff" "#ffff" "#ffffff" "#ffffffaa"')).toEqual(["#fff", "#ffff", "#ffffff", "#ffffffaa"]);
    expect(hits("rgb(0 0 0 / 50%) hsla(10, 20%, 30%, .5) oklch(0.5 0.1 200) color(srgb 1 0 0)")).toHaveLength(4);
    expect(hits("color-mix(in srgb, #39ff14 18%, #000)")).toEqual(["color-mix(in srgb, #39ff14 18%, #000)"]);
    expect(hits("bg-[#123456] shadow-[0_0_4px_#fff]")).toEqual(["#123456", "#fff"]);
  });
  it("ignores url(), entities, word-attached hashes, ids, anchors and 5/7 digit runs", () => {
    expect(hits("url(#fff) url('#abc') &#123; &#169; issue#123 Fixes #123 id=\"#fade\"")).toEqual([]);
    expect(hits('<a href="#add">x</a> <label htmlFor="#bad">')).toEqual([]);
    expect(hits("#12345 #1234567 #xyz")).toEqual([]);
    expect(hits("#fade { color: red } .a #bed , .b { x: y }", "css")).toEqual([]);
    expect(hits("a { color: #fade; }", "css")).toEqual(["#fade"]);
  });
  it("treats all-digit hex as a colour only in a colour position", () => {
    expect(hits("const c = '#123';")).toEqual(["#123"]);
    expect(hits("see #123 and PR #1234 for details")).toEqual([]);
    expect(hits('title="Closes #456 today"')).toEqual([]);
  });
  it("ignores colour functions without literal values", () => {
    expect(hits("rgb(var(--rgb) / var(--a)) hsl(${h} 50% 50%) rgb(from var(--x) r g b / 0.5)")).toEqual([]);
    expect(hits("color-mix(in oklab, var(--a) 30%, var(--b))")).toEqual([]);
    expect(hits("color-mix(in oklab, var(--a), #fff)")).toHaveLength(1);
    expect(hits("color(x)")).toEqual([]);
  });
  it("flags a literal that sits next to a var()", () => {
    expect(hits("rgb(0 0 0 / var(--a))")).toHaveLength(1);
  });
});

describe("lexers", () => {
  it("masks comments but not strings, keeping offsets and newlines", () => {
    const src = 'const a = "http://x"; // #fff\nconst b = `x ${"//y"} #aaa`; /* #bbb\n#ccc */ const c = /\\/\\/ #ddd/;\n';
    const { masked, comments } = maskCode(src);
    expect(masked).toHaveLength(src.length);
    expect(masked.split("\n")).toHaveLength(src.split("\n").length);
    expect(masked).toContain('"http://x"');
    expect(masked).not.toContain("#fff");
    expect(masked).toContain("#aaa");
    expect(masked).not.toContain("#bbb");
    expect(masked).not.toContain("#ccc");
    expect(comments).toHaveLength(2);
    expect(comments[1]!.startLine).toBe(2);
    expect(comments[1]!.endLine).toBe(3);
  });
  it("does not let a JSX-text apostrophe swallow the following lines", () => {
    const { masked } = maskCode("<p>Don't</p>\nconst a = '#fff'; // c\n");
    expect(masked).toContain("#fff");
    expect(masked).not.toContain("// c");
  });
  it("masks css comments and keeps unquoted url() intact", () => {
    const { masked } = maskCss("a { b: url(http://x/y.png); /* #fff */ c: #000 }");
    expect(masked).toContain("url(http://x/y.png)");
    expect(masked).not.toContain("#fff");
  });
  it("maps offsets to line and column", () => {
    const starts = lineStarts("ab\ncde\nf");
    expect(lineCol(starts, 0)).toEqual({ line: 1, col: 1 });
    expect(lineCol(starts, 4)).toEqual({ line: 2, col: 2 });
    expect(lineCol(starts, 7)).toEqual({ line: 3, col: 1 });
  });
});

describe("matchesGlob", () => {
  it("handles ** and * and plain segment names", () => {
    expect(matchesGlob("app/a/b.test.tsx", "**/*.test.*")).toBe(true);
    expect(matchesGlob("b.test.tsx", "**/*.test.*")).toBe(true);
    expect(matchesGlob("app/ui/Button.tsx", "app/ui/**")).toBe(true);
    expect(matchesGlob("app/uix/Button.tsx", "app/ui/**")).toBe(false);
    expect(matchesGlob("a/node_modules/x/y.ts", "node_modules")).toBe(true);
    expect(matchesGlob("app/x.module.css", "*.module.css")).toBe(true);
    expect(matchesGlob("app/x.css", "app/*.css")).toBe(true);
    expect(matchesGlob("app/sub/x.css", "app/*.css")).toBe(false);
  });
});
