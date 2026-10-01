import type { RepoStatus } from '../../../shared/types'

/**
 * How many files have uncommitted changes. A file can sit in both the staged
 * and the unstaged list (part of it staged), and counting it twice would make
 * the number disagree with what the commit panel shows.
 */
export function workingChangeCount(status: RepoStatus | null | undefined): number {
  if (!status) return 0
  const paths = new Set<string>()
  for (const f of [...status.staged, ...status.unstaged, ...status.conflicted]) paths.add(f.path)
  return paths.size
}
