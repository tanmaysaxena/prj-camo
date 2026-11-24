import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "..", "camo-base.css"), "utf8");

// The table block is the `@layer components` block that follows its own comment.
const start = css.indexOf("/* Tables.");
const block = start === -1 ? "" : css.slice(start, css.indexOf("/* Light-sweep capability"));

describe("table classes", () => {
  it("ships the scroll wrapper, the table and the label-first modifier", () => {
    expect(block).toMatch(/\.ds-table-scroll\s*\{/);
    expect(block).toMatch(/\.ds-table\s*\{/);
    expect(block).toMatch(/\.ds-table-label-first th:first-child,\s*\.ds-table-label-first td:first-child\s*\{/);
  });

  it("sits in @layer components so a caller's utility still wins", () => {
    expect(block).toMatch(/@layer components\s*\{/);
  });

  it("scrolls a wide table sideways instead of widening the page", () => {
    expect(block).toMatch(/\.ds-table-scroll\s*\{[^}]*overflow-x:\s*auto/);
  });

  it("collapses borders and draws dividers from the light stroke token, never a hex", () => {
    expect(block).toMatch(/border-collapse:\s*collapse/);
    expect(block).toMatch(/color-mix\(in srgb, var\(--color-stroke-light\) 20%, transparent\)/);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("gives the header and the label column the muted caption voice", () => {
    expect(block).toMatch(/\.ds-table th\s*\{[^}]*var\(--text-cap-label\)[^}]*var\(--color-content-tertiary\)/);
    expect(block).toMatch(/\.ds-table-label-first[^{]*\{[^}]*width:\s*7rem[^}]*var\(--color-content-tertiary\)/);
  });

  it("leaves no divider under the last body row, since the table draws its own bottom rule", () => {
    expect(block).toMatch(/\.ds-table tbody tr:last-child > td\s*\{\s*border-bottom:\s*0/);
  });
});
