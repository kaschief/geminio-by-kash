---
title: Notifications
category: Workspace tools
order: 99
summary: The bell keeps what Geminio told you — errors, finished pushes, warnings — for when you were not looking.
keywords: notifications bell badge dock unread history errors toast missed system notification macOS background alerts activity
---

# Notifications

Geminio tells you things in short messages at the bottom of the window: a push
went through, a pull failed, a hook rejected a commit. They are gone in a few
seconds — and you may have been in another app, or another Space, or asleep.
The **bell** in the title bar keeps them.

![The notifications list](../screenshots/notifications.webp)

## Knowing something happened

| You see | It means |
|---------|----------|
| A small dot on the bell | Something new, nothing wrong — a push finished, a fetch ran |
| A red number on the bell | That many unseen messages, at least one an error |
| A red number on the Dock icon | Unseen errors — visible from any other app |

Opening the bell clears both badges. An error raised while Geminio is in the
background also stays on screen until you come back, instead of timing out
unseen.

## The list

Newest first, each with the repository it came from and how long ago. Rows
that arrived since you last looked carry a dot while the list is open. Click a
row to switch to its repository. **Clear** empties the list.

The most recent 200 messages are kept, across restarts — so a push that failed
overnight is still there in the morning. Before anything is saved, a password
or token inside a URL is removed from the text.

Your **GitHub inbox**, when GitHub is connected, is the first row of the list;
it opens the inbox page (see [Hosting](hosting.md#notifications--github)).

## System notifications

**Settings → General → System notifications** decides whether macOS shows a
notification while Geminio is in the background:

| Choice | Notifies you of |
|--------|-----------------|
| **Off** (the default) | Nothing — the Dock icon and the bell only |
| **Errors only** | Anything that fails |
| **Errors and remote work** | Failures, and pushes, pulls and fetches that finish |

It is off until you choose, so macOS never asks for permission unprompted.
Clicking a notification brings Geminio forward.

## Limits

- The list is the app's messages, not a full record. Every git command Geminio
  ran, with its output, is in **Repository settings → History · Logs**.
- It is kept per machine, not synced between computers.
- System notifications follow macOS's own settings — Focus modes and
  **System Settings → Notifications** can silence them.
