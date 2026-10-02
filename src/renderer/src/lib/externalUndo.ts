import type { RecentRefMoves, RefMove } from '../../../shared/types'
import { isNullSha } from '../../../shared/refMoves'
import type { TranslationKey } from '../i18n'

/**
 * Undo for changes Geminio did not make — a commit from the terminal, a
 * reset from an IDE, a checkout by an agent. Git records all of them in the
 * reflog with the ref's old position, so the latest one can be walked back.
 *
 * Everything here is a decision over reflog data; the store executes it.
 */

export type ExternalUndoKind = 'commit' | 'amend' | 'reset' | 'move' | 'checkout'

/**
 * How to move a ref. `restore` is a reset whose mode depends on the working
 * tree at run time: `--keep` when clean (files follow the ref), `--mixed` when
 * dirty (files are never touched). Neither can lose work.
 */
export type RefAction =
  | { type: 'reset'; mode: 'soft' | 'keep' | 'restore'; target: string }
  | { type: 'checkout'; target: string }

export type ExternalUndoPlan = {
  /** Identity of the reflog move being undone — shared by the HEAD and branch logs. */
  id: string
  kind: ExternalUndoKind
  move: RefMove
  /** Branch that moves, or null for a checkout / detached HEAD. */
  branch: string | null
  /** What HEAD must still point at, or the plan is stale and must not run. */
  expectedHead: string
  undo: RefAction
  redo: RefAction
  /** For a checkout: where HEAD goes back to, and where it came from. */
  from?: string
  to?: string
}

export function refMoveId(m: Pick<RefMove, 'old' | 'new' | 'date'>): string {
  return `${m.old}:${m.new}:${m.date}`
}

const CHECKOUT = /^checkout: moving from (.+) to (.+)$/

function classify(message: string): Exclude<ExternalUndoKind, 'checkout'> {
  if (/^commit \(amend\):/.test(message)) return 'amend'
  if (/^commit( \(merge\))?:/.test(message)) return 'commit'
  if (/^reset:/.test(message)) return 'reset'
  return 'move' // merge, pull, rebase, cherry-pick, revert, am …
}

/** The reset that walks each kind back, and the one that replays it. */
function branchActions(kind: Exclude<ExternalUndoKind, 'checkout'>, m: RefMove): Pick<ExternalUndoPlan, 'undo' | 'redo'> {
  switch (kind) {
    // The classic uncommit: the commit goes, its changes stay staged.
    case 'commit':
    case 'amend':
      return { undo: { type: 'reset', mode: 'soft', target: m.old }, redo: { type: 'reset', mode: 'soft', target: m.new } }
    // The original reset's mode is not recorded, so pick the one that cannot lose work.
    case 'reset':
      return { undo: { type: 'reset', mode: 'restore', target: m.old }, redo: { type: 'reset', mode: 'restore', target: m.new } }
    case 'move':
      return { undo: { type: 'reset', mode: 'keep', target: m.old }, redo: { type: 'reset', mode: 'keep', target: m.new } }
  }
}

/**
 * The latest reflog move that can be undone, or null.
 *
 * `skip` holds moves already dealt with: ones this feature undid, and the
 * resets it wrote to do so. Skipping both lets undo walk several foreign
 * changes back in a row. Anything else Geminio wrote stops the walk — those
 * belong to the app's own undo stack, and reaching past one would undo an
 * older change out of order.
 */
export function planExternalUndo(moves: RecentRefMoves | null, skip: ReadonlySet<string>): ExternalUndoPlan | null {
  if (!moves) return null
  const currentHead = moves.head[0]?.new
  const top = moves.head.find((m) => !skip.has(refMoveId(m)))
  if (!currentHead || !top || top.byApp) return null
  // Something newer than `top` (a skipped move) left HEAD elsewhere: a replay
  // of `top` would not match what is on disk, so offer nothing.
  if (top.new !== currentHead) return null

  const checkout = CHECKOUT.exec(top.message)
  if (checkout) {
    const [, from, to] = checkout
    if (from === to) return null
    return {
      id: refMoveId(top),
      kind: 'checkout',
      move: top,
      branch: null,
      expectedHead: currentHead,
      undo: { type: 'checkout', target: from },
      redo: { type: 'checkout', target: to },
      from,
      to
    }
  }

  // On a branch its own log is the better record: a rebase is one line there
  // and dozens in HEAD's.
  const m = moves.branch ? moves.branchLog.find((b) => !skip.has(refMoveId(b))) : top
  if (!m || m.byApp || m.new !== currentHead) return null
  // A branch's first line has no old position to go back to.
  if (isNullSha(m.old) || m.old === m.new) return null
  const kind = classify(m.message)
  return { id: refMoveId(m), kind, move: m, branch: moves.branch, expectedHead: currentHead, ...branchActions(kind, m) }
}

/**
 * Which undo goes first. The reflog only sees ref moves, so an app action that
 * left HEAD alone (staging, deleting a branch) can be newer than a foreign
 * commit; timestamps settle it.
 */
export function externalUndoFirst(plan: ExternalUndoPlan | null, appTopAt: number | undefined): boolean {
  if (!plan) return false
  return appTopAt === undefined || appTopAt <= plan.move.date * 1000
}

/** Subject without git's `commit: ` / `reset: ` prefix. */
function subjectOf(message: string): string {
  const i = message.indexOf(': ')
  return i >= 0 ? message.slice(i + 2) : message
}

/** A short label for the change being undone, as a key the caller renders. */
export function externalUndoLabel(plan: ExternalUndoPlan): { key: TranslationKey; vars: Record<string, string> } {
  switch (plan.kind) {
    case 'commit':
      return { key: 'extUndo.label.commit', vars: { subject: subjectOf(plan.move.message) } }
    case 'amend':
      return { key: 'extUndo.label.amend', vars: { subject: subjectOf(plan.move.message) } }
    case 'reset':
      return { key: 'extUndo.label.reset', vars: { branch: plan.branch ?? 'HEAD' } }
    case 'checkout':
      return { key: 'extUndo.label.checkout', vars: { from: shortRef(plan.from ?? ''), to: shortRef(plan.to ?? '') } }
    case 'move':
      return { key: 'extUndo.label.move', vars: { what: plan.move.message } }
  }
}

/** What the undo will do to the branch and the working files, as a key. */
export function externalUndoEffect(plan: ExternalUndoPlan): { key: TranslationKey; vars: Record<string, string> } {
  const vars = { branch: plan.branch ?? 'HEAD', target: plan.move.old.slice(0, 7), from: shortRef(plan.from ?? '') }
  switch (plan.kind) {
    case 'commit':
      return { key: 'extUndo.effect.commit', vars }
    case 'amend':
      return { key: 'extUndo.effect.amend', vars }
    case 'reset':
      return { key: 'extUndo.effect.reset', vars }
    case 'move':
      return { key: 'extUndo.effect.move', vars }
    case 'checkout':
      return { key: 'extUndo.effect.checkout', vars }
  }
}

/** A detached checkout names a full sha; abbreviate it like the rest of the UI. */
function shortRef(ref: string): string {
  return /^[0-9a-f]{40,64}$/.test(ref) ? ref.slice(0, 7) : ref
}
