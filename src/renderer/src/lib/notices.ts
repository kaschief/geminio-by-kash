// The notification history behind the title-bar bell. Pure, so what earns a
// place in it — and what the badge says — is testable against plain arrays.
//
// The list is not a copy of every toast. A toast is feedback on what you just
// did; the list is for what you would act on and could have missed:
//
//   error   — something failed or is blocked: a push rejected, a pull stopped
//             on conflicts, sign-in refused. Red badge, Dock icon.
//   info    — your situation changed out of sight: new commits from others on
//             your branch, a branch's history rewritten on the remote. A dot.
//   success — work you started finished while you were away. A dot.
//
// A notice raised while you were looking at the result is recorded `quiet`:
// kept for the history, but it never counts as news.

export type NoticeKind = 'success' | 'error' | 'info'

export interface Notice {
  /** Ids only grow, so "seen up to" is one number. */
  id: number
  kind: NoticeKind
  message: string
  /** The repository it concerns, when there is one — the row jumps there. */
  repoPath?: string
  /** Epoch ms of the latest occurrence. */
  at: number
  /** What it is about, e.g. `push:/repo`: repeats collapse into one row, and a
   *  later success resolves a failure with the same key. */
  key?: string
  /** How many times in a row it happened (collapsed repeats). */
  count?: number
  /** A later success fixed it — kept in the list, no longer counted. */
  resolved?: boolean
  /** Raised while the person was looking: history only, never news. */
  quiet?: boolean
  /** Remote work (push, pull, fetch) — for the system-notification choice. */
  remote?: boolean
}

/** The most recent ones, kept across restarts. Not a log: the operation log in
 *  Repository settings is the full record of every git command. */
export const NOTICE_LIMIT = 200

/**
 * Append, newest last. A notice whose key matches the newest unresolved one of
 * the same kind replaces it instead of adding a row: errors count up ("× 5"),
 * news simply reads as the latest state. Past the limit the oldest drop off.
 */
export function addNotice(list: readonly Notice[], notice: Notice): Notice[] {
  let next = [...list]
  if (notice.key) {
    const at = findLastIndex(next, (n) => n.key === notice.key && n.kind === notice.kind && !n.resolved)
    if (at >= 0) {
      const prior = next[at]
      next.splice(at, 1)
      const { count: _c, quiet: _q, ...rest } = notice
      notice = {
        ...rest,
        ...(notice.kind === 'error' ? { count: (prior.count ?? 1) + 1 } : {}),
        // Quiet only if every occurrence happened in front of the person.
        ...(notice.quiet && prior.quiet ? { quiet: true } : {})
      }
    }
  }
  next.push(notice)
  if (next.length > NOTICE_LIMIT) next = next.slice(next.length - NOTICE_LIMIT)
  return next
}

/** A success with this key fixed any earlier failure with it. */
export function resolveNotices(list: readonly Notice[], key: string): Notice[] {
  return list.some((n) => n.key === key && n.kind === 'error' && !n.resolved)
    ? list.map((n) => (n.key === key && n.kind === 'error' && !n.resolved ? { ...n, resolved: true } : n))
    : (list as Notice[])
}

/** News for the person: not yet seen, not raised in front of them, not since fixed. */
export function isNews(n: Notice, seenUpTo: number): boolean {
  return n.id > seenUpTo && !n.quiet && !n.resolved
}

export interface NoticeBadge {
  /** Messages that are news. */
  unseen: number
  /** How many of them are errors. Red means "failed", so the red number
   *  counts failures only — never the successes alongside them. */
  errors: number
}

export function noticeBadge(list: readonly Notice[], seenUpTo: number): NoticeBadge {
  let unseen = 0
  let errors = 0
  for (const n of list) {
    if (!isNews(n, seenUpTo)) continue
    unseen++
    if (n.kind === 'error') errors++
  }
  return { unseen, errors }
}

/** Unseen errors — the count on the Dock icon. */
export function unseenErrors(list: readonly Notice[], seenUpTo: number): number {
  return list.filter((n) => isNews(n, seenUpTo) && n.kind === 'error').length
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

function findLastIndex<T>(list: readonly T[], test: (item: T) => boolean): number {
  for (let i = list.length - 1; i >= 0; i--) if (test(list[i])) return i
  return -1
}
