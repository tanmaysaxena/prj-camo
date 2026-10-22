# Phase 1 / Phase 2 interface contract

Two work streams build in parallel against this file. Do not change it without telling the other stream.

## Token file: `packages/tokens/camo.tokens.json` (stream B writes, stream A reads)

```json
{
  "schemaVersion": 1,
  "tokens": {
    "color.surface.base": { "css": "--color-surface-base", "kind": "color", "value": "#0b0f0e" },
    "motion.duration.fast": { "css": "--motion-duration-fast", "kind": "duration", "value": "0.18s" },
    "breakpoint.wide": { "css": "--breakpoint-camo-wide", "kind": "length", "value": "64rem", "buildTime": true }
  }
}
```

- Keys are dotted paths, unique. Each leaf maps to exactly one CSS custom property (`css`).
- `kind` is one of: `color`, `length`, `duration`, `easing`, `shadow`, `font`, `number`, `other`.
- `buildTime: true` marks tokens used inside media queries (cannot change at runtime).
- Colors are `#rrggbb` or `#rrggbbaa` only (three's `Color` must parse them; no oklch).
- Text/background contrast pairs live in `"contrastPairs": [{ "fg": "color.content.primary", "bg": "color.surface.base", "min": 4.5 }]`.
- Reserved, empty in v1: `"color_light_mode": {}`.

## Config file: `camo.config.json` (project owns; stream A defines schema)

```json
{
  "schemaVersion": 1,
  "camoVersion": "0.1.0",
  "prefix": "mf",
  "overrides": { "color.surface.base": "#101414" },
  "extend": { "credit.accent": { "kind": "color", "value": "#e0b84c" } }
}
```

- `overrides` keys must exist in the token file (vocabulary lock). Values must match the token's `kind`.
- `extend` keys become `--<prefix>-<key with dots as dashes>`; must not collide with any Camo token's `css` name.
- Schema file: `packages/tokens/camo.config.schema.json` (stream A).

## Compile output (stream A)

`compile(config, tokens)` returns CSS text:

```css
@theme static {
  --color-surface-base: #101414;
}
:root {
  --mf-credit-accent: #e0b84c;
}
```

Overridden tokens whose `css` var is a Tailwind theme var go in `@theme static`; extend vars go in an unlayered `:root`. Only deltas are emitted, never the base. Output is deterministic (sorted keys, LF).

## Locked rules (`validate`, stream A)

1. Unknown override key, or removed/renamed token: error.
2. Wrong value for the token's `kind`: error.
3. `extend` name collides with a Camo `css` name: error.
4. Any `contrastPairs` entry below `min` after applying overrides (blend alpha over `color.surface.base`): error.
5. A form-field font size token (`typography.field.size`) below `1rem`/16px: error.
6. A motion override that is not a `duration`/`easing`/`number` value, or that names an engine: error (overrides never change the engine).
7. Warn (not error) when a `buildTime` token is overridden: "rebuild required".

## Base CSS: `packages/tokens/camo-base.css` (stream B)

Tailwind v4 CSS. Declares every token from `camo.tokens.json` in `@theme static { ... }` (so Tailwind never purges them), plus generic compound classes. Contains NO mindfarm-specific rules. Must include the 16px form-field floor. Header comment states the import order: tailwindcss, camo-base, camo-ui-override.

## File ownership

- Stream A owns `packages/cli/**`, `packages/tokens/camo.config.schema.json`, `fixtures/**`.
- Stream B owns `packages/tokens/camo.tokens.json`, `packages/tokens/camo-base.css`, `packages/tokens/test/**`, `docs/extraction-notes.md`.
- Neither touches the other's files. Neither edits anything under `prj-mindfarm`; they only read it.
