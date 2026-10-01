import { describe, it, expect } from 'vitest'
import { ElasticFilePull, pullConfig } from '../src/renderer/src/lib/elasticFilePull'
import { registerFileSequence, adjacentFile } from '../src/renderer/src/lib/fileSequence'
import type { FileViewState } from '../src/renderer/src/stores/ui'

describe('elastic file pull', () => {
  it('defaults to balanced and keeps faster pulls deliberate', () => {
    for (const feel of ['fast', 'quick', 'balanced', 'deliberate'] as const) {
      const pull = new ElasticFilePull(pullConfig(feel))
      for (let i = 0; i < 10; i++) pull.wheel(40, i * 25, 1)
      expect(pull.release(600)).toBe(feel === 'deliberate' ? null : 1)
      pull.wheel(3000, 1000, 1)
      expect(pull.release(1600)).toBeNull()
    }
    const fast = new ElasticFilePull(pullConfig('fast'))
    const quick = new ElasticFilePull(pullConfig('quick'))
    for (let i = 0; i < 6; i++) {
      fast.wheel(35, i * 25, 1)
      quick.wheel(35, i * 25, 1)
    }
    expect(fast.release(300)).toBe(1)
    expect(quick.release(300)).toBeNull()
    const pull = new ElasticFilePull()
    for (let i = 0; i < 10; i++) pull.wheel(40, i * 25, 1)
    expect(pull.release(600)).toBe(1)
    expect(pullConfig(undefined)).toBe(pullConfig('balanced'))
    expect(pullConfig('invalid')).toBe(pullConfig('balanced'))
  })
  it('never turns scrolling momentum at an edge into file navigation', () => {
    const pull = new ElasticFilePull(pullConfig('deliberate'))
    pull.wheel(100, 0, null)
    for (let i = 1; i < 40; i++) expect(pull.wheel(70, i * 16, 1)).toBe(false)
    expect(pull.release(1300)).toBeNull()
  })
  it('requires a deliberate pull, then switches only on release', () => {
    const pull = new ElasticFilePull(pullConfig('deliberate'))
    pull.wheel(20, 0, null)
    for (let i = 0; i < 16; i++) pull.wheel(40, 250 + i * 25, 1)
    expect(pull.ready).toBe(true)
    expect(pull.stretch).toBeLessThan(190)
    expect(pull.release(1000)).toBe(1)
    expect(pull.release(1300)).toBeNull()
  })
  it('springs back below the threshold, even after one very large wheel event', () => {
    const pull = new ElasticFilePull(pullConfig('deliberate'))
    pull.wheel(3000, 0, 1)
    expect(pull.ready).toBe(false)
    expect(pull.release(250)).toBeNull()
  })
  it('supports pulling backward and retracting an armed gesture', () => {
    const pull = new ElasticFilePull(pullConfig('deliberate'))
    for (let i = 0; i < 16; i++) pull.wheel(-40, i * 25, -1)
    expect(pull.ready).toBe(true)
    for (let i = 0; i < 4; i++) pull.wheel(40, 420 + i * 25, -1)
    expect(pull.ready).toBe(false)
    expect(pull.release(1000)).toBeNull()
    for (let i = 0; i < 16; i++) pull.wheel(-40, 1500 + i * 25, -1)
    expect(pull.release(2200)).toBe(-1)
  })
  it('keeps a burst that is too brief from arming navigation', () => {
    const pull = new ElasticFilePull(pullConfig('deliberate'))
    for (let i = 0; i < 16; i++) pull.wheel(40, i, 1)
    expect(pull.release(50)).toBeNull()
  })
})

describe('file sequence ownership', () => {
  const view: FileViewState = { repoPath: '/repo', file: 'a.ts', source: { type: 'wip', staged: false, untracked: true }, mode: 'diff' }
  it('follows the current list while excluding other repositories and staging areas', () => {
    const unregister = registerFileSequence({ ...view, source: { type: 'wip', staged: false, untracked: false } }, () => ({ file: 'b.ts', open: () => {} }))
    try {
      expect(adjacentFile(view, 1)?.file).toBe('b.ts')
      expect(adjacentFile({ ...view, repoPath: '/elsewhere' }, 1)).toBeNull()
      expect(adjacentFile({ ...view, source: { type: 'wip', staged: true, untracked: false } }, 1)).toBeNull()
      expect(adjacentFile({ ...view, source: { type: 'commit', hash: 'abc' } }, 1)).toBeNull()
    } finally { unregister() }
    expect(adjacentFile(view, 1)).toBeNull()
  })
  it('does not reuse a sequence from a different commit', () => {
    const unregister = registerFileSequence({ repoPath: '/repo', source: { type: 'commit', hash: 'abc' } }, () => ({ file: 'b.ts', open: () => {} }))
    try {
      expect(adjacentFile({ ...view, source: { type: 'commit', hash: 'xyz' } }, 1)).toBeNull()
    } finally { unregister() }
  })
})
