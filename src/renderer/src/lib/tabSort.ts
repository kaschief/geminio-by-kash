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
  unpushed?: unknown[] | null
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
    name: tab.name
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
function sortVector(key: TabSortKey, s: TabSortStats): number[] {
  const unknown = s.known ? 0 : 1
  const attention = [attentionRank(s), -s.unpushed, s.changes ? 0 : 1, -s.behind]
  switch (key) {
    case 'attention':
      return attention
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
  statsOf: (tab: TabState) => TabSortStats
): TabState[] {
  const keyed = tabs
    .filter((tab) => tab.kind !== 'page')
    .map((tab) => {
      const stats = statsOf(tab)
      return { tab, stats, vector: sortVector(key, stats) }
    })
  keyed.sort((a, b) => {
    for (let i = 0; i < a.vector.length; i++) {
      const d = a.vector[i] - b.vector[i]
      if (d !== 0 && !Number.isNaN(d)) return d
    }
    return byName(a.stats, b.stats)
  })
  const sorted = [...keyed.map((k) => k.tab), ...tabs.filter((tab) => tab.kind === 'page')]
  return sorted.every((tab, i) => tab === tabs[i]) ? tabs : sorted
}
