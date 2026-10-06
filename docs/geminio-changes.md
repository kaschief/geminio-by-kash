# What Geminio changes

> **This is a running list.** It is kept up to date as the fork changes, not
> written once:
>
> - When an improvement lands, add an entry under the theme it belongs to, in
>   the same shape: what changed, the problem it solves, its limits, and a link
>   to the handbook section that covers it.
> - One entry per change someone would notice — a user, or a developer taking
>   the project over — not one per commit. Fold follow-up fixes into the entry
>   they refine.
> - When something stops being true (reworked, reverted, replaced by upstream),
>   edit or remove its entry in the same change. The list describes the app as
>   it is, not its history.
> - Leave out trivial churn: refactors, copy tweaks, a moved pixel.
>
> The [README](../README.md#what-geminio-adds) carries a one-line digest of
> this list and the website's front page shows its headline items; update them
> when an entry big enough to belong there is added or removed.

Geminio began as a fork of [Gitcito by MyAppDesk](https://github.com/MyAppDesk/gitcito),
taken at upstream's **v4.10.0** release. Everything Gitcito does, Geminio
still does; this page is the record of what the fork changed on top, and why.

Upstream is followed, not abandoned. The app still checks Gitcito's releases
and announces a new one, but it opens the release notes instead of installing
it — upstream's build would replace this one and drop every change listed
below. Taking an upstream release means merging `upstream/main` into this
repository and rebuilding ([Updates & distribution](#updates--distribution)).

Each entry says what changed, the problem it solves, and where the handbook
covers it. Limits are stated where they matter.

**Contents**

- [Identity & accounts](#identity--accounts)
- [Workspace & tabs](#workspace--tabs)
- [Graph](#graph)
- [Staging, diffs & files](#staging-diffs--files)
- [Undo & recovery](#undo--recovery)
- [Menus & interaction design](#menus--interaction-design)
- [Settings & appearance](#settings--appearance)
- [Safety & credentials](#safety--credentials)
- [Updates & distribution](#updates--distribution)
- [Developer workflow & tooling](#developer-workflow--tooling)

---

## Identity & accounts

**Renamed to Geminio, without losing data.** The app, the `geminio` CLI, the
repository rules file (`.geminio.json`), the package identifiers and the
documentation all carry the new name. On first launch Gitcito's saved
settings, encrypted secrets and browser storage are copied once into the new
app-data folder; neither installation is overwritten. Existing `.gitcito.json`
rules and encrypted `.gitcito` bundles still read. *Limit:* some internal
storage keys and Git refs keep their old names on purpose, so older data stays
compatible. ([Repository rules](help/repo-config.md) · [CLI](help/cli.md))

**GitHub without a new sign-in.** Hosting features find a token in this order:
the active profile's explicit token, then an existing GitHub CLI (`gh`) login,
then Git's credential helper — for HTTPS and SSH GitHub remotes alike. The CLI
token is held in main-process memory only; nothing is written to profile
settings or global Git config. **Settings → Integrations → GitHub** shows the
connected account and a **Connect GitHub** retry. *Limits:* signing in itself
is still `gh auth login` or a helper/PAT; fetch and push keep using Git's own
credential helper or SSH. ([Connecting GitHub](help/hosting.md#connecting-github))

**Your GitHub photo, where it belongs.** The connected account's avatar appears
in the title bar, in Settings, and on commits whose author email matches the
account's public, verified or GitHub no-reply addresses. Other authors keep
Gravatar or generated avatars. *Limits:* matching is by email only, never by
display name, and private emails match only when the token can read them.
([Author avatars](help/avatars.md))

**A passive account indicator.** The title-bar name and photo show who you are
working as; the profile dropdown was removed so profiles are managed in one
place, Settings. ([Profiles](help/profiles.md))

**No MyAppDesk co-author trailer.** Upstream appended
`Co-authored-by: MyAppDesk <team@myappdesk.dev>` to every commit made from the
app unless you found and turned off a setting. Geminio removes the setting and
the trailer: your commits credit the people who wrote them. The co-author
picker for real contributors remains, and someone already credited in the
message now shows as on (and inert) instead of being offered again.
([Committing](help/committing.md))

## Workspace & tabs

**Sort tabs by what needs you.** Right-click any tab → **Sort tabs**: Manual,
Needs attention (conflicts, then unpushed commits, then uncommitted changes),
Unpushed commits, Uncommitted changes, Behind remote, Name, or Recently opened.
A chosen order is *held*: it re-applies when a tab opens or closes and when the
window regains focus, never mid-work, so a commit does not slide a tab out from
under the cursor. At launch the strip waits until every repository has loaded,
then reorders at most once. Dragging a tab switches back to Manual. Groups sort
by their repositories' totals. *Limits:* page tabs stay at the end, a
repository that cannot load sorts last, and counts are only as fresh as the
last refresh or fetch. ([Sorting tabs](help/workspaces.md#sorting-tabs))

**Unpushed commits on the tab.** A tab, folder or group member shows a solid
count of commits no remote has yet, ahead of the uncommitted-changes dot; a
conflict replaces both. The count picks dark or white text to stay readable on
any badge colour. Changes, Conflict and Push colours are each configurable.
([Tab status dots](help/themes.md#tab-status-dots))

**See which repository is active.** An optional 1px accent outline around the
selected repository tab — Subtle, Theme accent, or a Custom colour — without
changing tab geometry. ([Active repository](help/themes.md#active-repository))

**Each repository keeps its own working view.** Switching tabs parks and
restores the selected commit, open file, viewer mode, scroll position, find
query, graph filters, sidebar and right-panel tabs — and unsaved text in the
file editor, held in memory without touching disk. The last diff paints
immediately on return instead of flashing a blank loading frame, and the right
panel no longer re-animates open. *Limit:* parked views live in memory and do
not survive a restart. ([Working in several repositories](help/workspaces.md#working-in-several-repositories))

**Moved or missing folders don't spam errors.** A saved tab whose folder is
gone shows **Locate** and **Retry** instead of background error toasts at
startup; the tab is kept until you reconnect or close it.
([Moved or unavailable folders](help/workspaces.md#moved-or-unavailable-folders))

**A quieter title bar.** The workspace name, mascot, workspace dropdown and
gauge are replaced by one small dashboard icon that opens Mission Control;
workspace management lives in Settings → Workspaces. In macOS fullscreen the
gap reserved for window buttons is removed. ([Mission control](help/mission-control.md))

**Filing repositories in folders.** In a group's **Move to folder** and **Move
folder to** menus, the current location is shown as the chosen option and
disabled with an "Already here" tooltip. Before, **Move folder to** offered the
folder's current parent as an ordinary destination — a move that did nothing.
([Workspaces, tabs & groups](help/workspaces.md#groups))

## Graph

**Arrange columns directly.** Right-click any column header for the columns
menu. Drag to reorder or resize; double-click any divider to fit *all* columns
to the widest loaded entry (including rows outside the viewport), each capped
at 35% of the graph. Column widths have maximums, the header scrolls sideways
with the rows, and in a narrow graph the branch and graph columns shrink before
the message does. *Limit:* fitting measures loaded history only; a very long
value can still truncate at the cap. ([The commit graph](help/graph.md))

**One layout for every repository.** Graph column order, widths and visibility,
and sidebar section order, visibility and expansion, are global. Branch pins
and branch-folder expansion stay per repository. On first run the active
repository's old layout is adopted. ([The commit graph](help/graph.md))

**Dates and descriptions your way.** A date format setting (relative, date &
time, ISO); in relative mode the hovered row shows the exact date in place.
Optionally, the start of each commit's description follows its title in a
quieter shade, with trailers like `Co-authored-by` left out.
([The commit graph](help/graph.md))

**Unpushed commits stand out.** Commits no remote-tracking branch contains get
a dashed avatar ring and dotted bar, with an optional ↑ badge and row tint.
Commit-row accents (Off, Ring, Ring + bar, Full; lane or custom colour) and the
avatar ring thickness (Thin by default, Normal, Thick) are adjustable with a
live preview. *Limits:* "unpushed" is as of your last fetch, and a repository
with no remote marks nothing. ([Commit rows](help/themes.md#commit-rows))

**Calmer rows.** A whole-row hover tint replaces the subject pop-out, and WIP
and stash rows keep the same minimum width as commits so columns stay aligned.
With the sidebar closed, the first column keeps a small gap from the window
edge.

**Jump to GitHub.** The short hash in the details panel links to the commit on
GitHub, and branch menus in the graph, sidebar and branch picker gain **View on
GitHub**. ([Commit details](help/graph.md#commit-details))

**Find a commit from the keyboard.** <kbd>⌘F</kbd> outside a file jumps to the
commit search; <kbd>Esc</kbd> clears it, a second <kbd>Esc</kbd> leaves it. The
search is disabled while a file covers the graph. ([Keyboard](help/keyboard.md))

## Staging, diffs & files

**Commit and undo keep their context.** Undoing a commit used to leave
Details on "Commit not found" and throw the message away; committing closed
Details, then opened it again a moment later. Now committing moves Details
straight to the new commit — closing any file you had open, so the commit and
all its files are what you see — undoing moves it to the working changes with the
message and description back in the composer (never over text you typed), and
undoing an amend returns to the commit before the amend instead of dropping it.
A commit taken off outside the app is offered on Redo, by name, not on Undo;
Redo is withdrawn once new work moves `HEAD`, instead of failing with "try
again"; and a change an agent makes in the second after one of Geminio's own
writes is no longer mistaken for Geminio's, so it can be undone.
*Limits:* only the commit that was HEAD is followed; an older commit that
leaves history keeps its view. ([Committing](help/committing.md#amend),
[Recovery](help/recovery.md#changes-made-outside-geminio))

**Commit hints that know your repository.** The composer's hints used to say
"Capitalize the subject" in a repository whose commitlint rejects capitals, and
appeared on the first keystroke; a rejected commit said only that the hook
rejected it. Now the hints follow the style the repository's history shows,
wait until a word is finished, and a hook rejection names each rule that
failed. *Limits:* the style is inferred from history, not read from the
commitlint config. ([The linter](help/committing.md#the-linter))

**An open file keeps up with git outside the app.** A working-tree file you
were reading used to keep the side it opened on: if a terminal or an agent
staged it, the pane said "No changes to display" under an Unstaged chip, and a
commit left it blank. Now the view switches between staged and unstaged as the
file does, follows a file committed outside the app into the new commit (Details moves
to that commit with it, rather than closing), returns to the staged or unstaged diff when
that commit is undone, moves on with an amended `HEAD`, and closes only when
the change is discarded.  *Limits:* paused while you edit in place; follows only into the
commit at `HEAD`. ([When the file changes under you](help/diffs.md#when-the-file-changes-under-you))

**Hunk and line actions on every diff.** Stage or Discard (unstaged), Unstage
(staged), Revert (a commit) and Apply (a stash) — on a whole hunk or on
selected lines, in unified and split view, each with an undo entry. Discard
asks first, and working-tree actions take a WIP snapshot. When the file has
moved on, Revert and Apply fall back to a three-way merge; overlapping edits get
conflict markers and a notice, and a hunk that no longer applies says so instead
of reporting success. Hunk buttons stick to the visible edge so long lines
cannot hide them. *Limits:* new untracked files have no hunks, and conflicted
files' combined diffs take no hunk actions.
([Hunk and line actions](help/staging.md#hunk-and-line-actions))

**Inline diffs, moved code, and whitespace that stays ignored.** The diff
layout is one choice of three — Unified, Split, or the new **Inline**, which
shows a small edit as one line with removed words struck through and added
words lit. Pairs that would not read well inline (over half the line changed,
whitespace-only, runs that do not pair one to one) stay as −/+. Selecting an
inline line for a line action selects both halves; copying it copies the new
text. **Moved code**, on by default, tints blocks that were only moved within
the file in blue, with arrows toward the other end, in every layout. **Ignore
whitespace** is now remembered across files and sessions, and hunk actions
keep working with it on, leaving the hidden whitespace changes in place.
*Limits:* moves are found within one file only, blocks under 20 letters and
digits are ignored (as git does), and a block moved and edited is not marked.
The old split setting carries over as the Split layout.
([Diffs](help/diffs.md#inline-layout))

**Long commit messages stay in their place.** A message past about 120
characters is set slightly smaller and tighter and stops at four lines with a
fade; clicking the text opens it in place. Short messages are unchanged, and
links and text selection inside keep working. *Limit:* it is the message as
written — a one-line message is not reflowed into a list.
([Commit details](help/graph.md#commit-details))

**Filter by kind of change.** The counts above a file list — working
changes, a commit, a stash — read like `git diff --stat` (`~7 +3 −1 →1`),
drawn as one capsule or as loose numbers (Settings → Files & diffs), and are
also its filter:
click one to show only that kind, click it again, the total at the start, or <kbd>Esc</kbd> to clear,
<kbd>⌘</kbd>/<kbd>Ctrl</kbd>-click to combine kinds. The filter stays as you
move between commits and steps aside on a commit with none of that kind, so the
list is never mysteriously empty. In working changes it narrows the
conflicted, unstaged and staged lists together.
([Commit details](help/graph.md#commit-details))

**Pull between files.** At the end of a diff, pause and pull a little further:
the view stretches to preview the next file, and releasing past the threshold
opens it (the same at the top for the previous one). One gesture moves one
file, follows the visible list's order and filters, and never wraps around.
Fast, Quick, Balanced or Deliberate, or off. *Limits:* editing, horizontal
scrolling and zooming never switch files; momentum alone cannot start a pull.
([Pull between files](help/diffs.md#pull-between-files))

**A file viewer header that stays put.** Display toggles sit in the header as
an icon group and are disabled rather than hidden when they do not apply, so
nothing jumps. Find and the line-selection actions float on an overlay instead
of pushing code down; <kbd>Esc</kbd> in find closes find, not the file; the
counter reads "N of M" or "No results". Wrap works in unified view. Hunk headers
are quieter, with optional code context. The Explain and Link buttons are gone;
Copy path, Copy link and Edit file live on the path's right-click menu. Narrow
headers scroll sideways with an edge fade. ([Diffs & previews](help/diffs.md))

**Your editor, one click away.** An editor button sits beside Close for the
current file. VS Code, Cursor and Windsurf receive the repository folder
alongside the file, preserving Workspace Trust. When the preferred app and the
editor are the same, file menus show one entry instead of two.
([External editor](help/editor.md))

**File lists you can shape.** A–Z sort for flat lists (git's byte order is the
default), a **Folders shown in paths** setting, and file names that never
truncate — folders give way from the left instead. The same View as (path or
tree) and Sort by choices are on every file and folder right-click menu in the
staging, commit and stash lists; both places write the same setting.
([Path, tree, and order](help/staging.md#path-tree-and-order))

**Discarding is explicit.** **Discard All Changes** sits at the top-left of the
changes panel and asks first. Right-click discard names its target ("Discard
changes to kash-os.pine"), so it never reads as discarding everything.
([Discarding](help/staging.md#discarding))

**Know there are changes from anywhere.** While looking at a commit or stash, a
banner says how many files have uncommitted changes, with a way back; the
status bar shows the same count. When the tree becomes clean, a selected WIP
row is cleared instead of leaving empty details open.
([Knowing there are changes](help/staging.md#knowing-there-are-changes))

**Room for the message.** The commit composer has a draggable top divider; the
description grows with it and the height is remembered.
([Committing](help/committing.md))

**Messages that name the file.** One file is named, several are counted:
"Staged config.js" rather than "Staged 1 file(s)". This covers stage, unstage,
discard, restore from commit or stash, untrack, ignore, smart stage, secure
share, wiki export, PR-preview conflicts and repository-chat actions, and the
commit button itself ("Commit config.js"). Long names lose their middle, never
their extension. A destructive confirm for one file names it in full.

**Stashes that explain themselves.** A stash git refuses to re-apply because
its changes are already in the working tree is recognised and offered for
dropping; otherwise the files in the way are named. Git error toasts lead with
git's own error line. *Limit:* the check compares contents, so it cannot tell
an applied stash from edits retyped identically.
([When a stash will not apply](help/stashes.md#when-a-stash-will-not-apply))

## Undo & recovery

**Undo what happened outside the app.** Undo and Redo read the reflog, so a
commit, amend, reset, merge, pull, rebase or checkout made from a terminal,
editor or coding agent can be walked back. Each is previewed first (what, when,
by whom, whether it was pushed), and HEAD is re-checked before acting. The
toolbar tooltips name the next undo and redo. *Limits:* the reflog only records
ref moves — staging, stashing, file edits and branch creation outside the app
cannot be undone this way, and work lost to an outside `reset --hard` is gone.
([Changes made outside Geminio](help/recovery.md#changes-made-outside-geminio))

**"Reset <branch> to here" is one row.** On tags and branch labels, three rows
that each repeated the branch name and hung the mode off a dash became one row
with a Soft / Mixed / Hard flyout, each with what it does to your work ("Keep
changes staged", "Keep changes unstaged", "Discard changes"). Hard still
confirms. With a detached HEAD the row is disabled and says why.
([Cherry-pick, revert, reset](help/merging.md#cherry-pick-revert-reset))

## Menus & interaction design

**State you can read at a glance — and no tick marks.** Every menu and picker
uses one vocabulary:

| State | How it looks |
|-------|--------------|
| One choice among several (sort order, pull mode, run target, gitmoji) | A lit accent dot beside the chosen row |
| An on/off (graph columns, sidebar sections, path filter) | The row's icon lights up; the menu stays open so several can be flipped in one visit |
| A setting inside a submenu | The parent row shows the current value ("Needs attention"), or a dot when a toggle inside is on. A first, default option is not repeated |
| A selected card or swatch (themes, palettes, group colours) | An accent ring standing just off the edge |

Ticks are gone from menus, the branch picker, owner and launch-input pickers,
the language picker and the workspace list. The rows announce themselves to
assistive technology as `menuitemradio` / `menuitemcheckbox`, and cards carry
`aria-pressed`.

**An icon on every row, one icon per meaning.** Menu rows draw from a shared
set (`components/menuIcons.tsx`), so "copy", "discard" or "reveal" wears the
same icon in every menu and can be recognised without reading. Editors get
outline versions of their own marks at the same stroke weight, instead of
full-colour app icons in a monochrome list.

**Sentence case.** Labels across the app — menus, buttons, titles, command
names — read "Copy file path", "Open with…", "Reset to commit…" rather than
Title Case. Proper nouns and acronyms keep their capitals (GitHub, SHA, PR).

**Disabled rows say why.** Hovering a greyed row explains it: the branch is
already checked out, Git cannot delete the branch you are on, no branch is
checked out, the branch has no upstream, this is the worktree you are in, the
file is already ignored, the folder is already there.

**Menus close when you click away — anywhere.** Outside clicks use pointer
capture so a component that stops event bubbling cannot keep a menu open, and
the title bar (a window-drag region the page normally never sees clicks from)
now dismisses a menu too. A click away only dismisses: it does not also land
on whatever is under the pointer, so closing a menu over a file list never
selects a file or switches the view (a right-click still opens the next menu
in one go). <kbd>Esc</kbd> closes a context menu before its
parent dialog, and Settings ignores a backdrop click while a repository config,
info or vault editor has unsaved changes. *Limit:* the window cannot be dragged
by its title bar while a menu is open. ([Per-repository settings](help/repo-settings.md))

**One tooltip, timed to the control.** A single tooltip style takes over every
titled control. Icon-only controls tip quickly; controls with a visible word
wait about a second, so passing over them is not noisy; a tip that only repeats
the label is dropped.

**Selected controls answer the pointer.** A selected segment or toggle deepens
its tint on hover like its neighbours brighten, instead of looking inert.

**Less noise.** Success toasts only for what you cannot see happen (remote
work, results elsewhere) — errors always. Success toasts drop their Copy
button. AI buttons appear only when AI is on and a key is stored. Forward
actions are green, backward and destructive ones red.

**A smaller toolbar.** Repository and branch selectors are single-line pills.
Pull and Fetch are one split button: the dropdown saves the default action and
the main button runs it. The right-panel toggle (<kbd>⌥⌘B</kbd>) reopens what
it last showed; the panel ✕ and the toolbar Chat button were removed as
duplicates. ([Fetch and pull](help/workspaces.md#fetch-and-pull) ·
[Navigation](help/repo-menu.md))

**No scrollbars.** Scrollbars are hidden app-wide; the details panel and
Settings fade out at the bottom while more content remains.
([Themes & appearance](help/themes.md))

## Settings & appearance

**Quieter details panel, clearer icon picker.** A list with more below used to
end in a blurred, dimmed band as tall as a row and a half — on a short list it
covered most of the second row and read as disabled. Now only the cut edge
fades, scaled to the list, and every row in view stays readable. Commit details
show the commit's description under its subject, as other clients do. The app
icon picker drops its padded cards: the chosen icon gets a ring around the icon
itself, not around its label. ([Commit details](help/graph.md#commit-details),
[App icon](help/themes.md#app-icon))

**One Settings window.** Repository settings are a section of the app's
Settings window instead of a second window; the duplicate toolbar gear is gone
and old repo-settings commands redirect there.
([Per-repository settings](help/repo-settings.md))

**Reorganised and searchable.** Sections are General, Appearance, Layout,
Graph, Files & Diffs, Profile, Workspaces, Integrations, AI, Security,
Shortcuts and Data, with option cards instead of bare dropdowns. A search field
matches labels and descriptions, dims unrelated sections and opens the right
tab. *Limit:* the index is generated from component copy at dev/build time, so
a label added without a rebuild is not searchable yet.
([Finding a setting](help/search.md#finding-a-setting))

**Your app icon.** Ten illustrated icons (Monoline, the default, then Portal,
Deboss, Night slab, Terminal, Crystal, Topo, Water, Mercury and Blueprint)
replace the older Classic, Monogram, Branch and Orbit styles, their six colours
and the GitHub photo option. The Dock changes immediately; in the installed app
the Finder icon changes too and survives quitting. *Limits:* the icons are fixed
artwork with no colour options; a choice saved by an earlier version falls back
to Monoline; the development build changes only its running Dock icon.
([App icon](help/themes.md#app-icon))

**Number fields you can type into.** Bounded number inputs no longer clamp on
every keystroke.

**Geminio light.** Inactive file-view controls are muted grey with softer
group borders; selected and hover states keep the accent.

## Safety & credentials

**No stacked Keychain prompts.** The sidebar's hosting sections polled in the
same tick, each running its own `git credential fill`, so macOS raised one
Keychain dialog per section and each lookup waited out a 10-second timeout.
Background lookups now share one in-flight request per key, and a background
lookup that times out stops asking until you connect on purpose.

**No needless Safe Storage prompt.** With no app secrets to decrypt or migrate,
settings load without touching the keychain; Git keeps using its own
authentication.

**Confirm text in the dictionary.** Confirmations for adding to `.gitignore`
and untracking, stopping tracking, and deleting from disk were hardcoded
English; they are now dictionary strings like the rest of the UI.

## Updates & distribution

**Upstream releases announced, never installed.** The updater still checks
MyAppDesk/gitcito and shows the notice, re-checking every three hours, but the
button opens the release notes instead of downloading. Taking an update means
merging `upstream/main` and rebuilding.

**A local macOS install that keeps your icon.** `npm run install:mac` builds
Apple Silicon only, carries the Finder custom icon into the new bundle, moves
old copies to the Trash and unregisters them, leaving one Launch Services
entry. *Limit:* it is unsigned and arm64 only; Windows and Linux packaging
configuration is retained but not validated.

**The website is this fork's.** The Pages workflow builds from the
`geminio-home` branch for <https://kaschief.github.io/geminio-by-kash>,
source and edit links point at this repository, and the front page shows what
Geminio adds alongside the inherited headline features. *Limit:* it deploys
only once GitHub Pages is enabled for the repository (Settings → Pages →
GitHub Actions).

## Developer workflow & tooling

**English-first.** New strings go into `en.ts` only; the other locale
dictionaries are typed `Partial` and fall back to English at runtime. The
inherited interface translations are kept so upstream's edits to them still
merge. *Limit:* non-English users see English for anything the fork added.

**An English-only handbook.** The translated handbooks and the
website's translated copy are gone; Help and the site show the English pages
in every interface language. The translations described upstream's app, and
every feature the fork adds made them more wrong. `npm run lint:docs` rejects a
translated handbook directory, so an upstream merge cannot quietly bring one
back. *Limit:* readers who do not read English lose a manual in their
language. ([Languages](help/languages.md#this-handbook-is-in-english))

**Install scripts allowed.** `package.json` approves install scripts for
Electron, esbuild and node-pty, which npm's install-script gate had blocked
(leaving Electron missing and the integrated terminal unbuilt).

**Real-app verification scripts.** `examples/screenshots/verify-*.cjs` drive
the built app to check repository switching, layout stability frame by frame,
Settings search, the title bar at startup, app-icon persistence, empty details
and the personalisation features. Clip capture falls back to `img2webp` when
Homebrew's ffmpeg lacks libwebp.

**Sturdier tests.** The remote-branch deletion test no longer depends on the
machine's default branch name, and bisect accepts both of git's "first bad
commit" wordings.

**Working agreement.** `CLAUDE.md` is the contract for anyone changing the
code: the gate, the UI house style (sentence case, state marks, menu icons),
and the rule that every user-facing change updates the handbook and this list.
It asks agents to start the dev app after every change so the owner can see
it, and never to quit or reinstall the installed app without approval.
