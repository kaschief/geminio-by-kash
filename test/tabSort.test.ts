import { describe, it, expect } from 'vitest'
import type { RepoRef, TabState } from '../src/shared/types'
import { activeTabSortKey, sortTabs, tabSortStats, tabsSettled, type SortRepoSnapshot } from '../src/renderer/src/lib/tabSort'

const repoTab = (name: string): TabState => ({
  id: name,
  name,
  kind: 'repo',
  repos: [{ path: `/r/${name}`, name }],
  activeRepoPath: `/r/${name}`
})

const snap = (o: { conflict?: boolean; changes?: number; unpushed?: number; behind?: number } = {}): SortRepoSnapshot => ({
  mergeState: null,
  status: {
    conflicted: o.conflict ? ['x'] : [],
    staged: [],
    unstaged: Array.from({ length: o.changes ?? 0 }, () => 'f'),
    behind: o.behind ?? 0
  },
  unpushed: Array.from({ length: o.unpushed ?? 0 }, () => 'c')
})

function order(tabs: TabState[], byPath: Record<string, SortRepoSnapshot>, key: Parameters<typeof sortTabs>[1], recent: RepoRef[] = []): string[] {
  return sortTabs(tabs, key, (tab) => tabSortStats(tab, byPath, recent)).map((t) => t.id)
}

describe('activeTabSortKey', () => {
  it('reads a stored key and treats anything else as manual', () => {
    expect(activeTabSortKey('attention')).toBe('attention')
    expect(activeTabSortKey(undefined)).toBeNull()
    expect(activeTabSortKey('bogus')).toBeNull()
  })

  it('carries over only a held sort from the pre-release shape', () => {
    expect(activeTabSortKey({ key: 'name', keepSorted: true })).toBe('name')
    expect(activeTabSortKey({ key: 'name', keepSorted: false })).toBeNull()
  })
})

describe('tabsSettled', () => {
  const tabs = ['a', 'b'].map(repoTab)
  it('waits for every repo, counting a failed load as settled', () => {
    expect(tabsSettled(tabs, { '/r/a': { loading: false } })).toBe(false)
    expect(tabsSettled(tabs, { '/r/a': { loading: false }, '/r/b': { loading: true } })).toBe(false)
    expect(tabsSettled(tabs, { '/r/a': { loading: false }, '/r/b': { loading: false } })).toBe(true)
  })
})

describe('sortTabs', () => {
  const tabs = ['clean', 'wip', 'few', 'many', 'broken', 'unloaded'].map(repoTab)
  const byPath = {
    '/r/clean': snap(),
    '/r/wip': snap({ changes: 2 }),
    '/r/few': snap({ unpushed: 2 }),
    '/r/many': snap({ unpushed: 39, behind: 1 }),
    '/r/broken': snap({ conflict: true })
  }

  it('needs attention: conflicts, unpushed by count, changes, clean, then not loaded', () => {
    expect(order(tabs, byPath, 'attention')).toEqual(['broken', 'many', 'few', 'wip', 'clean', 'unloaded'])
  })

  it('unpushed: most commits first, ties broken by attention then name', () => {
    expect(order(tabs, byPath, 'unpushed')).toEqual(['many', 'few', 'broken', 'wip', 'clean', 'unloaded'])
  })

  it('name: natural, case-insensitive', () => {
    const named = ['b10', 'B2', 'a'].map(repoTab)
    expect(order(named, {}, 'name')).toEqual(['a', 'B2', 'b10'])
  })

  it('recent: most recently opened first, unknown last by name', () => {
    const recent = [{ path: '/r/wip', name: 'wip' }, { path: '/r/clean', name: 'clean' }]
    expect(order(tabs, byPath, 'recent', recent).slice(0, 3)).toEqual(['wip', 'clean', 'broken'])
  })

  it('keeps page tabs after repository tabs, in their own order', () => {
    const page = (id: string): TabState => ({ id, name: id, kind: 'page', page: { type: 'changelog' } })
    const mixed = [page('p1'), repoTab('z'), page('p2'), repoTab('a')]
    expect(order(mixed, {}, 'name')).toEqual(['a', 'z', 'p1', 'p2'])
  })

  it('returns the same array when the order is unchanged', () => {
    const sorted = ['a', 'b'].map(repoTab)
    expect(sortTabs(sorted, 'name', (tab) => tabSortStats(tab, {}, []))).toBe(sorted)
  })

  it('a group sorts by the sum of its repos', () => {
    const group: TabState = {
      id: 'g',
      name: 'g',
      kind: 'group',
      repos: [{ path: '/r/few', name: 'few' }, { path: '/r/many', name: 'many' }],
      activeRepoPath: null
    }
    expect(tabSortStats(group, byPath, []).unpushed).toBe(41)
  })
})

