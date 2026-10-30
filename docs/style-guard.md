# Style guard: `camo check style`

A deterministic, dependency-free scanner that stops a consumer app from drifting away from the design system. It reads source text only (no TypeScript or CSS parser, node built-ins only), so it is fast, runs anywhere Node 22 runs, and gives the same output for the same tree.

```
camo check style [--config camo.check.json] [--root <dir>] [--tokens <file>]
                 [--json] [--update-baseline] [--show-baselined]
```

- `--config` defaults to `camo.check.json` in the current directory. `--root` is the directory the config's paths are relative to (default: the config's own directory).
- `--tokens` overrides the packaged `camo.tokens.json` (tests and forks).
- Exit 0 = clean, 1 = findings or baseline problems, 2 = bad usage or bad config (same codes as `validate`/`compile`).
- Output is grouped by rule, ordered by rule, then path, line, column. `--json` prints `{ ok, summary, findings, issues }`.

## Config: `camo.check.json`

Schema: `@prj-camo/tokens/camo.check.schema.json` (add `"$schema": "./node_modules/@prj-camo/tokens/camo.check.schema.json"`).

```json
{
  "schemaVersion": 1,
  "scan": { "include": ["app", "lib"], "exclude": ["**/*.test.*", "node_modules"] },
  "tokenFiles": ["app/camo-ui-override.css", "app/project-ui.css"],
  "overrideFile": "app/camo-ui-override.css",
  "externalVars": ["--font-jura", "--chart-*"],
  "rules": {
    "raw-element": { "allow": [{ "path": "app/components/ui/**", "reason": "primitives wrap the raw elements" }] }
  },
  "baseline": [
    { "rule": "hardcoded-color", "path": "app/legacy.tsx", "count": 3, "reason": "migrating in PR #12" }
  ]
}
```

| key | meaning |
| --- | --- |
| `scan.include` | Files or directories (relative to the root) to walk. `.ts .tsx .js .jsx .mjs .cjs .css` are scanned; `node_modules`, `.git`, `.next` are always skipped. |
| `scan.exclude` | Globs (`*`, `**`, `?`) or plain names. A name without a slash matches any path segment (`node_modules`); a glob without a slash also matches the file name (`*.module.css`). |
| `tokenFiles` | CSS files allowed to declare custom properties and hold literal colours and sizes (rules 1-3 skip them). Their declarations count as declared for rule 6. A literal path that does not exist is a config error. |
| `overrideFile` | The one generated file allowed to set Camo vocabulary (rule 7). Default: any file named `camo-ui-override.css`. |
| `externalVars` | Custom properties created outside the scanned source (next/font, a library). Exact names or `*` patterns. `--tw-*` is built in. |
| `rules.<id>.severity` | `"error"` (default) or `"off"`. Rule 3 is off by default. |
| `rules.<id>.allow` | `[{ "path": glob, "reason": text }]`: paths where the rule does not apply. The reason is mandatory (empty = config error). |
| `rules.raw-element.elements` | JSX tags to flag. Default `button select input textarea`. |
| `rules.unknown-var.ignoreWithFallback` | Do not report `var(--x, fallback)`. Default false. |
| `baseline` | Accepted existing debt, see below. |

## Rules

Every rule has a message that says what to use instead. Findings inside comments are never reported.

1. **`hardcoded-color`**: `#rgb #rgba #rrggbb #rrggbbaa`, and `rgb() rgba() hsl() hsla() hwb() lab() lch() oklab() oklch() color(srgb ...)` with numeric literals, and `color-mix()` containing a literal colour, in `.ts/.tsx/.css`. Skipped in `tokenFiles` and `allow` paths.
2. **`arbitrary-type-size`**: Tailwind `text-[13px]` (px, rem, em), CSS `font-size: 14px|rem`, and `fontSize: "13px"` in style objects. Skipped in `tokenFiles`. Use the type scale / `ds-*` classes.
3. **`arbitrary-spacing-radius-shadow`** (off by default): `rounded-[..]`, `shadow-[..]` (including side variants like `rounded-t-[..]`).
4. **`raw-element`**: JSX tags from the configured list in `.tsx/.jsx`. Allow the primitives directory.
5. **`inline-style-literal`**: `style={{ ... }}` whose `color`, `background`, `border*`, `outline*`, `fill`, `stroke`, `boxShadow`, `textShadow`, `caretColor`... value contains a literal colour (hex, colour function, or a named colour such as `"red"` inside a string). `var(--x)` strings and prop/variable expressions pass. A colour reported here is not reported again by rule 1.
6. **`unknown-var`**: every `var(--name)` must resolve to a custom property declared by: the packaged `camo.tokens.json` and `camo-base.css`; any `tokenFiles` entry; any scanned file that sets it (a CSS rule, `@property`, `@theme`, a Tailwind `[--x:..]` utility, a style-object key, `gsap.set(el, {"--x": ..})`, `setProperty("--x")`); or `externalVars`. Names built with `${}` are skipped.
7. **`namespace-redeclare`**: a custom property from the Camo vocabulary (any `css` name in `camo.tokens.json`) declared anywhere except the override file. This is the vocabulary lock: a project changes Camo values through `camo.config.json`, never by redeclaring them.

