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

/**
 * A file's name short enough to sit inside a sentence ("Staged config.js").
 * Long names lose their middle, not their end, so the extension — usually the
 * most telling part — survives.
 */
export function shortFileName(path: string, max = 32): string {
  const name = path.split('/').filter(Boolean).pop() ?? path
  if (name.length <= max) return name
  const dot = name.lastIndexOf('.')
  // A "dot" deep inside a long name is not an extension worth protecting.
  const ext = dot > 0 && name.length - dot <= 8 ? name.slice(dot) : ''
  const stem = name.slice(0, name.length - ext.length)
  const room = Math.max(2, max - ext.length - 1)
  const head = Math.ceil(room / 2)
  const tail = room - head
  return `${stem.slice(0, head)}…${tail > 0 ? stem.slice(-tail) : ''}${ext}`
}
