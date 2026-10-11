---
title: Themes & appearance
category: Make it yours
order: 100
summary: Built-in themes, light and dark, plus custom and AI-generated ones.
keywords: scrollbar scrollbars scroll fade theme themes dark light appearance colors font size graph palette ring halo glow haze bar avatar row color unpushed local not pushed arrow dashed status dot changes conflict push badge unpushed count tab
---

# Themes & appearance

Twenty built-in themes, each with a light and a dark variant and a matching
code theme:

- **The originals:** Geminio, Nord, Dracula, Solarized, GitHub, Monokai,
  Midnight, Contrast and Daltonic.
- **Warm and earthy:** Ember (coals on charcoal, or burnt orange on
  parchment), Canyon (terracotta and ochre) and Forest (moss with amber, or
  pine on sage paper).
- **Bold and neon:** Synthwave (hot pink and cyan), Phosphor (a green CRT in
  the dark, e-ink in the light) and Abyss (deep-sea teal and violet).
- **Rich and dramatic:** Velvet (oxblood and gold), Aurora (polar night with
  northern-lights green and violet) and Sakura (plum and cherry blossom).
- **Minimal:** Ink (greyscale with one red accent) and Glacier (quiet steel
  and frost blue).

In **Settings → Appearance** the App Theme list scrolls inside its own box, two
rows at a time, and opens on the theme you are using, so twenty themes (plus any
you make) do not push the rest of the page out of reach.

Every one of the new themes keeps text, accents and syntax colours at WCAG AA
contrast in both variants. Their diffs use the theme's own green and red, and every
changed word is underlined in that colour so it stands out on the tinted
background.

![Switching from light to dark](../screenshots/clip-themes.webp)

- **Light, dark, or follow the OS**, switched live.
- **Custom themes**, and **AI-generated** ones from a prompt.
- Adjustable **code font size**.
- **No scrollbars.** Trackpad, wheel and keyboard scrolling work as usual. In the details panel and in Settings, a list with more below fades out at its bottom edge, and the fade goes away once you reach the end. Only the cut edge fades — no blur, and a short list gets a shorter fade — so every row you can see stays fully readable.
- A separate **graph style**: lane palette, corner style, row density and line
  thickness, plus the ring, haze and bar on each commit row and how unpushed
  commits stand out, all with a live mini-graph preview. Pick the **Theme**
  lane palette and the rails are drawn from the app theme's own colours, so the
  graph changes along with the theme, in light and dark.

![Theme settings](../screenshots/settings-themes.webp)

## Commit rows

Every commit row is tied to its lane three ways: a **ring** around the avatar,
a **haze** running from the avatar to the message, and a **bar** beside the
message. All three take the lane's colour, which is why a one-branch
repository is all purple: that is lane 1 of the Classic palette. The preview
in **Settings → Themes → Graph** shows each change as you make it.

| Setting | Choices |
|---------|---------|
| Avatar ring | **Thin** (the default), **Normal** or **Thick**. Sits under *Node style*, since the ring belongs to the avatar |
| Commit rows | **Off**, **Ring**, **Ring + Bar**, or **Full** (ring, bar and haze) |
| Row color | **Lane** (each row follows its lane), **Theme** (every row takes the app theme's accent and changes with it) or **Custom** (one color you pick for every row) |
| Unpushed commits | **Off**, **Dashed** (dashed ring, dotted bar), or **Dashed + Arrow** (adds a small ↑ badge on the avatar) |
| Tint the row | Also washes the whole row of an unpushed commit |

"Unpushed" means no remote-tracking branch contains the commit, as of your
last fetch. A commit someone else already pushed still looks unpushed until you
fetch. A repository with no remote marks nothing, since every commit would
qualify.

## Tab status dots

A repository tab says what is waiting in it, most urgent first:

| Mark | Means |
|------|-------|
| Pulsing amber dot | A conflict is in progress. It replaces the other marks |
| Solid number | Commits no remote has yet, so they exist only on this machine. A new branch you have never pushed counts too |
| Muted grey dot | Uncommitted changes. Sits behind the number when there are both |

A folder of tabs adds up the commits of everything inside it. A group chip
keeps its own `↑` / `↓` counts.

**Settings → Appearance → Repository Tab Status** picks a color for each mark:
**Uncommitted changes**, **Conflict in progress** and **Commits to push**. The
reset button next to each hands it back to the theme.

## Active repository

**Settings → Appearance → Active Repository** adds a thin accent outline around
the selected repository tab. It follows the theme by default. Pick a **Custom color**
for a fixed outline color, or choose **Theme accent** to follow the theme again.
Choose **Subtle** to return to the understated border.
This preference applies across repositories, including repositories inside groups.

![Active repository outline](../screenshots/active-repo-accent.webp)

![Repository tab appearance choices](../screenshots/repo-accent-choices.webp)

## App icon

On macOS, **Settings → Appearance → App Icon** offers twenty illustrated icons:
Monoline (the default), Portal, Deboss, Night slab, Terminal, Crystal, Topo,
Water, Mercury, Blueprint, Neon, Shapes, Circuit, Holo foil, Enamel pin, Patch,
Extruded, Stained glass, Toy bricks and Clay. Each one is a g in a different
material. The picker scrolls inside its own box, showing two rows at a time, so
the rest of the Appearance page stays where it is; it opens scrolled to the icon
you have chosen. Your choice changes the Dock icon immediately. In
the installed app it also updates the Finder icon, so it stays selected after
you quit and relaunch. Choose **Monoline** to go back to the icon the app
shipped with. The chosen icon wears an accent ring around the icon itself, the
way iOS and macOS mark a chosen icon.

The icons are fixed artwork, so there are no color options, and the choice is
macOS-only. The development build changes only its running Dock icon, leaving
the shared Electron runtime untouched, and applies your saved choice again each
time it starts.

![The app icon picker](../screenshots/app-icon-picker.webp)

## Layout

Sidebar on the left or the right, resizable panels everywhere, a collapsible
sidebar for when the graph deserves the whole window, and per-repository
terminal placement.

**See also:** [The commit graph](graph.md) · [Profiles](profiles.md)
