# Handoff — geminio-by-kash

State of this fork for whoever picks it up next (another agent, or a later
session). Read this first, then `CLAUDE.md` (the project's working agreement,
still authoritative except where noted below).

Last updated: 2026-10-01 (completed continuation work; prepared for the requested local commit).

---

## 1. What this repository is

A personal fork of [MyAppDesk/gitcito](https://github.com/MyAppDesk/gitcito)
(MIT), an Electron + React + TypeScript Git client. The owner (Kaschief, the
only contributor) uses it daily and wants "their app with my flavour": upstream's
product, with local fixes and UX changes on top, still able to take upstream
updates.

| | |
|---|---|
| Local folder | `~/Code/geminio-by-kash` |
| `origin` | `https://github.com/kaschief/geminio-by-kash` (public) — push here |
| `upstream` | `https://github.com/MyAppDesk/gitcito` — fetch only; push is set to `DISABLED` |
| Branch | `codex/geminio` (renamed at the owner's request); tracks `origin/main` |

## 2. Working rules (the owner's, on top of `CLAUDE.md`)

- **One checkout only:** work in `~/Code/geminio-by-kash`. Do not create development
  worktrees, clones, isolated checkouts or containers unless the owner reverses this rule.

- **Commit only when asked.** When asked: run the gate (§4), commit on the current branch
  with Conventional Commits (commitlint enforces it; body lines ≤ 100 chars),
  push to `origin`. Never push to `upstream`.
- **English only.** The fork is not translated any more. Add new strings to
  `src/renderer/src/i18n/en.ts` **only**. Other locales are typed
  `Partial<…>` and fall back to English (`Dict` in `en.ts`). Do not add or copy
  translations. If you *remove* a key from `en.ts`, remove it from every locale
  file too — `test/i18n.test.ts` rejects keys English no longer has. The other
  locale files are kept on purpose so upstream's edits to them merge cleanly.
- **Running the app.** `CLAUDE.md` says agents must not launch the app; the
  owner overrides that — they want `npm run dev` running so they can try
  changes. Rebuild the installed app only when asked (§3).
- **UX standards the owner holds this app to** (they compare against GitKraken
  and "how Apple would do it"):
  - No noise. Toasts only for what the user can't see happen (remote work,
    results elsewhere, errors). No success toast for visible results.
  - No dead or redundant controls. AI buttons only when AI is actually set up.
    No button that duplicates another (e.g. the panel ✕ was removed because the
    toolbar toggle exists).
  - Nothing moves or disappears under the pointer. Floating chrome must not
    push content or cover controls.
  - Consistency: one tooltip style (`FastTooltip`), one "selected" look (accent
    tint), option cards in Settings (never a bare `<select>`), Title Case for
    action labels, short tooltips that never repeat the label.
  - Colour by intent: forward/positive actions green, backward/destructive red
    (`.btn.intent-forward` / `.intent-backward`), plain for actions that touch no
    files.
  - Must work from widescreen down to an iPad in Sidecar (~1366×1024 and less
    once panels are open). Rows with actions must shrink, wrap or scroll
    gracefully; check narrow widths.

## 3. Running, building, installing

```bash
npm install                       # see the Electron note below
npm run dev                       # dev app (shows as "Electron" in the Dock)
npm run build                     # gate step; regenerates licenses.generated.json
```

- **Electron 43 has no postinstall.** If `npm run dev` fails with
  `Error: Electron uninstall`, run `node node_modules/electron/install.js`.
  `package.json` `allowScripts` approves electron, esbuild and node-pty.
- **The build rewrites `src/renderer/src/licenses.generated.json`.** Restore it
  after building (`git checkout -- src/renderer/src/licenses.generated.json`)
  unless dependencies really changed.
- **Installed app** (`/Applications/Geminio.app`, unsigned, arm64):
  ```bash
  npm run build && git checkout -- src/renderer/src/licenses.generated.json
  CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir --arm64 \
    --publish never -c.mac.identity=null
  ditto dist/mac-arm64/Geminio.app /Applications/Geminio.app
  ```
  Replace the copy in `/Applications` only after confirming with the owner.
  The installed app keeps its settings separately from the dev app
  (`~/Library/Application Support/geminio` vs `geminio-dev`).
- **Updates:** the app checks upstream for releases and shows a notice, but
  never downloads or installs (`SELF_INSTALL = false` in `src/main/updater.ts`)
  — installing upstream's build would wipe the fork's changes. Taking an update
  = `git fetch upstream`, show the owner what changed, merge `upstream/main`
  into the current branch, rebuild.

### Dev-mode gotchas

- `npm run dev` hot-reloads the app's own source. Editing a store module
  (e.g. `stores/repo.ts`) rebuilds that state from scratch: selection and the
  details panel reset. That is dev-only, not a bug — don't chase it.
- Changing `src/main` or `src/preload` needs a full dev restart. A renderer that
  calls a new IPC method against an old main process throws — this once took
  the window down. Renderer calls into new IPC should fail soft (see
  `useAiReady`).
- Moving the folder breaks the generated test fixtures (they store absolute
  remote paths). Fix with `npm run playground:rebuild`.

## 4. The gate

```bash
npm run typecheck && npm run lint:i18n && npm run lint:docs && npm test && npm run build
```

The full gate passes: 1,635 tests passed, 2 intentionally skipped; typecheck,
i18n lint, docs lint and production build passed. Targeted checks also passed
after the final editor-menu refinement. The two previously failing tests are fixed:

- `deleteRemoteBranch`: its test now explicitly initializes `main`, so it does
  not depend on the machine's Git default branch name.
- Automated bisect: completion accepts both old `first bad commit` output and
  the newer `first 'bad' commit` wording.

Visual checks use the real built app and fixture repositories. The screenshot
harness now waits for startup maximization before setting an explicit viewport,
and uses `cwebp` for stills when available (this machine's ffmpeg lacks libwebp).
The Sidecar shots assert offscreen-author fitting and find-bar behavior.

---

## 5. What the fork has changed (by area)

Commit history on `main` after `6cff4250 chore: release v4.10.0` has the
detail. Summary:

**Credentials / Keychain** (`src/main/credentials.ts`, `test/credentials.test.ts`)
- Background hosting polls share one in-flight `git credential fill` per key.
- A background lookup that times out blocks its key until an interactive
  lookup succeeds — stops stacked macOS Keychain prompts and the frozen feel.

**Hunk and line actions** (`lib/hunkPatch.ts`, `DiffViewer`, `FileViewer`,
`applyHunkPatch` in `src/main/git.ts`, `test/hunkActions.test.ts`)
- Stage / Discard (unstaged), Unstage (staged), Revert (commit), Apply (stash);
  per hunk or per selected lines, unified and split view; undo entries;
  Discard confirms; working-tree actions take a WIP snapshot.
- Three-way fallback (`mergeHunkIntoFile`, `git merge-file`) when the file has
  moved on; conflict markers + notice on overlap; a no-op merge reports
  "does not apply".
- Works with whitespace ignored (`--ignore-whitespace`). Hidden on combined
  (conflict) diffs.

**Diff / file viewer**
- Display toggles live in the file viewer header as an icon group; header
  controls scroll sideways on narrow widths (fade, no scrollbar).
- Find bar and line-selection actions float on a non-scrolling overlay
  (`.fv-overlay`): find centred at top, selection pill centred at bottom.
  Escape in a find bar never closes the file (`defaultPrevented` guard).
- Wrap works in unified view too. Hunk headers are quieter; optional code
  context (`diffHunkContext`). Hunk buttons are sticky at the visible edge.
- "No results" / "N of M" find counter; scroll returns to the origin on no match.
- Explain and Link buttons removed. Copy Path / Copy Link / Edit File moved to
  the path's right-click menu.

**Graph** (`GraphView.tsx`, `lib/graphColumnFit.ts`, `lib/commitDate.ts`)
- Header scrolls sideways in step with the rows.
- Column widths capped (`COL_MAX`) and clamped on load; double-click any
  divider fits **all** columns to the widest loaded entry or heading (≤ 35% of
  the graph each, subject to column minimums). Virtualized rows are included;
  the branch connector is excluded from content measurements.
- In a narrow graph, branch then graph columns shrink before the message.
- Date format setting (relative / date & time / ISO); in relative mode the
  hovered row shows the exact date in place.
- Optional one-line commit description after the title (`graphShowBody`,
  `bodyPreview` from `git log … %<(160,trunc)%b`).
- Whole-row hover tint; no subject pop-out; WIP inline field sizes to content.

**Staging panel / repo state**
- Discard All (trash, top-left of the changes panel); right-click discard names
  its target; A→Z sort for flat lists; path depth setting
  (`lib/pathDisplay.ts`) — file names never truncated.
- Uncommitted-changes banner on commit/stash details + ✎ count in the status bar.
- Stash "already applied" detection (`stashAlreadyApplied`) and readable git
  errors (`lib/gitErrors.ts`).

**App-wide**
- `FastTooltip` takes over every titled button: icon-only → quick tip,
  labelled → slower tip, title that repeats the label → no tip.
- Success toasts are opt-in in `run()` (`announce`, default = remote ops).
- `useAiReady` gates every AI surface on "AI on **and** a key stored".
- Right panel: toolbar toggle (⌥⌘B) reopens what was last shown; panel ✕ and
  toolbar Chat button removed.
- Intent colours; consistent selected state; status bar and panel toolbars
  shed decoration at narrow widths (container queries).
- `NumberField` (`lib/boundedNumber.ts`) fixes number inputs that clamped on
  every keystroke.
- Settings reorganised: General · Appearance · Layout · **Graph** ·
  **Files & Diffs** · Profile · Workspaces · Integrations · AI · Security ·
  Shortcuts · Data. Analyzer, date format and path depth use option cards.

## 6. Continuation completed

- English action labels swept for Title Case, preserving prose, technical tokens,
  placeholders and status messages. Composer multi-file discard copy now uses
  the existing dictionary count key.
- File/folder menus show one editor action when the preferred application is
  that same editor. Different apps and custom commands remain distinct.
- Column fitting includes loaded rows beyond the virtual viewport. Extremely
  long values can still truncate at the documented width cap; unloaded history
  requires loading more commits before fitting again.
- Verified graph/details at 1366×1024 and diff/staging at 1100×760. Find opens
  without shifting code and sits below the opening hunk actions. Escape closes
  Find without closing the file. Floating overlays can still cover code.
- Refreshed graph light/dark, graph path filter, graph appearance settings,
  split diff and line-staging screenshots; added Sidecar graph/diff and
  Files & Diffs settings captures. Other upstream feature shots are retained.
- Translated handbook pages are deliberately retained for upstream compatibility;
  English remains the maintained source for this fork.
- Both previously failing tests fixed (see §4).

### GitHub connection (also requested during this session)

- Hosting API credentials prefer the profile's explicit token, then the existing
  GitHub CLI login, then Git's credential helper. Applies to HTTPS and SSH GitHub
  remotes. CLI tokens remain in main-process memory; no global Git configuration
  or stored profile token is changed. Git transport still uses Git/SSH auth.
- Settings → Integrations → GitHub shows the connected account and a Connect
  GitHub retry action when disconnected. No new OAuth app/client ID is required
  for an existing CLI login; sign-in itself remains `gh auth login` or a helper/PAT.
- The active account photo is used in the title bar and for authors matching its
  public/verified emails or GitHub no-reply addresses. Other authors retain
  Gravatar/generated fallbacks. Matching never guesses from display names.
- Live verification resolved `kaschief`, loaded the profile photo and showed it
  on all six recent commits. Author identity and history were not changed.
- Account lookups are shared, isolated by profile/token and refreshed every five
  minutes. Screenshot fixtures do not load the machine's account identity.
- The owner subsequently requested a complete rename to Geminio. The installed
  bundle is now `/Applications/Geminio.app`; the former bundle is backed up at
  `/tmp/Geminio-app-backup-1790882685/Gitcito.app`. The dev app is also running.

### Geminio rename and interaction changes (completed 2026-10-01)

- Primary checkout moved to `/Users/kaschief/Code/geminio-by-kash`; no extra
  checkout or worktree. Local branch is `codex/geminio`, tracking `origin/main`.
  GitHub repository was renamed to `kaschief/geminio-by-kash`; upstream remains
  `MyAppDesk/gitcito`. The owner requested a local commit after installation; no push was requested.
- Product, CLI, assets, package identifiers, documentation and translations now
  use Geminio. Legacy internal storage keys, encrypted bundle markers, Git
  refs and attribution deliberately remain compatible. `.geminio.json` is
  primary; `.gitcito.json` is still readable. Prior app data is copied once into
  the new app-data directory without overwriting the original.
- The commit-message section has a draggable top divider and a remembered
  height. Description grows with it, with room reserved for staging lists.
- Right-click any graph header for the existing columns menu. Graph order,
  widths and visibility, plus sidebar section order, visibility and expansion,
  are global. First load adopts the active repo's old layout. Branch pins and
  branch-folder expansion stay per-repository.
- Repository/branch selectors are now compact single-line pills with proper
  truncation and fixed space for icons and chevrons; no stacked headings or
  breadcrumb arrow.
- One Pull/Fetch split button: selecting its dropdown option saves a default,
  and clicking the main button executes it. No separate Fetch toolbar button.
- One Settings window; Repository is a section inside it. Old repo-settings
  commands redirect there. The duplicate toolbar gear was removed.
- Title-bar account photo/name is a passive indicator; profile dropdown removed.
  Profile management stays inside Settings, where connected account photos work.
- Outside dismissal uses pointer capture for menus so stopped bubbling cannot
  leave them open. Escape dismisses a context menu before its parent dialog.
  Unsaved repository config/info/vault drafts prevent backdrop dismissal.
- Automated native-app checks passed for resizing/shrinking/persistence, column
  toggles, Pull/Fetch selection, outside clicks and unsaved config protection.
  Live GitHub check confirmed kaschief's photo in the title bar and Settings,
  plus six recent commits. Relevant screenshots refreshed.
- Gate: 1,635 tests passed, 2 intentionally skipped; typecheck, i18n/docs lint and
  production build passed. Playground fixtures regenerated after moving paths.
- README now introduces Geminio as Kash's personal Git client, documents the
  evolved workflow and current macOS focus, and credits Gitcito in Origins.
  CONTRIBUTING, getting-started and ROADMAP distinguish this project from its
  upstream and document the English-first and single-checkout workflow.
- Installed bundle: `/Applications/Geminio.app`; dev log: `/tmp/geminio-dev.log`.
  Saved JSON path references were updated with backups at
  `/tmp/geminio-rename-backup-1790882601`.

## 7. Where things live (new modules)

| Path | What |
|---|---|
| `src/renderer/src/stores/githubAccount.ts` | Shared session GitHub identity and refresh hook |
| `src/renderer/src/components/FastTooltip.tsx` | The app's single tooltip; adopts `title` attributes |
| `src/renderer/src/components/useAiReady.ts` | Shared, cached "is AI usable" check (IPC `ai:ready`) |
| `src/renderer/src/components/NumberField.tsx` | Bounded number input that lets people type |
| `src/renderer/src/components/WorkingChangesBanner.tsx` | Uncommitted-changes row atop details |
| `src/renderer/src/lib/hunkPatch.ts` | Hunk / line patch builders (forward and reverse) |
| `src/renderer/src/lib/gitErrors.ts` | Readable git errors, overwritten-files parsing |
| `src/renderer/src/lib/graphColumnFit.ts` | Which graph columns give way first |
| `src/renderer/src/lib/commitDate.ts` | Absolute date formats |
| `src/renderer/src/lib/pathDisplay.ts` | Path depth trimming |
| `src/renderer/src/lib/boundedNumber.ts` | Draft parsing for `NumberField` |
| `src/renderer/src/lib/workingChanges.ts` | Uncommitted file count |

Main-process additions in `src/main/git.ts`: `applyHunkPatch`,
`mergeHunkIntoFile`, `stashAlreadyApplied`, `previewBody`; `ai:ready` in
`src/main/ai.ts`. New read methods are registered in `READ_METHODS`.
