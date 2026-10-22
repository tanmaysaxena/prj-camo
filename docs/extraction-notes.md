# Token extraction notes

Source: the source product's stylesheet (`camo-ui-glass-paper.css`, 1,596 lines, one `@theme` block and five `@theme static` blocks), its `globals.css` (the form-field floor), `design-tokens.json`, `sync_design_tokens.py` and the design-system document. Nothing in the source was edited.

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

### Owner action required before the repo goes public

**Confirm that you own the paper-grain texture.** It was baked by a script in the source product and copied here unchanged; it is the only binary asset in the package. If ownership is not clear, remove `assets/paper-grain.webp` and the `files` entry, and `docs/paper-grain.md` becomes "supply your own tile".

### Migration note for Phase 4 (remapping the stock breakpoint names)

The source product redefined Tailwind's stock breakpoints (sm 480, md 768, lg 1000, xl 1280), so its layouts use the plain `sm:`, `md:`, `lg:` and `xl:` variants. Once those names go back to Tailwind's defaults (640, 768, 1024, 1280), each use has to be remapped to the `camo-*` variants or the sizes shift: `sm:` to `camo-compact:`, `md:` to `camo-regular:`, `lg:` to `camo-wide:`, `xl:` to `camo-extra-wide:`. A search over `web/app/**/*.tsx` for `(sm|md|lg|xl):` finds about 105 occurrences in 46 files. The densest: `dashboard/DashboardScreen.tsx`, `notes/record/RecordView.tsx`, `components/app-header.tsx`, `components/sheet.tsx`, `dashboard/DashboardGreeting.tsx`, `notes/folders/[id]/FolderDetailScreen.tsx`, `notes/NotesIndex.tsx`, `components/ui/Group.tsx`, `components/ui/PageGlow.tsx`, the desktop rail and split-shell components, `components/folder-grid.tsx`, plus their tests. `lg:` carries the desktop tier (formerly hard-coded as `min-[1000px]:`). `--container-shell` and `--container-wide` are unaffected.

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
2. Contrast pairs are limited to combinations the source actually uses; stroke colors and the toggle thumb on the success track fall below 3:1 and are not listed.
3. `--container-shell` / `--container-wide` keep the source's 1000px / 1280px values; the names still describe the source product's shell. Rename if a neutral vocabulary is wanted.
