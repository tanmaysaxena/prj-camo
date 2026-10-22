import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli.js";

const fixtures = resolve(import.meta.dirname, "../../../fixtures");
const f = (n: string) => resolve(fixtures, n);
const realTokens = resolve(import.meta.dirname, "../../tokens/camo.tokens.json");

function run(argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  return main(argv, { out: (s: string) => out.push(String(s)), err: (s: string) => err.push(String(s)) }).then((code) => ({ code, out, err }));
}

describe("camo validate", () => {
  it("exits 0 on a valid config", async () => {
    expect((await run(["validate", "--config", f("min.json"), "--tokens", f("tokens.min.json")])).code).toBe(0);
  });
  it("exits 1 and prints the rule number on errors", async () => {
    const r = await run(["validate", "--config", f("field-15px.json"), "--tokens", f("tokens.min.json")]);
    expect(r.code).toBe(1);
    expect(r.err.join("\n")).toContain("[rule 5]");
  });
  it("exits 0 and prints the warning for build-time tokens", async () => {
    const r = await run(["validate", "--config", f("build-time-warning.json"), "--tokens", f("tokens.min.json")]);
    expect(r.code).toBe(0);
    expect(r.err.join("\n")).toContain("[rule 7]");
  });
  it("exits 2 on bad usage", async () => {
    expect((await run(["validate"])).code).toBe(2);
    expect((await run(["frobnicate"])).code).toBe(2);
  });
});

describe("camo compile", () => {
  it("writes the output, and --check passes then fails after drift", async () => {
    const dir = mkdtempSync(join(tmpdir(), "camo-"));
    const out = join(dir, "camo-override.css");
    const base = ["compile", "--config", f("min.json"), "--tokens", f("tokens.min.json"), "--out", out];
    expect((await run(["compile", "--config", f("min.json"), "--tokens", f("tokens.min.json"), "--out", out, "--check"])).code).toBe(1);
    expect((await run(base)).code).toBe(0);
    const css = readFileSync(out, "utf8");
    expect(css).toContain("--mf-credit-accent: #e0b84c;");
    expect(css).not.toContain("\r");
    expect((await run([...base, "--check"])).code).toBe(0);
    writeFileSync(out, css + "/* drift */\n");
    expect((await run([...base, "--check"])).code).toBe(1);
  });
  it("refuses to compile an invalid config and writes nothing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "camo-"));
    const out = join(dir, "x.css");
    const r = await run(["compile", "--config", f("bad-contrast.json"), "--tokens", f("tokens.min.json"), "--out", out]);
    expect(r.code).toBe(1);
    expect(existsSync(out)).toBe(false);
  });
  it("--check requires --out", async () => {
    expect((await run(["compile", "--config", f("min.json"), "--check"])).code).toBe(2);
  });
});

describe.skipIf(!existsSync(realTokens))("against the real token file", () => {
  it("validates and compiles config.real-min.json", async () => {
    const v = await run(["validate", "--config", f("config.real-min.json")]);
    expect(v.err.join("\n")).not.toContain("error [");
    expect(v.code).toBe(0);
    const dir = mkdtempSync(join(tmpdir(), "camo-"));
    const out = join(dir, "o.css");
    expect((await run(["compile", "--config", f("config.real-min.json"), "--out", out])).code).toBe(0);
    const css = readFileSync(out, "utf8");
    expect(css).toBe(
      "@theme static {\n  --color-surface-primary: #181818;\n  --motion-duration-sheet: 0.35s;\n}\n",
    );
    expect(css).not.toContain("\r");
  });
});
