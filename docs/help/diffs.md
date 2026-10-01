---
title: Diffs & previews
category: Reading changes
order: 20
summary: Split view, word-level highlighting, image diffs and file previews.
keywords: diff split side-by-side word level whitespace image diff preview markdown docx pdf change gutter minimap
---

# Diffs & previews

## Reading a diff

In the file viewer the toggles sit in its header, as a row of icons next to
**File View · Diff View · Blame · History**. Hover one for its name. In
comparison dialogs, which have no header of their own, they float over the
top of the diff with their labels. A toggle that does not apply to the current
view stays in place but greyed out, so the row never shifts under the pointer.

| Toggle | What it does |
|---|---|
| **Unified ↔ split** | Side-by-side when you want to compare, stacked when you want to read |
| **Word-level** | Highlights just the changed tokens inside an edited line — red on the old, green on the new |
| **Ignore whitespace** | Hides reindentation so the real change surfaces |
| **Wrap** | Folds long lines inside their row (or column, in split view) instead of scrolling the diff sideways |
| **Linked** (split, wrap off) | Scrolls both halves together, vertically and sideways — off, each column scrolls on its own |
| **Find** / <kbd>⌘F</kbd> | Find inside the diff, with next/previous stepping; <kbd>Esc</kbd> closes it |

Wrap is off by default, so one line stays on one row. In split view that keeps
the two sides comparable row for row, with each half carrying its own sideways
scrollbar. Turn
it on when you would rather read a long line than chase it — the cost is that a
line folding over three rows on one side no longer sits opposite its
counterpart. Every toggle remembers its state across files and sessions.

With wrap off the two halves scroll **linked** by default — vertically, which
keeps the rows facing each other, and sideways, so column 90 on the left sits
above column 90 on the right. Unlink them when the sides have drifted apart —
an indented block against an unindented one, a rename that shifted every line —
or when you want to compare two distant regions of the same file, and park each
half where its own content is.

In Geminio light mode, unselected header controls use a softer grey; the
selected mode and enabled toggles retain their purple highlight.

![File viewer controls in Geminio light](../screenshots/file-view-controls-light.webp)

![Split diff with word-level highlighting](../screenshots/split-diff.webp)

![Diff, find and selection controls in a narrow window](../screenshots/sidecar-diff.webp)

The header controls scroll horizontally when the pane is narrow. Find and
selected-line actions float within the viewer without moving the code.

## Pull between files

When reading a commit, stash, or staged/unstaged file list, scroll to the bottom
of the current diff, pause, then pull a little further. The view stretches to
show the next filename and a circular progress indicator. Keep pulling until
the ring fills and **Release to open** appears, then stop scrolling. A brief
release animation marks the switch before the next file slides into place. A shorter pull springs back. At the top, the same
gesture opens the previous file at its bottom.

The pause separates your deliberate pull from trackpad momentum. One gesture
moves one file, following the visible list's sort order and filters. It stops
at the first and last file and keeps staged and unstaged files separate.
It works in unified and split diffs, and in read-only File View. Horizontal
scrolling, zooming, and editing a file do not switch files. Press **Esc** to
cancel a pull. Scrolling inside the newly opened file works immediately.

In **Settings → Files & Diffs**, turn **Pull between files** on or off and
choose **Fast**, **Quick**, **Balanced**, or **Deliberate** under **Pull feel**. Balanced
is the default. Fast is a little lighter and quicker than Quick. Quick needs a shorter pull and switches faster; Deliberate
keeps the longer stretch and slower transition. These settings apply across
all repositories.

![Pull gesture settings](../screenshots/file-pull-settings.webp)

![Pulling toward the next file](../screenshots/elastic-file-navigation.webp)

### Hunk headers

Each hunk opens with a header such as `@@ -396,7 +396,7 @@ if barstate.islast`.
The numbers say where the hunk sits: it starts at line 396, and 7 lines are
shown on each side. The text after them is the code git found enclosing the
change, usually the function or block it belongs to. Git guesses it from the
indentation and keywords, so in some languages it is the nearest line that
merely looks like a heading. To show only the line numbers, turn off **Code
context in hunk headers** in Settings → Files & Diffs.

Above every diff sits the [semantic summary](semantic-diff.md) — what changed,
symbol by symbol, rather than line by line.

## Image diffs

Changed images get a real comparison: side by side, or a swipe handle to drag
between before and after.

![Image diff](../screenshots/image-diff.webp)

## Change gutter & minimap

The **File view** of a working-tree file — staged or not, tracked or brand new
— carries a colored bar next to every line touched since HEAD (or the index,
for staged files): green for an insertion, blue for a modification, a small
red wedge where lines were removed without replacement. Click a bar to see
that change without leaving the file — the popup shows the removed and added
lines, with next/previous to step through every change in the file.

![Change gutter with a hunk popup open, minimap on the right](../screenshots/change-gutter.webp)

The **minimap**, off by default, adds a scaled overview of the whole file at
the right edge — click or drag it to jump around, the way a scrollbar would if
it could also show you the shape of the file. Both are per-machine toggles
under **Settings → Files & Diffs → File viewer**.

Neither reads history: switch to Diff, Blame or an older commit and the gutter
disappears — those views already show every change directly.

## Preview anything

The **Preview** mode renders the file instead of showing its source: Markdown,
Word (`.docx`), Excel (`.xlsx`), PDF, video, audio, images, and
syntax-highlighted code for everything else.

![Markdown preview](../screenshots/markdown-preview.webp)

### Apple property lists

`Info.plist` and `*.entitlements` are XML, and XML is not what anyone is trying
to read. Preview shows the key/value outline instead — the shape Xcode's own
plist editor shows — with the nesting intact and each value's type beside it.

![An Info.plist as a key and value outline](../screenshots/preview-plist.webp)

Two limits. A **binary** plist (`bplist00`) is recognised and named, not decoded
— run `plutil -convert xml1` on it if you want it here, though a binary plist in
a repository is usually a build artefact that should not be committed. And
`<data>` values are shown as a byte count rather than as base64: a blob tells
you nothing, and a provisioning profile rendered into a pane you might be
sharing tells everyone else too much.

### Xcode projects

A `project.pbxproj` is one flat dictionary of objects that point at each other
by id, so reading it in order tells you almost nothing about the project. The
preview walks those references and rebuilds the three things you actually came
for: the **targets** with their build phases, the **group tree** as the Xcode
navigator draws it, and the **build settings** per configuration.

![A project.pbxproj as targets, a file tree and build settings](../screenshots/preview-xcodeproj.webp)

It is a reader, not an editor — nothing here writes to the project. For what
happens when two branches both edit one, see
[resolving conflicts](conflicts.md).

## Very large files

Previews and the file view load a file fully into memory, so both refuse files
past a size cap (32 MB for previews, 16 MB for text) and tell you how big the
file is instead. **Load anyway** overrides the cap for that one file — nothing
is off limits, big loads are just opt-in. Files and diffs past a few thousand
lines still render completely, but rows scrolled out of view are no longer
laid out and painted, so a giant lockfile diff stops costing a laptop's worth
of memory.

![A file past the size cap, offering Load anyway](../screenshots/file-too-large.webp)

## Files tab

The left sidebar's **Files** tab browses the working tree itself, with status
badges on folders (added / modified / deleted) that aggregate what is inside
them.

![The files tab with a preview](../screenshots/file-tree.webp)

![Folder badges totalling what changed inside each one](../screenshots/tree-badges.webp)

**See also:** [Semantic diff](semantic-diff.md) · [Staging](staging.md)
