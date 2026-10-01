/**
 * How a repository path is shown in headers and lists. Pure, so the trimming
 * rules are pinned by tests.
 */

/** How many enclosing folders to show: every one, or only the last N. */
export type PathDepth = 'all' | 0 | 1 | 2 | 3

export const PATH_DEPTHS: readonly PathDepth[] = ['all', 3, 2, 1, 0]

export interface DisplayPath {
  /** The folders shown, with a trailing `/` — and a leading `…/` when some were left out. */
  dir: string
  /** The file name, always shown in full. */
  name: string
  /** Whether folders were left out, so the caller can offer the full path on hover. */
  trimmed: boolean
}

export function displayPath(path: string, depth: PathDepth): DisplayPath {
  const parts = path.split('/').filter(Boolean)
  const name = parts.pop() ?? path
  if (depth === 'all' || parts.length <= depth) {
    return { dir: parts.length ? `${parts.join('/')}/` : '', name, trimmed: false }
  }
  const kept = depth === 0 ? [] : parts.slice(-depth)
  return { dir: `…/${kept.length ? `${kept.join('/')}/` : ''}`, name, trimmed: true }
}
