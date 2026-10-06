import { useEffect, useRef } from 'react'
import { gitApi } from '../infrastructure/api'
import { useRepoStore } from '../stores/repo'
import { useUIStore, fileViewKey, type FileViewState } from '../stores/ui'
import { followCommitFile, followWipFile, headMove, headOf, nextWipFile, type HeadSnapshot } from '../lib/wipFileFollow'

/**
 * Keeps an open file pointed at where the file actually is, whatever moved it
 * — this app, a terminal, or an agent — so the chip in the viewer's header
 * always tells the truth: Unstaged, Staged, or the commit that holds it.
 *
 * A working change staged or unstaged elsewhere flips side; committed, it
 * follows into the commit; discarded, the view closes, there being nothing to
 * show. At a commit that is undone, it returns to the side the change landed
 * on — or closes, if the undo threw the changes away; at a HEAD that is
 * amended or reworded, it moves on to the new HEAD.
 *
 * Details travels with the file when it was showing the same thing, so the two
 * panes never disagree. A panel the user closed stays closed.
 *
 * Paused while the editor is open: re-pointing the view remounts it, and a
 * remount would throw away an unsaved draft.
 */
export function useFollowWipFile(view: FileViewState, editing: boolean): void {
  const { repoPath, file, source } = view
  const status = useRepoStore((s) => s.repos[repoPath]?.status ?? null)
  const commits = useRepoStore((s) => s.repos[repoPath]?.commits)
  const branches = useRepoStore((s) => s.repos[repoPath]?.branches)
  // Where HEAD was the last time this view looked. A commit view follows only
  // the commit HEAD was on, and only when HEAD moves off it — undone, or
  // amended. Judged by HEAD, not by the log: a stash keeps the commit it was
  // taken on in the log after that commit has been undone.
  const lastSeen = useRef<HeadSnapshot>({ commits: commits ?? [], branches })
  const headCommit = commits ? headOf({ commits, branches })?.hash : undefined
  // HEAD as of the last time the file was still a working change. When the file
  // leaves, HEAD having moved since means it was committed (follow it into the
  // commit); HEAD where it was means it was discarded (close). Without this a
  // discarded file whose last commit had touched it followed into that commit —
  // an old change, shown as if it were where the work went.
  const headWhileWip = useRef<string | undefined>(headCommit)
  // The status from when the file was last listed: where it stood, so a discard
  // can move on to its neighbour.
  const statusWhileWip = useRef(status)

  // Was Details showing the working changes? By the time the commit is seen the
  // store has already cleared that selection (an empty WIP has nothing to
  // show), so the answer is kept from the transition itself. Closing the panel
  // parks the selection; the automatic clear does not.
  const detailsOnWip = useRef(useRepoStore.getState().repos[repoPath]?.selected?.type === 'wip')
  useEffect(
    () =>
      useRepoStore.subscribe((next, prev) => {
        const now = next.repos[repoPath]
        const before = prev.repos[repoPath]
        if (!now || now.selected === before?.selected) return
        if (now.selected) detailsOnWip.current = now.selected.type === 'wip'
        else if (now.parkedSelection !== before?.parkedSelection) detailsOnWip.current = false
      }),
    [repoPath]
  )

  useEffect(() => {
    if (!commits) return
    const now: HeadSnapshot = { commits, branches }
    const move = headMove(lastSeen.current, now)
    lastSeen.current = now
    if (editing || !status) return
    const ui = useUIStore.getState()
    const repoState = useRepoStore.getState
    // Only act on the view a decision was made for — the user may have opened
    // another file while git was answering.
    const stillOpen = (): boolean => {
      const current = useUIStore.getState().fileView
      return !!current && fileViewKey(current) === fileViewKey(view)
    }
    const headIfItHas = async (): Promise<string | null> => {
      const head = await gitApi.resolveRev(repoPath, 'HEAD').catch(() => null)
      const files = head ? await gitApi.commitFiles(repoPath, head).catch(() => []) : []
      return head && files.some((f) => f.path === file) ? head : null
    }
    let cancelled = false
    const cancel = (): void => {
      cancelled = true
    }

    if (source.type === 'commit') {
      // Details is moved by the store (followSelectedCommit), in the same update.
      const left = move.kind !== 'none' && move.from.hash === source.hash && (move.kind === 'undone' || move.kind === 'amended')
      const next = followCommitFile(file, left, true, status, move.kind === 'undone')
      if (next.kind === 'keep') return
      if (next.kind === 'close') {
        ui.setFileView(null, repoPath)
        return
      }
      if (next.kind === 'move') {
        ui.setFileView({ ...view, source: next.source })
        return
      }
      void (async () => {
        const head = await headIfItHas()
        if (cancelled || !stillOpen()) return
        // Rewritten without this file: it is no longer part of the commit.
        if (!head) {
          ui.setFileView(null, repoPath)
          return
        }
        ui.setFileView({ ...view, source: { type: 'commit', hash: head } })
      })()
      return cancel
    }

    if (source.type !== 'wip') return
    const next = followWipFile(source, file, status)
    if (next.kind !== 'left') {
      headWhileWip.current = headCommit
      statusWhileWip.current = status
    }
    if (next.kind === 'keep') return
    if (next.kind === 'move') {
      ui.setFileView({ ...view, source: next.source })
      return
    }
    const headBefore = headWhileWip.current
    const listedBefore = statusWhileWip.current
    void (async () => {
      const head = await headIfItHas()
      if (cancelled || !stillOpen()) return
      if (!head || head === headBefore) {
        // Discarded. Other changes left: move on to the next, as Mail does
        // after a delete. Nothing left: close, back to the graph.
        const after = listedBefore ? nextWipFile(file, source, listedBefore, status) : null
        if (after) ui.setFileView({ repoPath, file: after.file, source: after.source, mode: view.mode })
        else ui.setFileView(null, repoPath)
        return
      }
      ui.setFileView({ ...view, source: { type: 'commit', hash: head } })
      if (detailsOnWip.current && !repoState().repos[repoPath]?.selected) {
        repoState().select(repoPath, { type: 'commit', hash: head })
      }
    })()
    return cancel
  }, [view, status, headCommit, commits, branches, editing, repoPath, file, source])
}
