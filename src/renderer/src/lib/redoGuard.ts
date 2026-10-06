// Redo replays a step onto the repository as the undo left it. Once HEAD has
// moved on — a commit from a terminal, an agent's reset, a checkout — new work
// has landed, and the step no longer applies: the same rule every editor
// follows when you type after undoing. Pure, so the toolbar and the store
// agree on one answer.

import { isHeadCommit } from './wipFileFollow'

/**
 * True while a Redo can still apply. `redoHead` is where HEAD stood when the
 * redo stack last changed (null when unknown — trust the stack). `commits` is
 * the loaded log; its decorated HEAD is where the repository is now.
 */
export function redoStillApplies(
  redoHead: string | null,
  commits: readonly { hash: string; refs: string[] }[]
): boolean {
  if (!redoHead) return true
  const head = commits.find((c) => isHeadCommit(c.refs))?.hash
  return !head || head === redoHead
}
