import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "../src/compile.js";
import type { CamoConfig, TokenFile } from "../src/types.js";
import { contrastRatio, parseHexColor, validate } from "../src/validate.js";

const fixtures = resolve(import.meta.dirname, "../../../fixtures");
const load = <T>(name: string): T => JSON.parse(readFileSync(resolve(fixtures, name), "utf8")) as T;
const tokens = load<TokenFile>("tokens.min.json");
const run = (name: string) => validate(load<CamoConfig>(name), tokens);
const rules = (issues: { rule: number }[]) => issues.map((i) => i.rule);

describe("validate: valid config", () => {
  it("min.json has no errors or warnings", () => {
    expect(run("min.json")).toEqual({ errors: [], warnings: [] });
  });
  it("an empty config is valid", () => {
    const empty: CamoConfig = { schemaVersion: 1, camoVersion: "0.1.0", prefix: "mf" };
    expect(validate(empty, tokens)).toEqual({ errors: [], warnings: [] });
  });
});

describe("rule 1: vocabulary lock", () => {
  it("fails on an unknown/removed token", () => {
    const r = run("removed-token.json");
    expect(rules(r.errors)).toEqual([1]);
    expect(r.errors[0]!.message).toContain("color.legacy.accent");
  });
  it("passes for a real token", () => {
    expect(rules(run("min.json").errors)).not.toContain(1);
  });
});

describe("rule 2: kind match", () => {
  it("fails on a non-color value for a color token", () => {
    expect(rules(run("wrong-kind.json").errors)).toEqual([2]);
  });
  it("fails on a bad extend value", () => {
    const cfg: CamoConfig = { schemaVersion: 1, camoVersion: "0.1.0", prefix: "mf", extend: { "a.b": { kind: "duration", value: "red" } } };
    expect(rules(validate(cfg, tokens).errors)).toEqual([2]);
  });
  it("rejects values that could break out of a declaration", () => {
    const cfg: CamoConfig = { schemaVersion: 1, camoVersion: "0.1.0", prefix: "mf", overrides: { "shadow.card": "0 0 red; } body { x: y" } };
    expect(rules(validate(cfg, tokens).errors)).toEqual([2]);
  });
  it("accepts durations, easings, lengths and numbers", () => {
    const cfg: CamoConfig = {
      schemaVersion: 1, camoVersion: "0.1.0", prefix: "mf",
      overrides: { "motion.duration.fast": "120ms", "motion.easing.standard": "ease-out", "breakpoint.lg": "1024px" },
    };
    expect(validate(cfg, tokens).errors).toEqual([]);
  });
});

describe("rule 3: extend collisions", () => {
  it("fails when an extend var equals a Camo css name", () => {
    const r = run("extend-collision.json");
    expect(rules(r.errors)).toEqual([3]);
    expect(r.errors[0]!.message).toContain("--color-surface-base");
  });
  it("passes with a distinct prefix", () => {
    expect(rules(run("min.json").errors)).not.toContain(3);
  });
});

describe("rule 4: contrast", () => {
  it("fails when overrides drop a pair below min", () => {
    const r = run("bad-contrast.json");
    expect(rules(r.errors)).toEqual([4, 4]);
    expect(r.errors[0]!.message).toMatch(/:1, below the required 4.5:1/);
  });
  it("fails when the page background has alpha", () => {
    const r = run("alpha-on-page-bg.json");
    expect(r.errors.length).toBeGreaterThan(0);
    expect(rules(r.errors).every((x) => x === 4)).toBe(true);
    expect(r.errors[0]!.message).toContain("opaque");
  });
  it("blends an alpha foreground over the effective surface", () => {
    // White at 50% over black is ~#808080: luminance 0.2159, ratio ~5.3, passes 4.5 but not 7.
    const t: TokenFile = {
      schemaVersion: 1,
      tokens: {
        "color.surface.base": { css: "--a", kind: "color", value: "#000000" },
        "color.content.x": { css: "--b", kind: "color", value: "#ffffff80" },
      },
      contrastPairs: [{ fg: "color.content.x", bg: "color.surface.base", min: 4.5 }],
    };
    const cfg: CamoConfig = { schemaVersion: 1, camoVersion: "0.1.0", prefix: "mf" };
    expect(validate(cfg, t).errors).toEqual([]);
    t.contrastPairs![0]!.min = 7;
    expect(rules(validate(cfg, t).errors)).toEqual([4]);
  });
  it("computes WCAG ratios exactly at the extremes", () => {
    const black = parseHexColor("#000")!;
    const white = parseHexColor("#ffffff")!;
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
  });
  it("parses only hex colors", () => {
    expect(parseHexColor("#abc")).toEqual({ r: 170, g: 187, b: 204, a: 1 });
    expect(parseHexColor("#00000080")!.a).toBeCloseTo(0.502, 2);
    expect(parseHexColor("rgb(0,0,0)")).toBeNull();
    expect(parseHexColor("#abcd")).toBeNull();
  });
});

