import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const SIBLING_TOKENS = resolve(dirname(fileURLToPath(import.meta.url)), "../../tokens/camo.tokens.json");

/** Installed: resolve the @prj-camo/tokens package. Monorepo checkout: sibling folder. */
export function findDefaultTokens(): string {
  try {
    return createRequire(import.meta.url).resolve("@prj-camo/tokens/camo.tokens.json");
  } catch {
    return SIBLING_TOKENS;
  }
}

export const DEFAULT_TOKENS = findDefaultTokens();
