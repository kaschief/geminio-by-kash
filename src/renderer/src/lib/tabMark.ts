import type { TabStatus } from './tabClose'

/**
 * What a repository tab's status mark shows. A conflict outranks everything;
 * commits waiting to be pushed come next — they are finished work that exists
 * only on this machine — with a changes dot riding along when files changed
 * too; uncommitted changes alone get the plain dot.
 */
export type TabMark =
  | { kind: 'conflict' }
  | { kind: 'push'; count: number; changes: boolean }
  | { kind: 'changes' }
  | null

export function tabMark(status: TabStatus, unpushed: number): TabMark {
  if (status === 'conflict') return { kind: 'conflict' }
  if (unpushed > 0) return { kind: 'push', count: unpushed, changes: status === 'wip' }
  if (status === 'wip') return { kind: 'changes' }
  return null
}

/** A badge stays a badge: past two digits the exact number stops mattering. */
export function badgeCount(n: number): string {
  return n > 99 ? '99+' : String(n)
}
