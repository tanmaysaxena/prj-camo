import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Repo-wide leakage scan. The tokens test only covers packages/tokens; this one walks the whole repository so the docs,
// fixtures, CLI and workflow files cannot name the source product either. Patterns are assembled from fragments so this
// file never matches itself.
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const P = (...parts: string[]) => parts.join("");
const OWNER_EMAIL = P("ttt", "saxena07", "@", "gmail.com");

const LEAK: [string, RegExp][] = [
  ["decision number", new RegExp(P("\\b", "P", "D", "\\d+"))],
  ["dispatch", new RegExp(P("Dis", "patch"))],
  ["source product name", new RegExp(P("mind", "farm"), "i")],
  ["design-tool link", new RegExp(P("fig", "ma\\.com"), "i")],
  ["backend vendor", new RegExp(P("supa", "base|razor", "pay|her", "mes"), "i")],
  ["design-tool node id", new RegExp(P("\\b\\d{3,5}", ":", "\\d{2,6}\\b"))],
];
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith(".tmp")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(json|css|ts|mts|mjs|js|md|yml|yaml)$/.test(name) && name !== "package-lock.json") out.push(p);
  }
  return out;
}

describe("no source-project leakage, whole repository", () => {
  const files = walk(root);

  it("scans the root files, docs, fixtures and both packages", () => {
    const rel = files.map((f) => relative(root, f).split("\\").join("/"));
    expect(rel).toContain("README.md");
    expect(rel.some((f) => f.startsWith("docs/"))).toBe(true);
    expect(rel.some((f) => f.startsWith("fixtures/"))).toBe(true);
    expect(rel.some((f) => f.startsWith("packages/cli/"))).toBe(true);
    expect(rel.some((f) => f.startsWith("packages/tokens/"))).toBe(true);
  });

  for (const [label, re] of LEAK) {
    it(`has no ${label}`, () => {
      const hits: string[] = [];
      for (const f of files) {
        readFileSync(f, "utf8")
          .split(/\r?\n/)
          .forEach((line, i) => {
            if (re.test(line)) hits.push(`${relative(root, f)}:${i + 1}: ${line.trim().slice(0, 100)}`);
          });
      }
      expect(hits).toEqual([]);
    });
  }

  it("has no email address other than the owner's", () => {
    const hits: string[] = [];
    for (const f of files) {
      readFileSync(f, "utf8")
        .split(/\r?\n/)
        .forEach((line, i) => {
          for (const m of line.match(EMAIL) ?? []) {
            if (m !== OWNER_EMAIL) hits.push(`${relative(root, f)}:${i + 1}: ${m}`);
          }
        });
    }
    expect(hits).toEqual([]);
  });
});
