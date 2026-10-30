# Camo

A portable design system for web apps built on [Tailwind CSS v4](https://tailwindcss.com). Camo gives a project a
complete visual base (colors, type scale, spacing, radii, glass and paper surfaces, motion timings, form-field rules)
and one small file, `camo.config.json`, where the project says how it differs. Everything else stays shared.

- **One vocabulary.** 137 design tokens, each with a fixed name, a kind (color, length, duration, ...) and one CSS
  custom property. The names do not change between projects.
- **Override, don't fork.** A project's `camo.config.json` holds only its differences. A CLI compiles that file to a
  single CSS file loaded after the base.
- **Rules that cannot be overridden.** Text contrast, the 16px form-field floor (so mobile browsers do not zoom on
  focus) and the motion contract are checked by `camo validate`. A config that breaks them does not compile.
- **A drift guard.** `camo check style` scans your app's source for hard-coded colors, arbitrary font sizes, raw
  form elements and unknown variables, with a baseline that can only shrink.

Licensed under [Apache-2.0](LICENSE). Status: **pre-release (0.2.0)**. The packages are not on npm yet; see
[Install](#install).

## What is in the box

| Package | What it is |
| --- | --- |
| `@prj-camo/tokens` | `camo.tokens.json` (the token vocabulary and contrast pairs), `camo-base.css` (the tokens as a Tailwind v4 `@theme static` block plus generic classes), the JSON schemas for `camo.config.json` and `camo.check.json`, and the paper-grain texture tile. |
| `@prj-camo/cli` | The `camo` command: `compile`, `validate` and `check style`. Needs Node 22 or newer. |

`camo-base.css` also carries the generic classes built on the tokens: the `ds-*` typography classes (`ds-display-hero`,
`ds-body-md`, `ds-cap-label`, ...), glass and paper surfaces (`.surface-glass`, `.control-glass`, `.surface-raised`,
`.surface-nested`, `.card-fx`), scrims, form and component groups, the light sweep and the skeleton shimmer. It contains
no fonts: font roles are plain system stacks that a project points at its own families.

## Install

Camo is not published to npm yet. Until it is, build tarballs from a clone and install them into your project.

```
git clone https://github.com/tanmaysaxena/prj-camo.git
cd prj-camo
npm install
npm pack -w @prj-camo/tokens -w @prj-camo/cli      # writes prj-camo-tokens-0.2.0.tgz and prj-camo-cli-0.2.0.tgz
```

Copy the two `.tgz` files into your project (for example `vendor/`) and add them as dependencies:

```json
{
  "dependencies": { "@prj-camo/tokens": "file:vendor/prj-camo-tokens-0.2.0.tgz" },
  "devDependencies": { "@prj-camo/cli": "file:vendor/prj-camo-cli-0.2.0.tgz" }
}
```

Your project needs Tailwind CSS v4 (`tailwindcss` 4.x) already set up.

## Use it in a project

### 1. Load the CSS in the right order

In your app's entry stylesheet:

```css
@import "tailwindcss";
@import "@prj-camo/tokens/camo-base.css";
@import "./camo-ui-override.css";   /* generated in step 3 */
```

Order matters. The base declares every token; the override file (unlayered) comes last so it wins without
`!important`. If your build cannot resolve the package path, import `node_modules/@prj-camo/tokens/camo-base.css` by
relative path.

### 2. Write `camo.config.json`

```json
{
  "$schema": "./node_modules/@prj-camo/tokens/camo.config.schema.json",
  "schemaVersion": 1,
  "camoVersion": "0.2.0",
  "prefix": "myapp",
  "overrides": {
    "color.surface.primary": "#181818",
    "motion.duration.sheet": "0.35s"
  },
  "extend": {
    "brand.accent": { "kind": "color", "value": "#e0b84c" },
    "brand.card_glow": { "kind": "color", "value": "#e0b84c33", "css": "--color-brand-card-glow" }
  }
}
```

- `overrides` changes a Camo token. The key must exist in `camo.tokens.json` and the value must fit the token's kind.
- `extend` adds a token Camo does not have. Without `css` it becomes `--<prefix>-<key>` (here `--myapp-brand-accent`);
  with an explicit `css` it keeps that name and Tailwind generates utilities for it.
- Only differences go in this file. Never copy the whole token list.

### 3. Compile it

```
npx camo validate --config camo.config.json
npx camo compile  --config camo.config.json --out app/camo-ui-override.css
```

`validate` prints errors (exit 1) and warnings. `compile` writes deterministic CSS containing only your deltas. In CI,
run `camo compile ... --check` to fail when the generated file is stale.

Suggested `package.json` scripts:

```json
{
  "camo:compile": "camo compile --config camo.config.json --out app/camo-ui-override.css",
  "camo:check": "camo compile --config camo.config.json --out app/camo-ui-override.css --check",
  "camo:style": "camo check style"
}
```

### 4. Serve the paper-grain tile (optional)

`.card-fx` shows a faint paper grain from `/textures/paper-grain.webp`. Copy
`node_modules/@prj-camo/tokens/assets/paper-grain.webp` to `public/textures/paper-grain.webp`, or point
`--texture-paper-grain` somewhere else. Without it the cards still render, just without the grain. Details in
[`docs/paper-grain.md`](docs/paper-grain.md).

### 5. Use the tokens

Tokens are ordinary Tailwind v4 theme variables, so they work as utilities and as `var()`:

```tsx
<section className="surface-raised rounded-card p-4">
  <h2 className="ds-h2-card text-content-primary">Title</h2>
  <p className="ds-body-md text-content-secondary">Body copy.</p>
</section>
```

```css
.panel { background: var(--color-surface-secondary); border-radius: var(--radius-card); }
```

Open `packages/tokens/camo.tokens.json` for the full list. Groups: `color`, `focus_ring`, `radii`, `gradient`, `blur`,
`elevation`, `typography`, `spacing`, `group_gap`, `z_index`, `breakpoint`, `container`, `motion`, `card_fx`.

### Things to know

- Camo's breakpoints are namespaced, so Tailwind's stock `sm`/`md`/`lg`/`xl` keep their defaults. Use the
  `camo-compact:`, `camo-regular:`, `camo-wide:` and `camo-extra-wide:` variants (480, 768, 1000 and 1280px).
- Tokens marked `buildTime` (the breakpoints) are used inside media queries and cannot change at runtime. Overriding
  one produces a "rebuild required" warning.
- Colors are `#rrggbb` or `#rrggbbaa` only. No `oklch()` or `color-mix()` as a token value.
- Components are yours. Camo supplies the skin, not React components.

## The drift guard: `camo check style`

```
npx camo check style [--config camo.check.json] [--root <dir>] [--json] [--update-baseline] [--show-baselined]
```

It reads your source text (no build, no network) and reports hard-coded colors, arbitrary `text-[13px]` sizes, raw
`<button>`/`<input>` elements, inline-style color literals, `var(--x)` that nothing declares, and redeclared Camo
variables. Add a baseline for existing debt, and the counts can only go down. Exit 0 is clean, 1 is findings, 2 is bad
usage. A finding can be silenced with a comment, `camo-ok: <reason>`, and the reason is mandatory. Configuration and
every rule: [`docs/style-guard.md`](docs/style-guard.md).

## Modify Camo itself

```
npm install
npm test             # vitest across both packages
npm run typecheck
npm run build -w @prj-camo/cli
```

Layout:

```
packages/tokens/   camo.tokens.json, camo-base.css, schemas, assets/, test/
packages/cli/      src/ (compile, validate, style scanner), bin/camo.mjs, test/
fixtures/          configs the validator tests run against
docs/              CONTRACT.md, style-guard.md, extraction-notes.md, paper-grain.md
```

Common changes:

- **Change a token's value.** Edit `camo.tokens.json` and the matching line in `camo-base.css`; the consistency test
  fails if they disagree. A new default is not breaking, a renamed or removed token is.
- **Add a token.** Add it to `camo.tokens.json` (dotted key, `css` name, `kind`, `value`) and declare it in the
  `@theme static` block of `camo-base.css`. If it is a text/background pair that must stay readable, add it to
  `contrastPairs`.
- **Add a validation rule.** Rules live in `packages/cli/src/validate.ts` and are numbered in
  [`docs/CONTRACT.md`](docs/CONTRACT.md). Add a failing fixture in `fixtures/` and a test in
  `packages/cli/test/validate.test.ts`.
- **Add a style rule.** `packages/cli/src/style-rules.ts`, with its test in `packages/cli/test/style.test.ts`.
- **Keep it generic.** The leakage tests fail if a name, link or address from any single product appears anywhere in the
  repository. Product-specific tokens belong in a project's own `extend` section.

The contract between the token file, the config and the compiler is in [`docs/CONTRACT.md`](docs/CONTRACT.md).
How the tokens were extracted from their original product is in [`docs/extraction-notes.md`](docs/extraction-notes.md).

## Not built yet

Motion and shader packages, the live dev panel (`camo dev`), `camo init`, `camo upgrade-check` and `camo propose`.
Publishing to npm is also still to do.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
