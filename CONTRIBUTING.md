# Contributing to Geminio

Geminio is Kash's personal Git client, developed from Gitcito. Propose changes
against [kaschief/geminio-by-kash](https://github.com/kaschief/geminio-by-kash).
Work in the existing checkout; do not create development worktrees or clones
unless the owner requests them.

[`CLAUDE.md`](CLAUDE.md) is the working agreement — architecture, the UI house
style, and the checklist every change passes — for people and agents alike.
[What Geminio changes](docs/geminio-changes.md) is the running list of what
the fork adds on top of Gitcito; read it to learn the app's current shape.

## Development setup

```bash
npm install
npm run dev
```

Things worth knowing before the first change:

- **Electron is installed by its own script.** If `npm run dev` fails with
  `Electron uninstall`, run `node node_modules/electron/install.js`.
  `package.json` approves install scripts for Electron, esbuild and node-pty.
- **Dev and installed apps keep separate data.** The dev app uses
  `geminio-dev` under the OS app-data folder (seeded once from the installed
  app's data); the installed app uses `Geminio`. Trying things in dev never
  touches your real settings.
- **Hot reload has edges.** Renderer edits hot-reload; editing a store module
  rebuilds its state, so selection and the details panel reset — that is
  dev-only, not a bug. Changes to `src/main` or `src/preload` need a full
  restart, and a renderer calling a new IPC method against an old main process
  throws, so make new IPC calls fail soft (see `useAiReady`).
- **The build regenerates two tracked files**: `licenses.generated.json` and
  `lib/settingsSearch.generated.json` (the Settings search index, also rebuilt
  before `npm run dev`). Commit the search index when Settings copy changed;
  restore the licenses file when dependencies did not.
- **Moving the checkout breaks the test fixtures** (they store absolute remote
  paths). Run `npm run playground:rebuild`.
- **App icons** (the Dock styles in Settings → Appearance) are vector sources in
  `src/shared/appIcons.ts`. Regenerate the PNGs with
  `node_modules/.bin/electron scripts/generate-app-icons.cjs`.

## Taking upstream changes

Geminio follows [Gitcito](https://github.com/MyAppDesk/gitcito) as the
`upstream` remote (fetch-only). The app announces upstream releases but never
installs them — an upstream build would replace this one and drop the fork's
changes. To take one:

```bash
git fetch upstream
git log --oneline HEAD..upstream/main   # review what changed
git merge upstream/main                 # resolve, then run the full gate
```

Upstream's edits to the translated dictionaries and handbook pages merge
cleanly because this fork leaves those files alone. Afterwards, check
[What Geminio changes](docs/geminio-changes.md): an entry upstream has made
redundant should be removed.

## Commit messages

This project follows [Conventional Commits](https://www.conventionalcommits.org/).

```
type(scope): subject

feat: add dark mode support
fix: resolve crash on empty repo
docs: update README with new features
chore: upgrade electron to v32
refactor: extract auth logic into service
perf: reduce re-renders in GraphView
test: add unit tests for git service
```

commitlint uses `@commitlint/config-conventional`: the subject starts lower
case, and body lines stay within 100 characters.

| Type | When to use |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `chore` | Tooling, deps, config |
| `refactor` | No feature, no bug fix |
| `perf` | Performance improvement |
| `test` | Tests only |
| `build` | Build system changes |
| `ci` | CI/CD changes |

Breaking changes: append `!` after the type — `feat!: drop Node 18 support`

## Translations

**Every string a user can read belongs in the English dictionary.** UI copy lives in
`src/renderer/src/i18n/`, one dictionary file per locale:

| File | Role |
|------|------|
| `en.ts` | The reference locale. Exports `en`, and derives `Dict = typeof en`. |
| `<code>.ts` | One per additional locale, typed as a partial dictionary; missing keys fall back to English. |
| `index.ts` | The API: `t`, `useT`, `translate`, `interp`, `LANGUAGES`. |

Add new keys to **`en.ts` only** in this project and render them with `t('your.key')`
(`useT()` in components, `t()` elsewhere). Build sentences with
`interp(t(key), vars)` rather than string concatenation — word order differs
between languages. Store keys, not translated strings, in module-level
constants. `CLAUDE.md` has the full patterns.

```bash
npm run lint:i18n   # fails on any hardcoded user-facing string
```

This runs on pre-commit and in the test suite, which also checks
duplicates and placeholder consistency across the locale files.
Strings that must read identically in every language (product names, filenames,
git tokens) belong in `scripts/i18n-allowlist.json` or carry an inline
`// i18n-ignore <reason>`.

Removing or renaming a key in `en.ts` means removing it from every locale
file too — the tests reject a key English no longer has.

### Adding a locale

Copy `en.ts` to `<code>.ts`, export it as `Dict`, translate the values, then
wire it into `dictionaries` and `LANGUAGES` in `index.ts` and add the code to
`Language` in `src/shared/types.ts`. The tests pick the new file up
automatically. `/add-locale <code>` does this for an agent.

## Documentation

Geminio carries its own handbook: **`docs/help/*.md`**. The app renders it
(the **Help** button in the status bar) and GitHub renders the same files —
one source, two readers, offline in both.

**A user-facing change is not done until the handbook covers it.** This is
enforced, not requested:

```bash
npm run lint:docs   # fails when a surface has no page behind it
```

The guard walks every modal kind, page-tab type and command-palette entry, and
asks where each one is explained. It also checks front matter, internal links
and image paths — so a deleted screenshot or a renamed page fails the build
instead of quietly producing a broken page.

### Adding a page

1. Create `docs/help/<id>.md` with front matter:

   ```md
   ---
   title: Conflict radar
   category: Branching & surgery
   order: 44
   summary: One line, shown under the title and in search results.
   keywords: words search should also match, including old names
   ---
   ```

   `category` groups it in the sidebar; `order` sorts it inside that group.

2. Point the new surface at it in `scripts/docs-map.json` — or, if it is not a
   feature of its own (a generic confirm dialog, say), add it to `exempt` with
   a reason in writing.

3. Add an entry to [`docs/geminio-changes.md`](docs/geminio-changes.md),
   the running list of what the fork changes — and edit or remove any entry the
   change makes untrue. One entry per noticeable change, not per commit.

4. If it is worth a mention, add **one line** to `README.md` linking to the
   page. The README is a tour; depth belongs in the handbook.

### Writing well here

- Lead with the problem, not the button. "Which branch will conflict?" beats
  "Click Tools → Conflict radar".
- Say what it **refuses** to do and what it cannot detect. Docs that only list
  strengths read as marketing.
- Link pages with plain relative Markdown — `[absorb](absorb.md)` — so links
  work in the app and on GitHub.
- Images go in `docs/screenshots/` and are used as
  `![alt](../screenshots/name.webp)`. Regenerate them with
  `npm run screenshots` (add `:clips` for the animated ones), which drives the
  app against the playground repos — then `npm run playground:rebuild`, because
  capturing mutates them. Every screenshot must be used by some page.

### Screenshots

Each shot is declared in `examples/screenshots/shots.config.mjs`: which
playground repo to load, an optional `prepare` that puts the repo into the right
state on disk, and a `drive` that puts the running UI into the exact state to
capture. **Add a feature → add a shot there.**

Prefer a still when the value is the information on screen, and a motion clip
(the `clips` export) only when the value is the movement itself — a scrubber, an
animation, a scan landing verdict by verdict.

```bash
npm run screenshots                                    # every still (WebP)
node examples/screenshots/capture.mjs conflict-radar   # just one
npm run screenshots:clips                              # stills + motion clips
npm run playground:rebuild                             # capturing dirties the repos
```

### The website

`docs/help/` also feeds the website,
<https://kaschief.github.io/geminio-by-kash/>, generated by `npm run site`.
The English handbook describes Geminio's current behavior; translated pages
are retained from the upstream documentation.
`scripts/build-site.mjs` renders the landing page and one HTML page per
handbook entry — no framework, no bundler, `marked` and nothing else.

```bash
npm run site         # → dist-site/
npm run site:serve   # …and serve it locally
```

CI redeploys it on every published release and on any push to
`geminio-home` that touches `docs/`, so a documentation fix is live without
anyone remembering to publish it (GitHub Pages must be enabled for the
repository, with GitHub Actions as the source). The deploy runs `docs-check`
first: if the docs do not line up, the site is not published.

**The one thing that does not update itself.** The handbook pages come from
Markdown, but the landing page's headline features are hand-written arrays in
`scripts/build-site.mjs` — `FEATURES` for the inherited headline features,
`FORK_FEATURES` for what Geminio adds — with their copy in
`scripts/site-i18n/en.mjs`. It is the only place the site's
copy is not derived from `docs/`, and therefore the only place that can quietly
go stale. If a change deserves a spot on the front page, add it there too — and
point it at its handbook page, which the link test then verifies.

## Testing

Tests run real git against generated fixture repos
(`examples/setup-playground.sh`, invoked automatically on first run). Anything
that mutates a repo must work on a copy via `cloneFixture()` — mutating a shared
playground repo breaks every later test in the run.

```bash
npm test                          # full suite
npx vitest run test/gitOps.test.ts # one file
npm run playground:rebuild         # force-regenerate fixtures
```

## Pull requests

- PR title must follow the same `type: Subject` format (enforced by CI)
- One concern per PR
- `npm run typecheck`, `npm run lint:i18n`, `npm run lint:docs` and `npm test`
  must pass

### Show the thing

Reviewers read diffs; they rarely build the branch. So a PR that changes what a
user sees has to show it:

| Your PR adds | Put in the description |
|---|---|
| A panel, a modal, a settings section, a new badge or banner | A **screenshot** |
| A drag, a drop target, an animation, a keyboard flow | A **short screen recording** — a still cannot show a gesture |
| Nothing visible | Say so: `n/a` |

This is a review aid, not a substitute for the generated shots: the handbook's
images still come from `npm run screenshots`, and a new surface still needs its
entry in `examples/screenshots/shots.config.mjs`. Paste the quick capture in the
PR, add the reproducible one to the manifest.

The docs guard also asks where each **right panel tab** is documented, alongside
modals, page tabs and palette commands — a tab in the right column is as
findable as a modal, and just as easy to ship undocumented.

## Releasing

Maintainers only. Requires a clean working tree.

```bash
npm run release:patch   # x.y.z → x.y.(z+1)
npm run release:minor   # x.y.z → x.(y+1).0
npm run release:major   # x.y.z → (x+1).0.0
```

This bumps the version, updates `CHANGELOG.md`, commits, tags, and pushes. The
release workflow then builds macOS, Windows and Linux and publishes them to this
repository's releases. The macOS build is signed and notarised only when the
signing secrets are configured; otherwise it ships unsigned. Geminio has not
tagged a release of its own yet, and only the macOS build is exercised day to
day.

For the owner's own Mac, `npm run install:mac` builds Apple Silicon only and
replaces the installed app, keeping its custom icon. Run it only when asked.
