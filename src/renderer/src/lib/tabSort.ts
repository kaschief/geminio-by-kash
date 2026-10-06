// Ordering the tab strip by what each tab's repositories need from you. Pure:
// the caller hands in a snapshot of repo state, so the ordering is testable
// against plain objects and never reaches into a store.

import type { RepoRef, TabSortKey, TabState } from '../../../shared/types'
import type { TranslationKey } from '../i18n'

/** Menu order, with the key — not the string — so labels follow a language switch. */
export const TAB_SORT_OPTIONS: readonly { key: TabSortKey; labelKey: TranslationKey }[] = [
  { key: 'attention', labelKey: 'tabSort.attention' },
  { key: 'unpushed', labelKey: 'tabSort.unpushed' },
  { key: 'changes', labelKey: 'tabSort.changes' },
  { key: 'behind', labelKey: 'tabSort.behind' },
  { key: 'name', labelKey: 'tabSort.name' },
  { key: 'recent', labelKey: 'tabSort.recent' }
]

const SORT_KEYS = new Set<string>(TAB_SORT_OPTIONS.map((o) => o.key))

/** The order the strip is held in, or null for manual. Settings are read from
 *  disk, so the stored value is narrowed rather than trusted. */
export function activeTabSortKey(stored: unknown): TabSortKey | null {
  if (typeof stored === 'string') return SORT_KEYS.has(stored) ? (stored as TabSortKey) : null
  // A pre-release build stored `{ key, keepSorted }`; only a held sort carries over.
  if (stored && typeof stored === 'object' && 'keepSorted' in stored && stored.keepSorted === true) {
    return 'key' in stored ? activeTabSortKey(stored.key) : null
  }
  return null
}

/** The slice of a loaded repo the ordering reads. */
export type SortRepoSnapshot = {
  mergeState: unknown
  status: { conflicted: unknown[]; staged: unknown[]; unstaged: unknown[]; behind: number } | null
  unpushed?: string[] | null
  /** For the dates of unpushed commits — when you last committed here. */
  commits?: { hash: string; date: number }[]
  /** Newest edit among the changed files (epoch ms). */
  workTreeActivityAt?: number | null
  /** When "behind" was learned (epoch ms). */
  lastFetchAt?: number | null
}

export type TabSortStats = {
  /** False until at least one of the tab's repos has loaded its status. */
  known: boolean
  conflict: boolean
  changes: boolean
  unpushed: number
  behind: number
  /** Position in the recent list; lower is more recent, Infinity when absent. */
  recency: number
  /** When something that needs you last happened here (epoch ms), or null. */
  lastActivity: number | null
  name: string
}

/** Aggregate a tab's repos — a group sorts by the sum of its members. */
export function tabSortStats(
  tab: TabState,
  byPath: Record<string, SortRepoSnapshot | undefined>,
  recentRepos: RepoRef[]
): TabSortStats {
  const stats: TabSortStats = {
    known: false,
    conflict: false,
    changes: false,
    unpushed: 0,
    behind: 0,
    recency: Infinity,
    lastActivity: null,
    name: tab.name
  }
  const touch = (at: number | null | undefined): void => {
    if (at && (stats.lastActivity === null || at > stats.lastActivity)) stats.lastActivity = at
  }
  if (tab.kind === 'page') return stats
  for (const ref of tab.repos) {
    const recentAt = recentRepos.findIndex((r) => r.path === ref.path)
    if (recentAt >= 0) stats.recency = Math.min(stats.recency, recentAt)
    const data = byPath[ref.path]
    if (!data?.status) continue
    stats.known = true
    if (data.mergeState || data.status.conflicted.length > 0) stats.conflict = true
    if (data.status.staged.length + data.status.unstaged.length > 0) stats.changes = true
    stats.unpushed += data.unpushed?.length ?? 0
    stats.behind += data.status.behind
    // The newest of: your last unpushed commit, your last edit, the fetch that
    // made you behind — each only counts while it still needs you.
    if (data.unpushed?.length && data.commits) {
      const unpushed = new Set(data.unpushed)
      for (const c of data.commits) if (unpushed.has(c.hash)) touch(c.date * 1000)
    }
    if (data.status.staged.length + data.status.unstaged.length + data.status.conflicted.length > 0) touch(data.workTreeActivityAt)
    if (data.status.behind > 0) touch(data.lastFetchAt)
  }
  return stats
}

