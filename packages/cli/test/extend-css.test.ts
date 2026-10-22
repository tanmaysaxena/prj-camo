import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "../src/compile.js";
import type { CamoConfig, ExtendEntry, TokenFile } from "../src/types.js";
import { validate } from "../src/validate.js";

const fixtures = resolve(import.meta.dirname, "../../../fixtures");
const load = <T>(name: string): T => JSON.parse(readFileSync(resolve(fixtures, name), "utf8")) as T;
const tokens = load<TokenFile>("tokens.min.json");
const rules = (issues: { rule: number }[]) => issues.map((i) => i.rule);
const cfg = (extend: Record<string, ExtendEntry>, prefix?: string): CamoConfig => ({
  schemaVersion: 1, camoVersion: "0.1.0", ...(prefix ? { prefix } : {}), extend,
});

describe("extend with explicit css", () => {
  it("fixture validates with only a buildTime warning, no prefix needed", () => {
    const r = validate(load<CamoConfig>("extend-explicit-css.json"), tokens);
    expect(r.errors).toEqual([]);
    expect(rules(r.warnings)).toEqual([7]);
    expect(r.warnings[0]!.message).toContain("rebuild required");
  });
  it("is emitted inside @theme static, sorted with overrides, no :root block", () => {
    expect(compile(load<CamoConfig>("extend-explicit-css.json"), tokens)).toBe(
      "@theme static {\n  --breakpoint-sm: 40rem;\n  --color-credit-accent: #e0b84c;\n  --color-surface-base: #101414;\n" +
      "  --hero-gradient: linear-gradient(135deg, #101414, color-mix(in srgb, #e0b84c 20%, #000));\n  --shadow-credit-glow: 0 0 12px #e0b84c80;\n}\n",
    );
  });
  it("is deterministic and independent of key order", () => {
    const a = load<CamoConfig>("extend-explicit-css.json");
    const b: CamoConfig = { ...a, extend: Object.fromEntries(Object.entries(a.extend!).reverse()) };
    expect(compile(a, tokens)).toBe(compile(b, tokens));
    expect(compile(a, tokens)).not.toContain("\r");
  });
  it("mixed styles: explicit css in @theme static, prefixed in :root", () => {
    const c = cfg({
      "credit.accent": { kind: "color", value: "#e0b84c" },
      "color.pop": { kind: "color", value: "#ff00aa", css: "--color-pop" },
    }, "mf");
    c.overrides = { "motion.duration.fast": "0.2s" };
    expect(validate(c, tokens).errors).toEqual([]);
    expect(compile(c, tokens)).toBe(
      "@theme static {\n  --color-pop: #ff00aa;\n  --motion-duration-fast: 0.2s;\n}\n:root {\n  --mf-credit-accent: #e0b84c;\n}\n",
    );
  });
  it("overrides of Camo tokens still work unchanged", () => {
    expect(validate(load<CamoConfig>("min.json"), tokens)).toEqual({ errors: [], warnings: [] });
  });

  it("rule 3: explicit css colliding with a Camo token fails", () => {
    const r = validate(load<CamoConfig>("extend-explicit-collision.json"), tokens);
    expect(rules(r.errors)).toEqual([3]);
    expect(r.errors[0]!.message).toContain("--color-surface-base");
  });
  it("rule 3: two extend entries with the same final name fail (explicit vs prefixed too)", () => {
    const dup = cfg({ a: { kind: "color", value: "#fff", css: "--x" }, b: { kind: "color", value: "#000", css: "--x" } });
    expect(rules(validate(dup, tokens).errors)).toEqual([3]);
    const mixed = cfg({ "a.b": { kind: "color", value: "#fff" }, c: { kind: "color", value: "#000", css: "--mf-a-b" } }, "mf");
    expect(rules(validate(mixed, tokens).errors)).toEqual([3]);
  });
  it("rule 2: explicit-css values are kind-checked", () => {
    expect(rules(validate(cfg({ a: { kind: "color", value: "red", css: "--a" } }), tokens).errors)).toEqual([2]);
    expect(rules(validate(cfg({ a: { kind: "length", value: "1rem; x", css: "--a" } }), tokens).errors)).toEqual([2]);
    expect(validate(cfg({ a: { kind: "length", value: "1rem", css: "--a" } }), tokens).errors).toEqual([]);
  });
  it("rejects unsafe or malformed css names", () => {
    for (const css of ["color-x", "--Color", "--a;b", "--a}", "--", "--a b"]) {
      expect(rules(validate(cfg({ a: { kind: "color", value: "#fff", css } }), tokens).errors)).toEqual([0]);
    }
  });
  it("requires a prefix only when an entry lacks css", () => {
    expect(rules(validate(cfg({ a: { kind: "color", value: "#fff" } }), tokens).errors)).toEqual([0]);
    expect(validate(cfg({ a: { kind: "color", value: "#fff", css: "--a" } }), tokens).errors).toEqual([]);
  });
  it("rule 7: warns on a buildTime extend entry, not otherwise", () => {
    const warn = validate(cfg({ a: { kind: "length", value: "40rem", css: "--breakpoint-sm", buildTime: true } }), tokens);
    expect(rules(warn.warnings)).toEqual([7]);
    expect(validate(cfg({ a: { kind: "length", value: "40rem", css: "--a" } }), tokens).warnings).toEqual([]);
  });
  it("kind `other` accepts gradients/calc/color-mix but not ; { }", () => {
    const ok = ["linear-gradient(red, blue)", "calc(100% - 2rem)", "color-mix(in oklch, red 30%, blue)", "url(a.png) center / cover"];
    for (const value of ok) expect(validate(cfg({ a: { kind: "other", value, css: "--a" } }), tokens).errors).toEqual([]);
    for (const value of ["a;b", "a{b", "a}b"]) expect(rules(validate(cfg({ a: { kind: "other", value, css: "--a" } }), tokens).errors)).toEqual([2]);
  });
  it("accepts sensible shadow, font, number and easing values", () => {
    const e = cfg({
      s: { kind: "shadow", value: "0 1px 2px rgba(0,0,0,.4), inset 0 0 0 1px #fff", css: "--s" },
      f: { kind: "font", value: "\"Inter\", system-ui, sans-serif", css: "--f" },
      n: { kind: "number", value: 0.5, css: "--n" },
      e: { kind: "easing", value: "cubic-bezier(0.2, 0, 0, 1)", css: "--e" },
    });
    expect(validate(e, tokens).errors).toEqual([]);
    expect(rules(validate(cfg({ n: { kind: "number", value: "fast", css: "--n" } }), tokens).errors)).toEqual([2]);
    expect(rules(validate(cfg({ e: { kind: "easing", value: "bouncy", css: "--e" } }), tokens).errors)).toEqual([2]);
  });
});
