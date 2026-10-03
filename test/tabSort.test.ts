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