describe("rule 5: form field floor", () => {
  it("fails below 16px", () => {
    const r = run("field-15px.json");
    expect(rules(r.errors)).toEqual([5]);
  });
  it("fails for 0.9rem and passes for 1rem and 17px", () => {
    const mk = (v: string): CamoConfig => ({ schemaVersion: 1, camoVersion: "0.1.0", prefix: "mf", overrides: { "typography.field.size": v } });
    expect(rules(validate(mk("0.9rem"), tokens).errors)).toEqual([5]);
    expect(validate(mk("1rem"), tokens).errors).toEqual([]);
    expect(validate(mk("17px"), tokens).errors).toEqual([]);
  });
});

describe("rule 6: motion overrides never change the engine", () => {
  it("fails when a motion token is not duration/easing/number", () => {
    const r = run("engine-override.json");
    expect(rules(r.errors)).toEqual([6]);
  });
  it("fails when a motion value names an engine", () => {
    const cfg: CamoConfig = { schemaVersion: 1, camoVersion: "0.1.0", prefix: "mf", overrides: { "motion.easing.standard": "gsap" } };
    expect(rules(validate(cfg, tokens).errors)).toEqual([6]);
  });
  it("passes for a plain duration override", () => {
    expect(rules(run("min.json").errors)).not.toContain(6);
  });
});

describe("rule 7: build-time warning", () => {
  it("warns, without erroring, on a buildTime override", () => {
    const r = run("build-time-warning.json");
    expect(r.errors).toEqual([]);
    expect(rules(r.warnings)).toEqual([7]);
    expect(r.warnings[0]!.message).toContain("rebuild required");
  });
  it("does not warn otherwise", () => {
    expect(run("min.json").warnings).toEqual([]);
  });
});

describe("compile", () => {
  it("emits sorted deltas in @theme static and :root", () => {
    const cfg = load<CamoConfig>("min.json");
    expect(compile(cfg, tokens)).toBe(
      "@theme static {\n  --color-surface-base: #101414;\n  --motion-duration-fast: 0.2s;\n}\n:root {\n  --mf-credit-accent: #e0b84c;\n}\n",
    );
  });
  it("is byte-identical on repeated runs and independent of key order", () => {
    const cfg = load<CamoConfig>("min.json");
    const reordered: CamoConfig = { ...cfg, overrides: { "motion.duration.fast": "0.2s", "color.surface.base": "#101414" } };
    expect(compile(cfg, tokens)).toBe(compile(cfg, tokens));
    expect(compile(reordered, tokens)).toBe(compile(cfg, tokens));
  });
  it("has no CR and ends with exactly one LF", () => {
    for (const name of ["min.json", "build-time-warning.json"]) {
      const css = compile(load<CamoConfig>(name), tokens);
      expect(css).not.toContain("\r");
      expect(css.endsWith("\n")).toBe(true);
      expect(css.endsWith("\n\n")).toBe(false);
    }
  });
  it("emits an empty-but-valid output for no overrides", () => {
    const cfg: CamoConfig = { schemaVersion: 1, camoVersion: "0.1.0", prefix: "mf", overrides: {} };
    expect(compile(cfg, tokens)).toBe("/* camo: no overrides */\n");
  });
  it("emits only the blocks that have content", () => {
    const cfg: CamoConfig = { schemaVersion: 1, camoVersion: "0.1.0", prefix: "mf", overrides: { "breakpoint.lg": "70rem" } };
    expect(compile(cfg, tokens)).toBe("@theme static {\n  --breakpoint-lg: 70rem;\n}\n");
  });
});
