export const KINDS = ["color", "length", "duration", "easing", "shadow", "font", "number", "other"] as const;
export type Kind = (typeof KINDS)[number];

export interface Token {
  css: string;
  kind: Kind;
  value: string | number;
  buildTime?: boolean;
}

export interface ContrastPair {
  fg: string;
  bg: string;
  min: number;
}

export interface TokenFile {
  schemaVersion: number;
  tokens: Record<string, Token>;
  contrastPairs?: ContrastPair[];
}

export interface ExtendEntry {
  kind: Kind;
  value: string | number;
  /** Explicit CSS custom property name (e.g. "--color-credit-accent"). Emitted in `@theme static`. */
  css?: string;
  /** Marks a value used inside media queries; changing it needs a rebuild (rule 7 warning). */
  buildTime?: boolean;
}

export interface CamoConfig {
  schemaVersion: number;
  camoVersion: string;
  /** Required unless every `extend` entry carries an explicit `css`. */
  prefix?: string;
  overrides?: Record<string, string | number>;
  extend?: Record<string, ExtendEntry>;
}

export interface Issue {
  /** Contract rule number 1-7, or 0 for structural problems with the config itself. */
  rule: number;
  message: string;
}

export interface ValidationResult {
  errors: Issue[];
  warnings: Issue[];
}
