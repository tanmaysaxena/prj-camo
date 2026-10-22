import { CSS_NAME_RE, extendVarName } from "./compile.js";
import { KINDS, type CamoConfig, type Issue, type Kind, type TokenFile, type ValidationResult } from "./types.js";

const SURFACE_BASE = "color.surface.base";
const FIELD_SIZE = "typography.field.size";
const MOTION_KINDS: readonly Kind[] = ["duration", "easing", "number"];
const ENGINE_WORDS = /\b(gsap|three(js)?|webgl|shader|lottie|framer|anime(js)?|engine)\b/i;

// ---------------------------------------------------------------- value checks

const NUMBER_RE = /^-?(\d+\.?\d*|\.\d+)$/;
const LENGTH_RE = /^-?(\d+\.?\d*|\.\d+)(px|rem|em|%|vh|vw|vmin|vmax|dvh|svh|lvh|ch|ex|pt|cm|mm|in)$/;
const DURATION_RE = /^(\d+\.?\d*|\.\d+)(s|ms)$/;
const EASING_KEYWORD_RE = /^(linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end)$/;
const EASING_FN_RE = /^(cubic-bezier|steps|linear)\([^()]*\)$/;
const UNSAFE_RE = /[;{}]/;

/** Parses #rgb, #rrggbb, #rrggbbaa. Returns null for anything else. */
export function parseHexColor(value: string): { r: number; g: number; b: number; a: number } | null {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(value);
  if (!m) return null;
  let hex = m[1]!;
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? n(6) / 255 : 1 };
}

/** Returns an error description if `value` is not valid for `kind`, else null. */
export function checkKindValue(kind: Kind, value: unknown): string | null {
  const text = typeof value === "number" ? String(value) : value;
  if (typeof text !== "string" || text.trim() === "") return "value must be a non-empty string or number";
  if (UNSAFE_RE.test(text)) return `value "${text}" contains a character not allowed in a CSS value (; { })`;
  const v = text.trim();
  switch (kind) {
    case "color":
      return parseHexColor(v) ? null : `"${v}" is not a #rgb, #rrggbb or #rrggbbaa color`;
    case "length":
      return LENGTH_RE.test(v) || v === "0" ? null : `"${v}" is not a CSS length`;
    case "duration":
      return DURATION_RE.test(v) ? null : `"${v}" is not a duration (e.g. 0.18s, 180ms)`;
    case "easing":
      return EASING_KEYWORD_RE.test(v) || EASING_FN_RE.test(v) ? null : `"${v}" is not an easing`;
    case "number":
      return NUMBER_RE.test(v) ? null : `"${v}" is not a number`;
    case "shadow":
    case "font":
    case "other":
      return null;
  }
}

// -------------------------------------------------------------------- contrast

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export function contrastRatio(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

type Rgba = { r: number; g: number; b: number; a: number };

function blend(fg: Rgba, bg: { r: number; g: number; b: number }): { r: number; g: number; b: number } {
  const mix = (f: number, b: number) => f * fg.a + b * (1 - fg.a);
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b) };
}

// ----------------------------------------------------------------- field floor

function toPx(value: string): number | null {
  const m = /^(-?(?:\d+\.?\d*|\.\d+))(px|rem|em)$/.exec(value.trim());
  if (!m) return null;
  const n = parseFloat(m[1]!);
  return m[2] === "px" ? n : n * 16;
}

// -------------------------------------------------------------------- validate

