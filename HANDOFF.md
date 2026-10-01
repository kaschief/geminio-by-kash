# Handoff — gitcito-by-kash

State of this fork for whoever picks it up next (another agent, or a later
session). Read this first, then `CLAUDE.md` (the project's working agreement,
still authoritative except where noted below).

Last updated: 2026-10-01.

---

## 1. What this repository is

A personal fork of [MyAppDesk/gitcito](https://github.com/MyAppDesk/gitcito)
(MIT), an Electron + React + TypeScript Git client. The owner (Kaschief, the
only contributor) uses it daily and wants "their app with my flavour": upstream's
product, with local fixes and UX changes on top, still able to take upstream
updates.

| | |
|---|---|
| Local folder | `~/Code/gitcito-by-kash` |
| `origin` | `https://github.com/kaschief/gitcito-by-kash` (public) — push here |
| `upstream` | `https://github.com/MyAppDesk/gitcito` — fetch only; push is set to `DISABLED` |
| Branch | `main`. No feature branches or PRs: commit straight to `main` and push |

## 2. Working rules (the owner's, on top of `CLAUDE.md`)

- **Commit only when asked.** When asked: run the gate (§4), commit to `main`
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
- **Installed app** (`/Applications/Gitcito.app`, unsigned, arm64):
  ```bash
  npm run build && git checkout -- src/renderer/src/licenses.generated.json
  CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir --arm64 \
    --publish never -c.mac.identity=null
  ditto dist/mac-arm64/Gitcito.app /Applications/Gitcito.app
  ```
  Replace the copy in `/Applications` only after confirming with the owner.
  The installed app keeps its settings separately from the dev app
  (`~/Library/Application Support/gitcito` vs `gitcito-dev`).
- **Updates:** the app checks upstream for releases and shows a notice, but
  never downloads or installs (`SELF_INSTALL = false` in `src/main/updater.ts`)
  — installing upstream's build would wipe the fork's changes. Taking an update
  = `git fetch upstream`, show the owner what changed, merge `upstream/main`
  into `main`, rebuild.

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

Expected today: everything passes except **two tests that already failed
before any fork changes** (not investigated):

- `test/newFeatures.test.ts` › deleteRemoteBranch (stale tracking ref)
- `test/gitOps.test.ts` › automated bisect (git bisect run) — `status.finished` is false

Anything else red is a regression.

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
  divider fits **all** columns to widest visible entry or heading (≤ 35% of the
  graph each).
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

## 6. Open items and known gaps

Not done, roughly by value:

1. **Title Case sweep.** About 70 English action labels converted; ~250 more
   elsewhere are still sentence case. Rule: buttons and menu items Title Case;
   tooltips, empty states, dialog messages stay sentence case.
2. **File context menu** has both "Open in Visual Studio Code" and "Open with
   Visual Studio Code" — check what each does and merge or rename.
3. **Never checked visually at Sidecar size.** Narrow-width fixes were made
   from code reading. The screenshot tool (`npm run screenshots`, Playwright
   against the built app) could capture them at 1366×1024 — ask first.
4. **Translated handbook pages** (`docs/help/<locale>/`) lag the English
   pages. Fine under the English-only rule; delete or leave, owner's call.
5. **Screenshots** in `docs/screenshots/` predate the fork's UI changes.
6. **Column fit measures visible rows only** (the list is virtualized). Long
   entries further down may still be cut; a second double-click after
   scrolling picks them up.
7. **The two pre-existing failing tests** (§4) are uninvestigated.
8. `label` in the composer's file context menu is a hardcoded English
   `"N files"` string (fine in English-only, but not dictionary-backed).

## 7. Where things live (new modules)

| Path | What |
|---|---|
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
