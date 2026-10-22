import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(here, "..");
const tokensPath = join(pkgDir, "camo.tokens.json");
const cssPath = join(pkgDir, "camo-base.css");

const KINDS = ["color", "length", "duration", "easing", "shadow", "font", "number", "other"];

interface Token {
  css: string;
  kind: string;
  value: string;
  buildTime?: boolean;
}
interface Pair {
  fg: string;
  bg: string;
  min: number;
}
const doc = JSON.parse(readFileSync(tokensPath, "utf8")) as {
  schemaVersion: number;
  tokens: Record<string, Token>;
  contrastPairs: Pair[];
  color_light_mode: Record<string, unknown>;
};
const css = readFileSync(cssPath, "utf8");
const entries = Object.entries(doc.tokens);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Body of the single `@theme static { ... }` block (it contains no nested braces). */
function themeBlock(): string {
  const m = /^@theme static \{([^}]*)\}/m.exec(css);
  if (!m) throw new Error("no `@theme static` block found");
  return m[1];
}

function parseColor(hex: string): { r: number; g: number; b: number; a: number } {
  const h = hex.slice(1);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
  };
}
function luminance(c: { r: number; g: number; b: number }): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}
/** Contrast of fg over bg, with fg's alpha blended over the base surface (the CLI's rule). */
function contrast(fgKey: string, bgKey: string): number {
  const base = parseColor(doc.tokens["color.surface.base"].value);
  const blend = (c: ReturnType<typeof parseColor>) => ({
    r: c.r * c.a + base.r * (1 - c.a),
    g: c.g * c.a + base.g * (1 - c.a),
    b: c.b * c.a + base.b * (1 - c.a),
  });
  const fg = luminance(blend(parseColor(doc.tokens[fgKey].value)));
  const bg = luminance(blend(parseColor(doc.tokens[bgKey].value)));
  const [hi, lo] = fg > bg ? [fg, bg] : [bg, fg];
  return (hi + 0.05) / (lo + 0.05);
}

describe("camo.tokens.json shape", () => {
  it("has schemaVersion 1 and the reserved empty light-mode block", () => {
    expect(doc.schemaVersion).toBe(1);
    expect(doc.color_light_mode).toEqual({});
  });

  it("has no duplicate css names", () => {
    const names = entries.map(([, t]) => t.css);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });

  it("uses only allowed kinds and well-formed css names", () => {
    for (const [key, t] of entries) {
      expect(KINDS, `${key} kind`).toContain(t.kind);
      expect(t.css, `${key} css`).toMatch(/^--[a-z0-9]+(-[a-z0-9]+)*(--[a-z0-9]+(-[a-z0-9]+)*)?$/);
      expect(typeof t.value, `${key} value`).toBe("string");
      expect(t.value.length, `${key} value`).toBeGreaterThan(0);
    }
  });

  it("writes every color as #rrggbb or #rrggbbaa", () => {
    for (const [key, t] of entries) {
      if (t.kind !== "color") continue;
      expect(t.value, key).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/);
    }
  });

  it("gives duration, length and number tokens a parseable value", () => {
    for (const [key, t] of entries) {
      if (t.kind === "duration") expect(t.value, key).toMatch(/^\d+(\.\d+)?m?s$/);
      if (t.kind === "length") expect(t.value, key).toMatch(/^-?\d+(\.\d+)?(px|rem|em)$/);
      if (t.kind === "number") expect(t.value, key).toMatch(/^-?\d+(\.\d+)?$/);
    }
  });

  it("marks exactly the breakpoints as build-time", () => {
    const bt = entries.filter(([, t]) => t.buildTime).map(([k]) => k);
    const bps = entries.filter(([k]) => k.startsWith("breakpoint.")).map(([k]) => k);
    expect(bps.length).toBeGreaterThan(0);
    expect(bt.sort()).toEqual(bps.sort());
  });

  it("keeps the form-field font size at or above 1rem", () => {
    const t = doc.tokens["typography.field.size"];
    expect(t).toBeDefined();
    const m = /^(\d+(?:\.\d+)?)(rem|px)$/.exec(t.value);
    expect(m).not.toBeNull();
    const px = m![2] === "rem" ? parseFloat(m![1]) * 16 : parseFloat(m![1]);
    expect(px).toBeGreaterThanOrEqual(16);
  });
});

