/**
 * When Geminio itself last wrote to each repository, as wall-clock windows.
 *
 * The reflog records *what* moved a ref but not *which program* did it, so the
 * renderer cannot tell its own commits from a terminal's. Every write funnels
 * through the git dispatcher under an exclusive lock, so the dispatcher can
 * stamp a window per write; a reflog line whose timestamp falls inside one was
 * ours. Memory only: after a restart everything looks foreign, which is the
 * honest answer — the undo stack that knew better is gone too.
 */

type Window = { start: number; end: number }

const MAX_WINDOWS = 200
const windows = new Map<string, Window[]>()

export function noteAppWrite(repoPath: string, startMs: number, endMs: number): void {
  const list = windows.get(repoPath) ?? []
  // Reflog timestamps are whole seconds: widen to the seconds the write touched.
  list.push({ start: Math.floor(startMs / 1000), end: Math.ceil(endMs / 1000) })
  if (list.length > MAX_WINDOWS) list.splice(0, list.length - MAX_WINDOWS)
  windows.set(repoPath, list)
}

/** True when a reflog timestamp (unix seconds) lands inside one of our writes. */
export function wasAppWrite(repoPath: string, dateSec: number): boolean {
  const list = windows.get(repoPath)
  if (!list) return false
  for (let i = list.length - 1; i >= 0; i--) {
    const w = list[i]
    if (dateSec >= w.start && dateSec <= w.end) return true
    if (w.end < dateSec) return false // windows are chronological; nothing older can match
  }
  return false
}
