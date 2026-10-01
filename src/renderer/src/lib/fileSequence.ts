import type { FileViewSource, FileViewState } from '../stores/ui'
import type { PullDirection } from './elasticFilePull'

export interface FileSequenceContext { repoPath: string; source: FileViewSource }
export interface AdjacentFile { file: string; open: () => void }
const sequences = new Map<symbol, { context: FileSequenceContext; adjacent: (file: string, direction: PullDirection) => AdjacentFile | null }>()

export function fileSequenceKey({ repoPath, source }: FileSequenceContext): string {
  return JSON.stringify([repoPath, source.type, source.type === 'commit' ? source.hash : source.type === 'stash' ? source.sha : source.type === 'wip' ? source.staged : null])
}

export function registerFileSequence(context: FileSequenceContext, adjacent: (file: string, direction: PullDirection) => AdjacentFile | null): () => void {
  const id = Symbol('file-sequence')
  sequences.set(id, { context, adjacent })
  return () => { sequences.delete(id) }
}

/** Only the mounted, matching list owns navigation: never cross repository,
 * commit, stash or staged/unstaged boundaries, or use a stale filtered list. */
export function adjacentFile(view: FileViewState, direction: PullDirection): AdjacentFile | null {
  const key = fileSequenceKey(view)
  for (const sequence of sequences.values()) {
    if (fileSequenceKey(sequence.context) === key) {
      const next = sequence.adjacent(view.file, direction)
      if (next) return next
    }
  }
  return null
}