describe("camo-base.css matches camo.tokens.json", () => {
  it("has exactly one @theme block, and it is static", () => {
    expect(css.match(/^@theme\b/gm)?.length).toBe(1);
    expect(css).toMatch(/^@theme static \{/m);
  });

  it("declares every token css var exactly once in the whole file", () => {
    for (const [key, t] of entries) {
      const n = css.match(new RegExp(`^\\s*${escapeRe(t.css)}\\s*:`, "gm"))?.length ?? 0;
      expect(n, `${key} (${t.css}) declarations`).toBe(1);
    }
  });

  it("declares each token inside the @theme static block with the same value", () => {
    const block = themeBlock();
    for (const [key, t] of entries) {
      const m = new RegExp(`^\\s*${escapeRe(t.css)}\\s*:\\s*([^;]+);`, "m").exec(block);
      expect(m, `${key} (${t.css}) in @theme static`).not.toBeNull();
      const norm = (s: string) => s.replace(/\s+/g, " ").trim();
      expect(norm(m![1]), `${key} value`).toBe(norm(t.value));
    }
  });

  it("declares nothing in @theme static that the token file does not list", () => {
    const listed = new Set(entries.map(([, t]) => t.css));
    const declared = [...themeBlock().matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]);
    expect(declared.filter((d) => !listed.has(d))).toEqual([]);
  });

  it("does not import Tailwind itself", () => {
    expect(css).not.toMatch(/^\s*@import\s/m);
  });

  it("states the import order in its header", () => {
    const header = css.slice(0, css.indexOf("*/"));
    expect(header).toMatch(/tailwindcss[\s\S]*camo-base[\s\S]*camo-ui-override/);
    expect(header).toMatch(/unlayered/i);
  });

  it("carries the form-field floor for touch devices", () => {
    expect(css).toMatch(
      /@media \(hover: none\) and \(pointer: coarse\) \{\s*input,\s*textarea,\s*select \{\s*font-size: var\(--text-field\) !important;/,
    );
  });

  it("keeps the unlayered :root rule unlayered", () => {
    const idx = css.search(/^:root \{/m);
    expect(idx).toBeGreaterThan(-1);
    expect(css.slice(0, idx)).not.toMatch(/@layer[^{]*\{\s*$/);
    // the :root block is at the top level, not nested in a layer
    const before = css.slice(0, idx);
    const opens = (before.match(/\{/g) ?? []).length;
    const closes = (before.match(/\}/g) ?? []).length;
    expect(opens).toBe(closes);
  });

  it("references only variables that exist", () => {
    const known = new Set(entries.map(([, t]) => t.css));
    // runtime hooks and per-element state the file itself sets or documents
    for (const v of [
      "--texture-paper-grain",
      "--texture-paper-grain-size",
      "--fx-x",
      "--fx-y",
      "--fx-rx",
      "--fx-ry",
      "--fx-glow",
      "--font-crimson-pro",
      "--font-jura",
    ])
      known.add(v);
    const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const used = new Set([...code.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
    expect([...used].filter((u) => !known.has(u))).toEqual([]);
  });
});

describe("contrast pairs", () => {
  it("is non-empty and includes a body-text pair at 4.5", () => {
    expect(doc.contrastPairs.length).toBeGreaterThan(0);
    expect(doc.contrastPairs.some((p) => p.fg === "color.content.primary" && p.bg === "color.surface.base" && p.min >= 4.5)).toBe(true);
  });

  it("references only existing color tokens", () => {
    for (const p of doc.contrastPairs) {
      expect(doc.tokens[p.fg]?.kind, `fg ${p.fg}`).toBe("color");
      expect(doc.tokens[p.bg]?.kind, `bg ${p.bg}`).toBe("color");
    }
  });

  it("all pass their minimum", () => {
    for (const p of doc.contrastPairs) {
      expect(contrast(p.fg, p.bg), `${p.fg} on ${p.bg}`).toBeGreaterThanOrEqual(p.min);
    }
  });
});

// Leakage: patterns are assembled from fragments so this file never matches itself.
const P = (...parts: string[]) => parts.join("");
const LEAK: [string, RegExp][] = [
  ["decision number", new RegExp(P("\\b", "P", "D", "\\d+"))],
  ["dispatch", new RegExp(P("Dis", "patch"))],
  ["source product name", new RegExp(P("mind", "farm"), "i")],
  ["owner handle", new RegExp(P("ttt", "sa"), "i")],
  ["design-tool node id", new RegExp(P("\\b\\d{3,5}", ":", "\\d{2,6}\\b"))],
  ["ruling reference", new RegExp(P("\\bG", "\\d+ ", "ruling"))],
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".tmp")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(json|css|ts|mts|mjs|js|md)$/.test(name) && name !== "package-lock.json") out.push(p);
  }
  return out;
}

describe("no source-project leakage", () => {
  const files = walk(pkgDir);

  it("scans a non-trivial set of files", () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  for (const [label, re] of LEAK) {
    it(`has no ${label} in packages/tokens`, () => {
      const hits: string[] = [];
      for (const f of files) {
        const lines = readFileSync(f, "utf8").split(/\r?\n/);
        lines.forEach((line, i) => {
          if (re.test(line)) hits.push(`${relative(pkgDir, f)}:${i + 1}: ${line.trim().slice(0, 100)}`);
        });
      }
      expect(hits).toEqual([]);
    });
  }

  it("has no decision numbers in docs/extraction-notes.md (excluded token names are allowed there)", () => {
    const notes = join(pkgDir, "..", "..", "docs", "extraction-notes.md");
    expect(existsSync(notes)).toBe(true);
    const hits = readFileSync(notes, "utf8")
      .split(/\r?\n/)
      .filter((l) => LEAK[0][1].test(l));
    expect(hits).toEqual([]);
  });
});