describe('needs attention balances urgency against freshness', () => {
  const DAY = 24 * 60 * 60 * 1000
  const now = 1_800_000_000_000
  // A repository with work of a given age (days before `now`).
  const aged = (o: { conflict?: boolean; changes?: number; unpushed?: number; behind?: number }, days: number): SortRepoSnapshot => {
    const base = snap(o)
    const at = now - days * DAY
    const hashes = Array.from({ length: o.unpushed ?? 0 }, (_, i) => `u${i}${days}`)
    return {
      ...base,
      unpushed: hashes,
      commits: hashes.map((hash) => ({ hash, date: Math.floor(at / 1000) })),
      workTreeActivityAt: at,
      lastFetchAt: at
    }
  }
  const rank = (byPath: Record<string, SortRepoSnapshot>): string[] => {
    const tabs = Object.keys(byPath).map((p) => repoTab(p.replace('/r/', '')))
    return sortTabs(tabs, 'attention', (tab) => tabSortStats(tab, byPath, []), now).map((t) => t.id)
  }

  it('ranks today’s changes above unpushed commits left for two years', () => {
    // The reported case: geminio being worked on, an old repo with stale commits.
    expect(rank({ '/r/old': aged({ unpushed: 3 }, 730), '/r/geminio': aged({ changes: 2, unpushed: 1 }, 0) })).toEqual(['geminio', 'old'])
  })

  it('still puts fresh urgent work first: a conflict today beats changes today', () => {
    expect(rank({ '/r/edits': aged({ changes: 4 }, 0), '/r/merge': aged({ conflict: true }, 0) })).toEqual(['merge', 'edits'])
  })

  it('lets fresh lighter work overtake heavier work that has gone stale', () => {
    // Unpushed a week ago (50 × ¼) vs uncommitted changes today (35).
    expect(rank({ '/r/week': aged({ unpushed: 1 }, 7), '/r/today': aged({ changes: 1 }, 0) })).toEqual(['today', 'week'])
  })

  it('adds up what is waiting: unpushed and changes outrank either alone, same age', () => {
    expect(rank({ '/r/one': aged({ unpushed: 1 }, 1), '/r/both': aged({ unpushed: 1, changes: 1 }, 1) })).toEqual(['both', 'one'])
  })

  it('keeps even very old work above a clean repository', () => {
    expect(rank({ '/r/clean': aged({}, 0), '/r/ancient': aged({ unpushed: 1 }, 2000) })).toEqual(['ancient', 'clean'])
  })
})

describe('needs attention: two tabs equally pressing', () => {
  it('puts the one touched most recently first, not the one with more commits', () => {
    const now = 1_800_000_000_000
    const at = (mins: number): number => now - mins * 60_000
    const byPath: Record<string, SortRepoSnapshot> = {
      // Many unpushed commits, edited 5 minutes ago.
      '/r/budget': { ...snap({ changes: 2 }), unpushed: ['b1', 'b2', 'b3'], commits: [{ hash: 'b1', date: Math.floor(at(10) / 1000) }], workTreeActivityAt: at(5) },
      // Fewer, but edited a minute ago.
      '/r/geminio': { ...snap({ changes: 7 }), unpushed: ['g1'], commits: [{ hash: 'g1', date: Math.floor(at(10) / 1000) }], workTreeActivityAt: at(1) }
    }
    const tabs = [repoTab('budget'), repoTab('geminio')]
    expect(sortTabs(tabs, 'attention', (tab) => tabSortStats(tab, byPath, []), now).map((t) => t.id)).toEqual(['geminio', 'budget'])
  })
})
