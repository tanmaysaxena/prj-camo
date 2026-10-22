import type { CamoConfig, TokenFile } from "./types.js";

function byKey(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function extendVarName(prefix: string, key: string): string {
  return `--${prefix}-${key.split(".").join("-")}`;
}

/**
 * Compile a config into CSS deltas: overridden tokens in `@theme static`,
 * `extend` vars in an unlayered `:root`. Never emits the base token set.
 * Deterministic: sorted keys, LF line endings, single trailing newline.
 * Assumes the config has passed `validate`.
 */
export function compile(config: CamoConfig, tokens: TokenFile): string {
  const blocks: string[] = [];

  const overrides = config.overrides ?? {};
  const themeLines = Object.keys(overrides)
    .sort(byKey)
    .map((key) => {
      const token = tokens.tokens[key];
      if (!token) throw new Error(`compile: unknown token "${key}" (run validate first)`);
      return `  ${token.css}: ${String(overrides[key])};`;
    });
  if (themeLines.length > 0) blocks.push(`@theme static {\n${themeLines.join("\n")}\n}`);

  const extend = config.extend ?? {};
  const rootLines = Object.keys(extend)
    .sort(byKey)
    .map((key) => `  ${extendVarName(config.prefix, key)}: ${String(extend[key]!.value)};`);
  if (rootLines.length > 0) blocks.push(`:root {\n${rootLines.join("\n")}\n}`);

  if (blocks.length === 0) return "/* camo: no overrides */\n";
  return blocks.join("\n") + "\n";
}
