# Token extraction notes

Source: the original product stylesheet (`camo-ui-glass-paper.css`, 1,596 lines, one `@theme` block and five `@theme static` blocks), its `globals.css` (the form-field floor), `design-tokens.json`, `sync_design_tokens.py` and the design-system document. Nothing in the source was edited.

## Counts

| | Count |
|---|---|
| CSS custom properties declared as theme tokens in the source | 222 |
| Included in `camo.tokens.json` (from the source, same or renamed variable) | 134 |
| Added (no source variable) | 3 (`typography.field.size` = `--text-field`; `color.surface.glass`; `blur.glass`) |
| **Total tokens in `camo.tokens.json`** | **137** |
| Excluded (product-specific) | 88 |
| Contrast pairs | 13 |

222 = 134 + 88. Five of the 134 were renamed (see "Owner rulings applied"). The source also declares seven non-token custom properties, handled as described under "Non-token properties".

Included, by group: color 30, focus_ring 2, radii 6, gradient 11, blur 5, elevation 4, typography 32 (5 fonts, 11 scale steps with their line-height and letter-spacing companions, plus the field size), spacing 10, group_gap 2, z_index 6, breakpoint 4, container 2, motion 20, card_fx 3. Total 137.

## Owner rulings applied

1. **Fonts.** The named-family stacks are gone. Roles are `--font-display`, `--font-body` (the source's `--font-compact`, renamed), `--font-ui-accent`, `--font-ui-native` and `--font-reading-serif`, each a plain system stack (serif or sans-serif). Projects point a role at their own family with an override; no font files are in the package.
2. **Glass.** `.surface-glass` now reads `color.surface.glass` (`--color-surface-glass`, `#000000b8` = black at 0.72 alpha, rounded to 1/255) and `blur.glass` (`--blur-glass`, 6px). Both are in `@theme static` and overridable. The source required a blur of at least 6px for sheet backgrounds, so lowering it is a project decision.
3. **Paper grain.** The tile is packaged at `packages/tokens/assets/paper-grain.webp` (a byte copy of the source product's `paper-grain.webp`, 13,222 bytes) and `--texture-paper-grain` points at `/textures/paper-grain.webp`. The copy step is in `docs/paper-grain.md`; a future `camo init` will automate it.
4. **Breakpoints.** Tailwind's stock `sm/md/lg/xl` are no longer redefined. Camo's breakpoints are `breakpoint.compact` (480px), `breakpoint.regular` (768px), `breakpoint.wide` (1000px) and `breakpoint.extra_wide` (1280px), css vars `--breakpoint-camo-compact`, `-regular`, `-wide`, `-extra-wide` (variants `camo-compact:` and so on), all `buildTime: true`.
5. The badge color stays excluded: no generic badge until a project needs one.

### Paper grain provenance

The paper-grain tile was baked by a script written by the author of this repository and is licensed with the rest of the repo under Apache-2.0. See `docs/paper-grain.md`.

## Conversions

Every source color was already hex or `rgba()`; none used `oklch` or `color-mix` as a token value. `rgba()` and alpha values became `#rrggbbaa`, alpha rounded to the nearest 1/255, so the appearance is the same to within half a step of alpha:

| Token | Source | Result |
|---|---|---|
| `color.content.secondary` | `rgba(255, 255, 255, 0.68)` | `#ffffffad` |
| `color.content.tertiary` | `rgba(255, 255, 255, 0.46)` | `#ffffff75` |
| `color.content.disabled` | `rgba(255, 255, 255, 0.36)` | `#ffffff5c` |
| `elevation.glass_raised` | `rgba(254, 254, 254, 0.12)` | `#fefefe1f` |
| `elevation.glass_nested` | `rgba(254, 254, 254, 0.06)` | `#fefefe0f` |
| `elevation.chip_neutral` | `rgba(255, 255, 255, 0.12)` | `#ffffff1f` |
| `elevation.chip_fill` | `rgba(0, 0, 0, 0.6)` | `#00000099` |

Kept verbatim, because they are not colors and cannot be hex: every `gradient.*` value (kind `other`; several contain `rgba()` stops, and `gradient.light_sweep` uses `color-mix`), the font stacks (neutral system stacks, not hex), `card_fx.sheen_*` percentages.

Other changes:

- All hex is written lower-case (the source mixed cases in a few places).
- `--text-field: 1rem` is new. The source hard-coded `16px !important` in the floor rule; the rule now reads the token, so rule 5 of the contract (field size at least 1rem) is enforced through the token.
- The three card-hover tuning values (`--card-fx-perspective`, `-sheen-strength`, `-sheen-reach`) sat in an unlayered `:root` block in the source. They became tokens in `@theme static` so a project can override them through the config; the unlayered `:root` keeps only the two paper-grain variables.
- Dotted keys follow the source JSON paths (`color.surface.secondary_inv`, `motion.duration.page_transition`, and so on). Where the source JSON had no path (z-index layers, focus ring, card_fx), the key follows the same convention.

## Non-token properties (left in `camo-base.css` outside the theme block)

- `--texture-paper-grain` and `--texture-paper-grain-size` in an unlayered `:root` rule. The first is a file reference (`/textures/paper-grain.webp`), not a typed token value; the consuming app serves the tile shipped in `assets/` (see `docs/paper-grain.md`) or overrides the variable.
- `--fx-x`, `--fx-y`, `--fx-rx`, `--fx-ry`, `--fx-glow` on `.card-fx`: per-element state that a controller script writes at runtime.

## Excluded tokens

88 tokens were left out as product-specific, so they are not part of a portable base. They fall into these groups: a credit/counter palette, a product-stage badge color, one-off call-to-action borders and metallic treatments with their own drift animations, a decorative display face, a one-time launch-loader sequence, desktop-shell layout geometry, and a marketing-story palette, type scale and motion set. A project that needs such things declares them itself through `extend` entries in its `camo.config.json`.

## Classes and rules not carried over

Classes and rules tied to those product-specific treatments (loader hiding rules, metallic CTA surfaces, a navigation pill, view-transition rules, a fallback overlay) were not carried over. Carried over: 12 `ds-*` typography classes, `.scrim-modal/-footer/-header`, `.surface-glass`, `.control-glass`, `.accordion-open-glass`, `.surface-raised/-nested`, `.card-fx` (and its accordion combination and reduced-motion rule), `.no-radius`, the group classes, `.light-sweep-host` / `.light-sweep`, `.skeleton-shimmer` with its keyframes, and the form-field floor. All comments were rewritten to be generic.

## Open questions

1. An earlier brief mentioned 13 `ds-*` typography utilities; the source defines 12, and all 12 are carried over.
2. Contrast pairs are limited to combinations the source actually uses; stroke colors and the toggle thumb on the success track fall below 3:1 and are not listed.
3. `--container-shell` / `--container-wide` keep the source values (1000px / 1280px); rename if a neutral vocabulary is wanted.
