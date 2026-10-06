// The notification history behind the title-bar bell. Every message the app
// shows as a toast is kept here too: a toast is gone in seconds, and the person
// may not have been looking. Pure, so the badge and the list are testable
// against plain arrays.

export type NoticeKind = 'success' | 'error' | 'info'

export interface Notice {
  /** Same id as the toast it came from. Ids only grow, so "seen up to" is one number. */
  id: number
  kind: NoticeKind
  message: string
  /** The repository it concerns, when there is one — the row jumps there. */
  repoPath?: string
  /** Epoch ms. */
  at: number
  /** Remote work that finished (a push, pull, fetch) — what "Errors and
   *  finished remote work" notifications announce besides errors. */
  remote?: boolean
}

/** The most recent ones, kept across restarts. Not a log: the operation log in
 *  Repository settings is the full record of every git command. */
export const NOTICE_LIMIT = 200

/** Append, newest last, dropping the oldest past the limit. */
export function addNotice(list: readonly Notice[], notice: Notice): Notice[] {
  const next = [...list, notice]
  return next.length > NOTICE_LIMIT ? next.slice(next.length - NOTICE_LIMIT) : next
}

export interface NoticeBadge {
  /** Messages not yet seen in the panel. */
  unseen: number
  /** How many of them are errors. Red means "failed", so the red number
   *  counts failures only — never the successes alongside them. */
  errors: number
}

/** Unseen errors — the count on the Dock icon. */
export function unseenErrors(list: readonly Notice[], seenUpTo: number): number {
  return list.filter((n) => n.id > seenUpTo && n.kind === 'error').length
}

export function noticeBadge(list: readonly Notice[], seenUpTo: number): NoticeBadge {
  let unseen = 0
  let errors = 0
  for (const n of list) {
    if (n.id <= seenUpTo) continue
    unseen++
    if (n.kind === 'error') errors++
  }
  return { unseen, errors }
}

/**
 * A message is kept on disk, so a credential must never ride along: git can
 * echo a remote URL with a token in it. `https://user:token@host` keeps only
 * the host. Long output is cut — the operation log has the full text.
 */
export function sanitizeNoticeMessage(message: string): string {
  const clean = message.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1')
  return clean.length > 2000 ? `${clean.slice(0, 2000)}…` : clean
}

export interface StoredNotices {
  notices: Notice[]
  seenUpTo: number
}

/** Read what was saved last session; anything unreadable starts the list fresh. */
export function parseStoredNotices(raw: string | null): StoredNotices {
  const empty = { notices: [], seenUpTo: 0 }
  if (!raw) return empty
  try {
    const data = JSON.parse(raw) as { notices?: unknown; seenUpTo?: unknown }
    if (!Array.isArray(data.notices)) return empty
    const notices = data.notices
      .filter(
        (n): n is Notice =>
          !!n &&
          typeof n === 'object' &&
          typeof (n as Notice).id === 'number' &&
          typeof (n as Notice).message === 'string' &&
          typeof (n as Notice).at === 'number' &&
          ['success', 'error', 'info'].includes((n as Notice).kind)
      )
      .slice(-NOTICE_LIMIT)
    return { notices, seenUpTo: typeof data.seenUpTo === 'number' ? data.seenUpTo : 0 }
  } catch {
    return empty
  }
}

/** What the badge says: a count, capped so it stays one small pill. */
export function badgeText(count: number): string {
  return count > 99 ? '99+' : String(count)
}
