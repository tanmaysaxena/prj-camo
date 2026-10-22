# Token extraction notes

Source: the source product's stylesheet (`camo-ui-glass-paper.css`, 1,596 lines, one `@theme` block and five `@theme static` blocks), its `globals.css` (the form-field floor), `design-tokens.json`, `sync_design_tokens.py` and the design-system document. Nothing in the source was edited.

## Counts

| | Count |
|---|---|
| CSS custom properties declared as theme tokens in the source | 222 |
| Included in `camo.tokens.json` (from the source) | 134 |
| Added (no source variable) | 1 (`typography.field.size`, `--text-field`) |
| **Total tokens in `camo.tokens.json`** | **135** |
| Excluded (product-specific) | 88 |
| Contrast pairs | 13 |

222 = 134 + 88. The source also declares seven non-token custom properties, handled as described under "Non-token properties".

Included, by group: color 29, focus_ring 2, radii 6, gradient 11, blur 4, elevation 4, typography 32 (5 fonts, 11 scale steps with their line-height and letter-spacing companions, plus the field size), spacing 10, group_gap 2, z_index 6, breakpoint 4, container 2, motion 20, card_fx 3. Total 135.

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

Kept verbatim, because they are not colors and cannot be hex: every `gradient.*` value (kind `other`; several contain `rgba()` stops, and `gradient.light_sweep` uses `color-mix`), the font stacks (they reference `var(--font-crimson-pro)` and `var(--font-jura)`, which the consuming app registers), `card_fx.sheen_*` percentages.

Other changes:

- All hex is written lower-case (the source mixed cases in a few places).
- `--text-field: 1rem` is new. The source hard-coded `16px !important` in the floor rule; the rule now reads the token, so rule 5 of the contract (field size at least 1rem) is enforced through the token.
- The three card-hover tuning values (`--card-fx-perspective`, `-sheen-strength`, `-sheen-reach`) sat in an unlayered `:root` block in the source. They became tokens in `@theme static` so a project can override them through the config; the unlayered `:root` keeps only the two paper-grain variables.
- Dotted keys follow the source JSON paths (`color.surface.secondary_inv`, `motion.duration.page_transition`, and so on). Where the source JSON had no path (z-index layers, focus ring, card_fx), the key follows the same convention.

## Non-token properties (left in `camo-base.css` outside the theme block)

- `--texture-paper-grain` and `--texture-paper-grain-size` in an unlayered `:root` rule. The first is a file reference (`/textures/paper-grain.webp`), not a value a config can meaningfully override; the consuming app must serve that tile. The source's baked tile is not part of this package.
- `--fx-x`, `--fx-y`, `--fx-rx`, `--fx-ry`, `--fx-glow` on `.card-fx`: per-element state that a controller script writes at runtime.

## Excluded tokens (88) and why

Product-specific, so not part of a portable base:

| Group | Tokens | Reason |
|---|---|---|
| Credit and counters | `--color-credit-accent`, `--color-credit-delta` | Credit economy of the source product |
| Product badge | `--color-badge-alpha` | A product-stage badge color |
| Code identifiers | `--color-content-code` | Shows a product's permission keys |
| Primary CTA border | `--color-action-primary-border` | Border of one product CTA, used nowhere else |
| Folder tile | `--elevation-create-folder-tile` | One product tile |
| Plan header | `--gradient-plan-header-fade` | Plan/profile screen only |
| Gold and emerald metallic | `--gradient-gold-metallic`, `--gradient-gold-metallic-drift`, `--gradient-emerald-metallic`, `--gradient-emerald-metallic-drift`, `--motion-duration-gold-drift`, `--motion-duration-emerald-drift` | Brand CTA treatments with their own drift components |
| Greeting face | `--font-display-accent` | Decorative face for two product elements |
| Gyro tilt | `--motion-duration-gyro-tilt` | Tied to one product controller |
| Launch loader | `--motion-duration-launch-loader-draw`, `-bloom`, `-wipe`, `-floor`, `-glow-pulse`, `-shimmer`, `-mark-reveal`, `--motion-delay-launch-loader-stagger` | One-time cold-start sequence of the source product |
| Desktop shell | `--rail-w`, `--notes-pane-w`, `--save-panel-w`, `--desktop-gutter`, `--compact-bar-w` | Layout geometry of the source product's desktop shell |
| Landing story motion | `--motion-duration-story-scrub`, `-story-reveal`, `-story-crossfade`, `-story-intro`, `--motion-delay-story-stagger` | Landing story only |
| Landing story colors (12) | `--color-story-paper`, `-ink-secondary`, `-sap`, `-soil`, `-light-dawn`, `-light-noon`, `-light-dusk`, `-night-header`, `-terracotta`, `-mint`, `-ground-lip`, `-ground` | Landing story only |
| Landing story type (43) | every `--text-story-*` (label, hero, headline, headline-compact, body-lg, body, display-faq, contact, cue, caption, card-name, email, each with its `--line-height`, `--letter-spacing` and `--font-weight` companions where present), `--space-story-band`, `--space-story-cue`, `--font-story-italic` | Landing story only |

`z_index.launch_loader` was named in the brief but does not exist in the source stylesheet's z-index ladder, so there was nothing to exclude.

## Classes and rules not carried over

`#app-launch-loader` hiding rule; `.nav-pill-glass` (its gradient tokens stay, because `.accordion-open-glass` uses them); `.pin-action` and `.pin-action-cost`; `.surface-gold-metallic`, `.surface-emerald-metallic`, `.emerald-border-ring` and their drift children; the `@utility anchor-x` / `shell-anchor-x` pair (desktop shell); all `zoom-push/pull` keyframes and `::view-transition-*` rules (including the persistent bottom-nav, app-rail and app-header groups); `.motion-fallback-overlay`.

Carried over: 12 `ds-*` typography classes, `.scrim-modal/-footer/-header`, `.surface-glass`, `.control-glass`, `.accordion-open-glass`, `.surface-raised/-nested`, `.card-fx` (and its accordion combination and reduced-motion rule), `.no-radius`, the group classes, `.light-sweep-host` / `.light-sweep`, `.skeleton-shimmer` with its keyframes, and the form-field floor. All comments were rewritten to be generic.

## Open questions

1. The brief says "13 `ds-*` typography utilities"; the source defines 12 (display-hero, h1-section, h2-card, body-md, body-sm, cap-label, cap-micro, ui-accent-sm/md/lg, text-11, body-reading). All 12 are carried over. Is a thirteenth expected?
2. Font stacks reference `--font-crimson-pro` and `--font-jura`, families the source registers through its framework. Should the portable base ship neutral stacks instead, with the display and compact families supplied by each project?
3. `--color-badge-alpha` is excluded as product-specific. If a generic "status badge" color is wanted, it needs a new name and a decision on its value.
4. `--container-shell` / `--container-wide` and the four breakpoints are kept at the source's 1000px / 1280px values and override Tailwind's stock `sm`/`md`/`lg`/`xl`. Confirm that overriding the stock breakpoint names is wanted for every consuming project.
5. `.surface-glass` keeps a literal `rgba(0, 0, 0, 0.72)` fill and a fixed 6px blur (a stated product requirement in the source). They are not tokens; they could become `elevation.*` and `blur.*` tokens if projects need to override them.
6. Contrast pairs are limited to combinations the source actually uses; stroke colors and toggle thumb on the success track fall below 3:1 and are not listed.
7. The grain tile image is not packaged. Decide whether the package should ship one or document the contract only.
