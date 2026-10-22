import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(here, "..");
const tmp = join(here, ".tmp-purge");
const require = createRequire(import.meta.url);

const tokens = JSON.parse(readFileSync(join(pkgDir, "camo.tokens.json"), "utf8")).tokens as Record<
  string,
  { css: string }
>;
const names = Object.values(tokens).map((t) => t.css);
const baseCss = readFileSync(join(pkgDir, "camo-base.css"), "utf8");

function compile(label: string, css: string): string {
  const cssFile = join(tmp, `${label}-base.css`);
  const input = join(tmp, `${label}-in.css`);
  const output = join(tmp, `${label}-out.css`);
  writeFileSync(cssFile, css);
  // source(none): scan no source files at all, so only the CSS itself can keep a variable alive.
  writeFileSync(input, `@import "tailwindcss" source(none);\n@import "./${label}-base.css";\n`);
  const pkgJson = require.resolve("@tailwindcss/cli/package.json");
  const bin = join(dirname(pkgJson), "dist", "index.mjs");
  execFileSync(process.execPath, [bin, "-i", input, "-o", output], { cwd: tmp, stdio: "pipe" });
  return readFileSync(output, "utf8");
}

describe("Tailwind v4 purge", () => {
  beforeAll(() => {
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
  });
  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("keeps every token variable when compiled over an empty content set", () => {
    const out = compile("static", baseCss);
    const missing = names.filter((n) => !new RegExp(`${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`).test(out));
    expect(missing).toEqual([]);
  }, 60_000);

  it("control: the same file with a plain @theme does lose unreferenced variables", () => {
    const out = compile("plain", baseCss.replace(/^@theme static \{/m, "@theme {"));
    const missing = names.filter((n) => !new RegExp(`${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`).test(out));
    // If this were zero, the test above would prove nothing about `static`.
    expect(missing.length).toBeGreaterThan(0);
  }, 60_000);
});
