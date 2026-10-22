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
}

export interface CamoConfig {
  schemaVersion: number;
  camoVersion: string;
  prefix: string;
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
