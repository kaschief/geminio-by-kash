// What closing a tab leaves behind, and what to say about it, is the same answer
// for the X button, middle-click, the context menu and Cmd/Ctrl+W. It lives here
// so there is one answer, and so it can be tested without a DOM.
//
// Following the LintHint convention, this returns dictionary keys rather than
// rendered copy: the caller translates, which keeps the logic locale-agnostic.

import type { RepoRef } from '../../../shared/types'
import type { TranslationKey } from '../i18n'

export type TabStatus = 'conflict' | 'wip' | null

/** The slice of a loaded repo that decides whether closing it loses anything. */
export type CloseRepoSnapshot = {
  mergeState: unknown
  status: { conflicted: unknown[]; staged: unknown[]; unstaged: unknown[] } | null
}

/** What you would lose by closing this repo. A conflict outranks uncommitted work. */
export function repoCloseStatus(data: CloseRepoSnapshot | undefined): TabStatus {
  if (!data) return null
  if (data.mergeState || (data.status?.conflicted.length ?? 0) > 0) return 'conflict'
  if ((data.status?.staged.length ?? 0) + (data.status?.unstaged.length ?? 0) > 0) return 'wip'
  return null
}

/** The worst status across every repo a tab carries. */
export function tabCloseStatus(
  repos: RepoRef[],
  byPath: Record<string, CloseRepoSnapshot | undefined>
): TabStatus {
  let wip = false
  for (const ref of repos) {
    const status = repoCloseStatus(byPath[ref.path])
    if (status === 'conflict') return 'conflict'
    if (status === 'wip') wip = true
  }
  return wip ? 'wip' : null
}

/**
 * What to say after a tab closes or a repo leaves a group, or null when nothing
 * needs saying. Closing never touches the working tree, so there is no question
 * to ask; the note only reassures that work in progress is still where it was.
 */
export function closeNotice(
  status: TabStatus,
  name: string,
  action: 'close' | 'remove'
): { key: TranslationKey; vars: { name: string } } | null {
  if (!status) return null
  const key: TranslationKey =
    action === 'remove'
      ? status === 'conflict'
        ? 'titlebar.removedWithMerge'
        : 'titlebar.removedWithChanges'
      : status === 'conflict'
        ? 'titlebar.closedWithMerge'
        : 'titlebar.closedWithChanges'
  return { key, vars: { name } }
}