## Escapes

- **`camo-ok: <reason>`** in a comment on the same line as the finding or on the line before it (`// camo-ok: ...`, `/* camo-ok: ... */`, `{/* camo-ok: ... */}`). The reason is mandatory: a bare `camo-ok:` does not suppress, and the finding says so.
- `camo-ok(rule-a,rule-b): <reason>` limits the escape to named rules.
- `rules.<id>.allow` for whole paths, and `baseline` for debt you intend to burn down.

## Baseline ratchet

Findings are counted per `(rule, path)` and compared with `baseline`:

- more findings than the baseline allows, or a finding with no baseline entry: **fail** (all findings of that pair are listed, since the scanner cannot tell which are new);
- fewer findings than the baseline count (a stale entry, including a file that is clean or gone): **fail** with `tighten baseline`. The allowlist cannot rot;
- an entry whose `reason` is empty or `TODO`: **fail**.

`camo check style --update-baseline` rewrites `baseline` in the config to the current counts (sorted, entries with no findings removed, existing reasons kept, new entries get `"reason": "TODO"`). The command still fails until every `TODO` is replaced by a real reason. It rewrites the whole config file with 2-space JSON.

Suggested workflow: turn the guard on, run `--update-baseline`, fill in reasons, commit. After that the numbers only go down.

## Heuristics, and what they get wrong

The scanner is regex-based on comment-masked text. The deliberate choices:

- **Comments** are masked (JS `//` and `/* */`, CSS `/* */`) before any rule runs. The lexer understands strings, template literals with nested `${}`, and simple regex literals. A `'` in JSX text ends at the end of its line, so one apostrophe cannot swallow the file. Rare misses: a `/` after `)` or `}` that is a regex.
- **Hex colours** need a non-alphanumeric character before them (so `issue#123`, `&#169;`, `\#fff` are skipped; `_#fff` inside a Tailwind arbitrary value is not), a length of 3, 4, 6 or 8 digits, and a non-word character after. They are skipped inside `url(...)`, in `href/id/htmlFor/for/to/name/key/aria-*` attribute values, and (in CSS) when the next structural character is `{`, which means it is an id selector (`#fade {`). An all-digit hex (`#123`, `#1234`) counts only when the previous non-space character is a quote, `(`, `:`, `,`, `=` or `[` and the next is not alphanumeric, so `Fixes #123` passes and `'#123'` is a colour.
- **Colour functions** count when, after removing nested `var(...)`, there is a numeric literal; `rgb(var(--rgb) / var(--a))` and relative colours (`rgb(from var(--x) r g b)`) pass, `rgb(0 0 0 / var(--a))` fails. A function containing `${}` is treated as dynamic and skipped. The bare `color(` is only a colour with a colour-space first argument.
- **SVG path data** and other strings never match because they contain no `#`/colour function; **data URIs** are skipped as `url()` contents.
- **Known misses**: named colours (`color: red`) in CSS and class strings are not rule 1 findings (rule 5 does catch them in inline styles); a hex that is genuinely a selector-looking string in code (`querySelector("#bad")`) is reported (use `camo-ok`); values built at runtime are invisible.
- **Variables set anywhere in the app count as declared.** Rule 6 finds typos and removed tokens, not scoping mistakes: `var(--x)` in a file where nothing in the whole app declares `--x` fails, but it passes if some other component sets it. Optional knobs with fallbacks (`var(--bleed-at, 22% 62%)`) are reported unless `ignoreWithFallback` is on; baseline them or turn the option on.

## CI

Run `npx camo check style` from the app (or `--root`). It does no network access and needs no build of the app. Wire it next to `camo compile --check`.
