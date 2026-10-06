import { useEffect } from 'react'
import { useUIStore } from '../stores/ui'
import { useSettingsStore } from '../stores/settings'
import { unseenErrors, type Notice } from '../lib/notices'
import { repoDisplayName } from '../lib/repoAlias'

/**
 * What reaches the person when they are not looking at Geminio. Two signals,
 * both driven by the bell's list (lib/notices):
 *
 * - The Dock icon counts unseen errors — the one thing worth seeing from
 *   another app — and clears when the bell is opened.
 * - A macOS notification, only while the window is in the background and only
 *   if Settings asks for it: errors, or errors plus updates (new commits from
 *   others, work that finished while away).
 *   Off by default, so the system never asks for permission unprompted.
 */
export function useAttentionSignals(): void {
  useEffect(() => {
    let lastBadge = -1
    let lastNotified = useUIStore.getState().notices.reduce((max, n) => Math.max(max, n.id), 0)

    const sync = (): void => {
      const { notices, noticesSeenUpTo } = useUIStore.getState()
      const errors = unseenErrors(notices, noticesSeenUpTo)
      if (errors !== lastBadge) {
        lastBadge = errors
        window.api.window.setAttention(errors)
      }
      const fresh = notices.filter((n) => n.id > lastNotified)
      if (!fresh.length) return
      lastNotified = fresh[fresh.length - 1].id
      if (document.hasFocus()) return
      const mode = useSettingsStore.getState().settings.systemNotifications ?? 'off'
      for (const n of fresh) if (wants(mode, n)) announce(n)
    }

    sync()
    return useUIStore.subscribe((next, prev) => {
      if (next.notices !== prev.notices || next.noticesSeenUpTo !== prev.noticesSeenUpTo) sync()
    })
  }, [])
}

function wants(mode: 'off' | 'errors' | 'all', n: Notice): boolean {
  // Seen as it happened, or already fixed: nothing to tell.
  if (mode === 'off' || n.quiet || n.resolved) return false
  if (n.kind === 'error') return true
  // News from others (new commits, rewritten history) and work finished while away.
  return mode === 'all'
}

function announce(n: Notice): void {
  if (typeof Notification === 'undefined') return
  const { settings } = useSettingsStore.getState()
  const title = n.repoPath ? repoDisplayName(n.repoPath, settings.repoAliases, n.repoPath.split('/').pop() ?? n.repoPath) : 'Geminio' // i18n-ignore product name
  const note = new Notification(title, { body: n.message, silent: n.kind !== 'error' })
  note.onclick = () => window.api.window.focus()
}
