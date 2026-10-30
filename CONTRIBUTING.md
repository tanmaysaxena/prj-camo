# Contributing

Issues and pull requests are welcome. This is a one-maintainer project, so reviews happen at the maintainer's pace.

## Set up

```
npm install
npm test            # vitest, all packages
npm run typecheck
npm run build -w @prj-camo/cli
```

Node 22 or newer.

## What a change needs

- **Tests.** Every behaviour change in `packages/cli` or `packages/tokens` comes with a test. Fixtures for the config
  validator live in `fixtures/`.
- **The token vocabulary is a contract.** Adding a token means editing `packages/tokens/camo.tokens.json` *and*
  declaring it in `packages/tokens/camo-base.css`; the consistency test fails if the two disagree. Renaming or removing a
  token is a breaking change for every project that overrides it.
- **No product-specific content.** Camo is a portable base. The leakage tests reject names, links and addresses from any
  one product. Product-only tokens belong in a project's own `extend` section.
- **Locked rules stay locked.** Accessibility floors, the motion ownership contract and the token vocabulary are
  enforced by `camo validate` (`docs/CONTRACT.md`). Do not add an option that bypasses them.
- Keep comments short and generic, and keep the repo's existing style.

## Not built yet

`camo init`, `camo dev` (the live panel), `camo upgrade-check` and `camo propose` are planned but do not exist. Open an
issue before starting on one so the design can be agreed first.