/**
 * True once every repository in the strip has finished its first load —
 * including ones that failed (missing folder, not a repo), which are settled
 * too. Sorting before this would rank still-loading tabs as "unknown" and then
 * move them again a second later: one reorder, made with the full picture,
 * reads as deliberate; two read as a glitch.
 */
export function tabsSettled(tabs: TabState[], byPath: Record<string, { loading: boolean } | undefined>): boolean {
  return tabs.every((tab) => tab.kind === 'page' || tab.repos.every((ref) => byPath[ref.path]?.loading === false))
}

/**
 * How much a tab needs you right now: what is waiting there, weighted by how
 * fresh it is. Urgency alone let a commit left unpushed two years ago outrank
 * the repository you are working in today; freshness halves every three days,
 * so abandoned work sinks while today's rises. The weights add up — unpushed
 * commits on top of uncommitted changes is more than either.
 */
export const ATTENTION_WEIGHTS = { conflict: 100, unpushed: 50, changes: 35, behind: 15 } as const
const HALF_LIFE_MS = 3 * 24 * 60 * 60 * 1000
/** Even very old work keeps a sliver, so it still sorts above a clean tab. */
const MIN_FRESHNESS = 0.02

export function attentionScore(s: TabSortStats, now: number): number {
  if (!s.known) return -1
  const urgency =
    (s.conflict ? ATTENTION_WEIGHTS.conflict : 0) +
    (s.unpushed > 0 ? ATTENTION_WEIGHTS.unpushed : 0) +
    (s.changes ? ATTENTION_WEIGHTS.changes : 0) +
    (s.behind > 0 ? ATTENTION_WEIGHTS.behind : 0)
  if (urgency === 0) return 0
  // No time known (not read yet): treat as a day old rather than brand new.
  const age = Math.max(0, now - (s.lastActivity ?? now - 24 * 60 * 60 * 1000))
  return urgency * Math.max(MIN_FRESHNESS, 0.5 ** (age / HALF_LIFE_MS))
}

/** Conflicts, then unpushed work, then uncommitted work, then clean, then not yet loaded. */
function attentionRank(s: TabSortStats): number {
  if (!s.known) return 4
  if (s.conflict) return 0
  if (s.unpushed > 0) return 1
  if (s.changes) return 2
  return 3
}

const byName = (a: TabSortStats, b: TabSortStats): number =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })

// Each key is its own criterion followed by the attention order and the name,
// so ties always break the same way and repeated sorts are stable.
function sortVector(key: TabSortKey, s: TabSortStats, now: number): number[] {
  const unknown = s.known ? 0 : 1
  const attention = [attentionRank(s), -s.unpushed, s.changes ? 0 : 1, -s.behind]
  switch (key) {
    case 'attention':
      // Balanced score first. Two equally pressing tabs — both active today —
      // go by which was touched last, then the fixed order, then recent use.
      // Scores are rounded so a few minutes' difference in age does not count
      // as "more pressing"; the activity time decides that instead.
      return [unknown, -Math.round(attentionScore(s, now)), -(s.lastActivity ?? 0), ...attention, s.recency]
    case 'unpushed':
      return [unknown, -s.unpushed, ...attention]
    case 'changes':
      return [unknown, s.changes ? 0 : 1, ...attention]
    case 'behind':
      return [unknown, -s.behind, ...attention]
    case 'recent':
      return [s.recency]
    case 'name':
      return []
  }
}

/**
 * The strip in sorted order. Page tabs (settings, changelog, …) keep their
 * relative order after every repository tab. Returns the input array itself
 * when nothing moves, so a caller can skip a no-op write by identity.
 */
export function sortTabs(
  tabs: TabState[],
  key: TabSortKey,
  statsOf: (tab: TabState) => TabSortStats,
  now: number = Date.now()
): TabState[] {
  const keyed = tabs
    .filter((tab) => tab.kind !== 'page')
    .map((tab) => {
      const stats = statsOf(tab)
      return { tab, stats, vector: sortVector(key, stats, now) }
    })
  keyed.sort((a, b) => {
    for (let i = 0; i < a.vector.length; i++) {
      const d = a.vector[i] - b.vector[i]
      // Infinity - Infinity (two tabs never opened) is NaN: treat as a tie.
      if (d !== 0 && !Number.isNaN(d)) return d
    }
    return byName(a.stats, b.stats)
  })
  const sorted = [...keyed.map((k) => k.tab), ...tabs.filter((tab) => tab.kind === 'page')]
  return sorted.every((tab, i) => tab === tabs[i]) ? tabs : sorted
}
