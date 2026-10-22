import type { CamoConfig, TokenFile } from "./types.js";

const NL = String.fromCharCode(10);

function byKey(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export const CSS_NAME_RE = /^--[a-z0-9][a-z0-9_-]*$/;

/** Final CSS name of an extend entry: its explicit `css`, else `--<prefix>-<key>`. */
export function extendVarName(prefix: string | undefined, key: string, css?: string): string {
  if (css !== undefined) return css;
  return `--${prefix ?? ""}-${key.split(".").join("-")}`;
}

/**
 * Compile a config into CSS deltas. Overrides and extend entries with an explicit
 * `css` go in `@theme static` (sorted by CSS name); extend entries without one go
 * in an unlayered `:root` as `--<prefix>-<key>`. Never emits the base token set.
 * Deterministic: sorted, LF line endings, single trailing newline.
 * Assumes the config has passed `validate`.
 */
export function compile(config: CamoConfig, tokens: TokenFile): string {
  const blocks: string[] = [];

  const overrides = config.overrides ?? {};
  const extend = config.extend ?? {};
  const theme: Array<[string, string]> = Object.keys(overrides).map((key) => {
    const token = tokens.tokens[key];
    if (!token) throw new Error(`compile: unknown token "${key}" (run validate first)`);
    return [token.css, String(overrides[key])];
  });
  const rootLines: Array<[string, string]> = [];
  for (const key of Object.keys(extend)) {
    const entry = extend[key]!;
    if (entry.css !== undefined) theme.push([entry.css, String(entry.value)]);
    else rootLines.push([extendVarName(config.prefix, key), String(entry.value)]);
  }
  const lines = (list: Array<[string, string]>) =>
    list.sort((a, b) => byKey(a[0], b[0])).map(([name, value]) => `  ${name}: ${value};`);

  const block = (head: string, list: Array<[string, string]>) => [head + " {", ...lines(list), "}"].join(NL);

  if (theme.length > 0) blocks.push(block("@theme static", theme));
  if (rootLines.length > 0) blocks.push(block(":root", rootLines));

  if (blocks.length === 0) return "/* camo: no overrides */" + NL;
  return blocks.join(NL) + NL;
}
