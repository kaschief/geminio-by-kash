---
title: Stashes
category: Sync & many repos
order: 52
summary: Partial stashes, per-file apply, and stash → branch.
keywords: stash stashes partial keep-index apply pop drop untracked branch change summary chips
---

# Stashes

Stashing in Geminio is not all-or-nothing.

| Action | What it does |
|---|---|
| **Stash** | Everything, including untracked files if you want, with a message |
| **Partial stash** | Tick just the files you want; optionally `--keep-index` |
| **Apply / Pop** | Whole stash, **just some of its files**, or — from the stash's diff — [a single hunk or a few lines](staging.md#hunk-and-line-actions) |
| **Stash → branch** | `git stash branch` — the escape hatch when a stash will not apply cleanly |

Selecting a stash shows its files and diffs, exactly like a commit. The header
above the list is the same per-kind breakdown. Its file list multi-selects with
the same gestures as [staging](staging.md) —
<kbd>⌘</kbd>/<kbd>Ctrl</kbd>-click, <kbd>⇧</kbd>-click,
<kbd>⇧</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> — and a right-click (or the *Apply n
files* button) restores just the selection.

![A partial stash: tick only the files that should go in](../screenshots/stash-partial.webp)

## When a stash will not apply

If applying a stash would clobber untracked files, git stops. Geminio offers to
overwrite them and retry, rather than leaving you to work out the incantation.

If files the stash touches have uncommitted edits, git refuses too. Often those
edits *are* the stash: a pull that set your changes aside and put them back
leaves the stash in the list as well. Geminio checks for that. When your working
directory already holds exactly what the stash would restore, it says the
stash is already applied and offers to drop it. Your changes stay where they
are. Otherwise it names the files in the way, so you can commit or stash them
first.

The check compares file contents, so it cannot tell a stash you applied apart
from one whose edits you happened to retype exactly. Either way, nothing would
change by applying it.

If the tree has moved too far, **stash → branch** recreates the branch the stash
was taken from, applies it there cleanly, and drops the stash.

## Not to be confused with snapshots

[WIP snapshots](recovery.md) are automatic and hidden; stashes are deliberate
and listed. Snapshots never touch your stash list.

**See also:** [Recovery](recovery.md) · [Staging](staging.md)
