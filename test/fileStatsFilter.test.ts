import { describe, it, expect } from 'vitest'
import { effectiveFilter, filterByBuckets, toggleBucket, type BucketFilter } from '../src/renderer/src/lib/fileStats'

const none: BucketFilter = new Set()
const files = [
  { path: 'a', status: 'M' },
  { path: 'b', status: 'A' },
  { path: 'c', status: '?' },
  { path: 'd', status: 'D' }
]

describe('toggleBucket', () => {
  it('a plain click shows only that kind, and clicking it again clears', () => {
    const added = toggleBucket(none, 'add', false)
    expect([...added]).toEqual(['add'])
    expect(toggleBucket(added, 'add', false).size).toBe(0)
  })

  it('a plain click on another kind switches to it', () => {
    expect([...toggleBucket(new Set(['add']), 'del', false)]).toEqual(['del'])
  })

  it('⌘-click adds and removes one kind', () => {
    const two = toggleBucket(new Set(['add']), 'del', true)
    expect([...two].sort()).toEqual(['add', 'del'])
    expect([...toggleBucket(two, 'add', true)]).toEqual(['del'])
  })
})

describe('filterByBuckets / effectiveFilter', () => {
  it('shows everything with no filter, and untracked files count as added', () => {
    expect(filterByBuckets(files, none)).toBe(files)
    expect(filterByBuckets(files, new Set(['add'])).map((f) => f.path)).toEqual(['b', 'c'])
  })

  it('stands down for kinds the list does not contain', () => {
    expect(effectiveFilter(new Set(['ren']), files).size).toBe(0)
    expect([...effectiveFilter(new Set(['ren', 'del']), files)]).toEqual(['del'])
    const kept = new Set(['add'] as const)
    expect(effectiveFilter(kept, files)).toBe(kept)
  })
})
