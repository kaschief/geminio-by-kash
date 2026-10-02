import type { RefMove } from './types'

/** `<old> <new> <name> <<email>> <unix-seconds> <tz>\t<message>` — one line of a reflog file. */
const LINE = /^([0-9a-f]{40,64}) ([0-9a-f]{40,64}) (.*?) (\d+) [+-]\d{4}(?:\t(.*))?$/

/**
 * Parse a reflog file's text, newest first. Files are oldest-first and may have
 * been read from a byte offset, so a leading partial line is dropped by the
 * regex rather than trusted. `byApp` is left for the caller to decide.
 */
export function parseReflog(text: string, max: number): Omit<RefMove, 'byApp'>[] {
  const out: Omit<RefMove, 'byApp'>[] = []
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0 && out.length < max; i--) {
    const m = LINE.exec(lines[i])
    if (!m) continue
    out.push({ old: m[1], new: m[2], actor: m[3].trim(), date: Number(m[4]), message: m[5] ?? '' })
  }
  return out
}

/** Every reflog line names a ref's old value; a fresh ref's old value is all zeros. */
export function isNullSha(sha: string): boolean {
  return /^0+$/.test(sha)
}