export function validate(config: CamoConfig, tokens: TokenFile): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const err = (rule: number, message: string) => errors.push({ rule, message });

  // Structural checks (rule 0) so the rest can trust the shape.
  if (config.schemaVersion !== 1) err(0, `schemaVersion must be 1, got ${JSON.stringify(config.schemaVersion)}`);
  if (typeof config.camoVersion !== "string" || !/^\d+\.\d+\.\d+/.test(config.camoVersion)) {
    err(0, "camoVersion must be a semver string");
  }
  if (config.prefix !== undefined && (typeof config.prefix !== "string" || !/^[a-z][a-z0-9]*$/.test(config.prefix))) {
    err(0, "prefix must match ^[a-z][a-z0-9]*$");
  }
  const overrides = config.overrides ?? {};
  const extend = config.extend ?? {};
  const effective = new Map<string, string>();
  for (const [key, token] of Object.entries(tokens.tokens)) effective.set(key, String(token.value));

  const validOverrides = new Set<string>();
  for (const key of Object.keys(overrides).sort()) {
    const token = tokens.tokens[key];
    const value = overrides[key];
    // Rule 1: vocabulary lock.
    if (!token) {
      err(1, `override "${key}" is not a Camo token (unknown, removed, or renamed)`);
      continue;
    }
    // Rule 6: motion overrides never change the engine.
    if (key.startsWith("motion.")) {
      if (!MOTION_KINDS.includes(token.kind)) {
        err(6, `override "${key}": motion tokens may only be duration/easing/number, but this token is kind "${token.kind}"`);
        continue;
      }
    }
    const text = String(value);
    if (key.startsWith("motion.") && (ENGINE_WORDS.test(text) || ENGINE_WORDS.test(key))) {
      err(6, `override "${key}": value "${text}" names an animation engine; overrides never change the engine`);
      continue;
    }
    // Rule 2: kind match.
    const problem = checkKindValue(token.kind, value);
    if (problem) {
      err(2, `override "${key}" (kind ${token.kind}): ${problem}`);
      continue;
    }
    validOverrides.add(key);
    effective.set(key, text.trim());
    // Rule 7: build-time tokens.
    if (token.buildTime) warnings.push({ rule: 7, message: `override "${key}" is a build-time token: rebuild required` });
  }

  // Rule 3 (+ kind check on extend values, rule 2).
  const camoCss = new Map<string, string>();
  for (const [key, token] of Object.entries(tokens.tokens)) camoCss.set(token.css, key);
  const seenExtend = new Map<string, string>();
  for (const key of Object.keys(extend).sort()) {
    const entry = extend[key]!;
    if (entry === null || typeof entry !== "object") {
      err(0, `extend "${key}" must be an object with kind and value`);
      continue;
    }
    if (entry.css !== undefined && (typeof entry.css !== "string" || !CSS_NAME_RE.test(entry.css))) {
      err(0, `extend "${key}": css ${JSON.stringify(entry.css)} must match ${CSS_NAME_RE.source}`);
      continue;
    }
    if (entry.css === undefined && config.prefix === undefined) {
      err(0, `extend "${key}" has no explicit css and the config has no prefix`);
      continue;
    }
    const name = extendVarName(config.prefix, key, entry.css);
    const owner = camoCss.get(name);
    if (owner) err(3, `extend "${key}" becomes ${name}, which collides with Camo token "${owner}"`);
    const earlier = seenExtend.get(name);
    if (earlier) err(3, `extend "${key}" becomes ${name}, which collides with extend "${earlier}"`);
    seenExtend.set(name, key);
    if (!KINDS.includes(entry.kind)) {
      err(2, `extend "${key}": kind must be one of ${KINDS.join(", ")}`);
      continue;
    }
    const problem = checkKindValue(entry.kind, entry.value);
    if (problem) err(2, `extend "${key}" (kind ${entry.kind}): ${problem}`);
    else if (entry.buildTime) warnings.push({ rule: 7, message: `extend "${key}" (${name}) is a build-time token: rebuild required` });
  }

  // Rule 5: form field floor.
  if (validOverrides.has(FIELD_SIZE)) {
    const text = effective.get(FIELD_SIZE)!;
    const px = toPx(text);
    if (px === null) err(5, `${FIELD_SIZE} "${text}" must be in px, rem or em so the 16px floor can be checked`);
    else if (px < 16) err(5, `${FIELD_SIZE} "${text}" is ${px}px; form fields must be at least 1rem/16px (mobile browsers zoom smaller fields)`);
  }

  // Rule 4: contrast with overrides applied.
  const baseText = effective.get(SURFACE_BASE);
  const base = baseText === undefined ? null : parseHexColor(baseText);
  if (validOverrides.has(SURFACE_BASE) && base && base.a < 1) {
    err(4, `${SURFACE_BASE} "${baseText}" has alpha; the page background must be opaque so contrast can be computed`);
  }
  for (const pair of tokens.contrastPairs ?? []) {
    const fgText = effective.get(pair.fg);
    const bgText = effective.get(pair.bg);
    const fg = fgText === undefined ? null : parseHexColor(fgText);
    const bg = bgText === undefined ? null : parseHexColor(bgText);
    if (!fg || !bg || !base) {
      err(4, `contrast pair ${pair.fg} on ${pair.bg}: a token is missing or not a hex color`);
      continue;
    }
    const surface = { r: base.r, g: base.g, b: base.b };
    const bgFlat = blend(bg, surface);
    const fgFlat = blend(fg, bgFlat);
    const ratio = contrastRatio(fgFlat, bgFlat);
    if (ratio < pair.min) {
      err(4, `contrast ${pair.fg} (${fgText}) on ${pair.bg} (${bgText}) is ${ratio.toFixed(2)}:1, below the required ${pair.min}:1`);
    }
  }

  return { errors, warnings };
}
