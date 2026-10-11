// Which branches you are not standing on could be caught up from the Pull
// button. Pure, so the rule is testable without a repository.

import type { BranchInfo } from '../../../shared/types'

/** Past this many, the branches fold into one "Pull a Branch" flyout so the menu stays short. */
export const INLINE_PULL_LIMIT = 5

/**
 * Local branches, other than the checked-out one, that are behind their
 * upstream and can be fast-forwarded without a checkout. A branch with commits
 * of its own has diverged: a branch-level pull would refuse it, so it is left
 * out rather than offered and then rejected. Most behind first.
 */
export function pullableOthers(locals: BranchInfo[]): BranchInfo[] {
  return locals
    .filter((b) => !b.isCurrent && b.upstream && b.behind > 0 && b.ahead === 0)
    .sort((a, b) => b.behind - a.behind || a.name.localeCompare(b.name))
}
