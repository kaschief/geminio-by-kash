/**
 * Which columns give way when the graph is narrower than its columns want.
 * Pure, so the order is pinned by tests.
 *
 * The commit message is what people read, so it keeps a comfortable width the
 * longest: the branch/tag column shrinks first, then the graph lanes, and only
 * then does the message go below its comfortable width (to its hard minimum,
 * enforced by layout). Stored widths are never changed — when room comes back
 * (a wider window, the details panel closed) the columns return to them.
 */

export interface ColumnFitInput {
  /** Width the rows have to fill. */
  available: number
  branch: number
  graph: number
  /** Every other fixed column, plus the row's end padding. */
  fixed: number
  /** Below this, the message starts to feel cramped; the others give way first. */
  messageComfort: number
  minBranch: number
  minGraph: number
}

export function fitBranchAndGraph(input: ColumnFitInput): { branch: number; graph: number } {
  const { available, fixed, messageComfort } = input
  let { branch, graph } = input
  let over = branch + graph + fixed + messageComfort - available
  if (over <= 0 || available <= 0) return { branch, graph }
  const branchGive = branch > 0 ? Math.min(over, Math.max(0, branch - input.minBranch)) : 0
  branch -= branchGive
  over -= branchGive
  const graphGive = graph > 0 ? Math.min(over, Math.max(0, graph - input.minGraph)) : 0
  graph -= graphGive
  return { branch, graph }
}
