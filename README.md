# prj-camo

A portable design system: skin (tokens, base CSS), motion, layout and specs, built on Tailwind v4, with a per-project
override. Licensed under Apache-2.0.

**Status: private, pre-release (0.2.0).** It is not published and is not yet ready to be made public: a leakage scan
and a bundled-asset ownership check (the paper-grain texture) must pass first.

## How it works

- `@prj-camo/tokens`: `camo.tokens.json` (the token vocabulary), `camo-base.css` (Tailwind v4, `@theme static`),
  `camo.config.schema.json` and `camo.check.schema.json`.
- `@prj-camo/cli`: `camo compile`, `camo validate`, `camo check style`.
- A project owns its components and a `camo.config.json` holding only its deltas (`overrides` of Camo tokens, plus
  `extend` entries for project-only tokens). `camo compile` turns that into one generated CSS file loaded after the base.
- Locked rules no override may break: accessibility floors, the motion ownership contract, and Camo's token vocabulary.
- `camo check style` stops an app drifting from the defined styles and elements, with a baseline that can only shrink.

See `docs/CONTRACT.md`, `docs/style-guard.md`, `docs/extraction-notes.md` and `docs/paper-grain.md`.

## Develop

```
npm install
npm test
npm run typecheck
```

## Not built yet

Motion and shader packages, the live dev panel (`camo dev`), `camo init`, `camo upgrade-check`, `camo propose`.
