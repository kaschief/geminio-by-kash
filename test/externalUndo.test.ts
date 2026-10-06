import { describe, it, expect, afterAll } from 'vitest'
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { gitMethodIsRead, gitService } from '../src/main/git'
import { noteAppWrite, wasAppWrite } from '../src/main/appWrites'
import { parseReflog } from '../src/shared/refMoves'
import type { RecentRefMoves, RefMove } from '../src/shared/types'
import {
  externalRedo,
  externalUndoFirst,
  externalUndoLabel,
  planExternalUndo,
  refMoveId
} from '../src/renderer/src/lib/externalUndo'
import { githubBranchUrl, githubLocalBranchUrl, splitUpstream } from '../src/renderer/src/lib/hosting'

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)
const C = 'c'.repeat(40)
const ZERO = '0'.repeat(40)

const move = (old: string, next: string, message: string, date = 1000, byApp = false): RefMove => ({
  old,
  new: next,
  actor: 'Kash <k@example.invalid>',
  date,
  message,
  byApp
})

const onBranch = (moves: RefMove[], branch = 'main'): RecentRefMoves => ({ branch, head: moves, branchLog: moves })

describe('parseReflog', () => {
  it('reads old, new, actor, time and message newest first, dropping a torn first line', () => {
    const text = [
      `${A.slice(5)} ${B} torn line`,
      `${A} ${B} Kash <k@example.invalid> 1700000000 +0100\tcommit: First`,
      `${B} ${C} Kash <k@example.invalid> 1700000100 -0500\tcheckout: moving from main to dev`,
      ''
    ].join('\n')
    const out = parseReflog(text, 10)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ old: B, new: C, date: 1700000100, message: 'checkout: moving from main to dev' })
    expect(out[1]).toMatchObject({ old: A, new: B, actor: 'Kash <k@example.invalid>', message: 'commit: First' })
  })
})

describe('planExternalUndo', () => {
  it('uncommits a foreign commit with a soft reset, and redoes with one', () => {
    const plan = planExternalUndo(onBranch([move(A, B, 'commit: Fix typo')]), new Set())
    expect(plan).toMatchObject({
      kind: 'commit',
      branch: 'main',
      expectedHead: B,
      undo: { type: 'reset', mode: 'soft', target: A },
      redo: { type: 'reset', mode: 'soft', target: B }
    })
    expect(externalUndoLabel(plan!)).toEqual({ key: 'extUndo.label.commit', vars: { subject: 'Fix typo' } })
  })

  it('classifies amend, reset and merge-like moves', () => {
    expect(planExternalUndo(onBranch([move(A, B, 'commit (amend): x')]), new Set())?.kind).toBe('amend')
    const reset = planExternalUndo(onBranch([move(A, B, 'reset: moving to HEAD~1')]), new Set())
    expect(reset).toMatchObject({ kind: 'reset', undo: { mode: 'restore', target: A } })
    const pull = planExternalUndo(onBranch([move(A, B, 'pull: Fast-forward')]), new Set())
    expect(pull).toMatchObject({ kind: 'move', undo: { mode: 'keep', target: A } })
  })

  it('offers a commit taken off by `reset HEAD~1` as a Redo that puts it back', () => {
    const plan = planExternalUndo(
      onBranch([move(B, A, 'reset: moving to HEAD~1', 2000), move(A, B, 'commit: feat: add ring', 1000)]),
      new Set()
    )
    expect(plan).toMatchObject({
      kind: 'uncommit',
      subject: 'feat: add ring',
      expectedHead: A,
      undo: { type: 'reset', mode: 'soft', target: B }
    })
    expect(externalRedo(plan)).toBe(plan)
    expect(externalUndoFirst(plan, undefined)).toBe(false)
    expect(externalUndoLabel(plan!)).toEqual({ key: 'extUndo.label.commit', vars: { subject: 'feat: add ring' } })
  })

  it('recognises an uncommit by what it did, however the tool worded it', () => {
    // Real reflog lines: the terminal, Geminio, and GitKraken.
    for (const message of ['reset: moving to HEAD~1', 'reset: moving to HEAD^', `reset: moving to ${A}`, 'undo: commit: feat(parallax): x'])
      expect(planExternalUndo(onBranch([move(B, A, message, 2), move(A, B, 'commit: feat(parallax): x', 1)]), new Set()))
        .toMatchObject({ kind: 'uncommit', subject: 'feat(parallax): x' })
  })

  it('recognises an uncommit when other moves came between it and the commit', () => {
    // Commit B on A, amend it to C, undo the amend back to B, then undo B.
    const plan = planExternalUndo(
      onBranch([
        move(B, A, 'reset: moving to HEAD~1', 4),
        move(C, B, `reset: moving to ${B}`, 3),
        move(B, C, 'commit (amend): y', 2),
        move(A, B, 'commit: chore: drop session', 1)
      ]),
      new Set()
    )
    expect(plan).toMatchObject({ kind: 'uncommit', subject: 'chore: drop session' })
  })

  it('recognises an uncommit of an amended commit, with the amended subject', () => {
    // Commit B on A, amend it to C, then reset HEAD~1 from C back to A.
    const plan = planExternalUndo(
      onBranch([
        move(C, A, 'reset: moving to HEAD~1', 3),
        move(B, C, 'commit (amend): test: drop forecast', 2),
        move(A, B, 'commit: feat: fix profile', 1)
      ]),
      new Set()
    )
    expect(plan).toMatchObject({ kind: 'uncommit', subject: 'test: drop forecast' })
  })

  it('does not mistake other moves for an uncommit', () => {
    // Back further than the commit's parent.
    expect(planExternalUndo(onBranch([move(B, ZERO.replace(/0/g, 'd'), 'reset: moving to HEAD~2', 2), move(A, B, 'commit: x', 1)]), new Set())?.kind)
      .toBe('reset')
    // Undoing an amend returns to the pre-amend commit, not an uncommit.
    expect(planExternalUndo(onBranch([move(B, A, 'reset: moving to HEAD@{1}', 2), move(A, B, 'commit (amend): x', 1)]), new Set())?.kind)
      .toBe('reset')
    // A redo's reset after an undo's reset: neither is a commit.
    expect(planExternalUndo(onBranch([move(A, B, `reset: moving to ${B}`, 3), move(B, A, `reset: moving to ${A}`, 2)]), new Set())?.kind)
      .toBe('reset')
    expect(externalRedo(planExternalUndo(onBranch([move(A, B, 'commit: x')]), new Set()))).toBeNull()
  })

  it('undoes a checkout by checking the previous ref out again', () => {
    const moves: RecentRefMoves = {
      branch: 'dev',
      head: [move(A, B, 'checkout: moving from main to dev')],
      branchLog: [move(ZERO, B, 'branch: Created from HEAD')]
    }
    expect(planExternalUndo(moves, new Set())).toMatchObject({
      kind: 'checkout',
      undo: { type: 'checkout', target: 'main' },
      redo: { type: 'checkout', target: 'dev' }
    })
  })

  it('leaves the app’s own moves to the app’s undo stack', () => {
    expect(planExternalUndo(onBranch([move(A, B, 'commit: mine', 1000, true)]), new Set())).toBeNull()
  })

  it('refuses a root commit — there is nothing to reset to', () => {
    expect(planExternalUndo(onBranch([move(ZERO, A, 'commit (initial): root')]), new Set())).toBeNull()
  })

  it('walks back through moves it already undid, and the resets it wrote', () => {
    const first = move(A, B, 'commit: one', 1000)
    const second = move(B, C, 'commit: two', 1001)
    const ourReset = move(C, B, 'reset: moving to B', 1002, true)
    const skip = new Set([refMoveId(second), refMoveId(ourReset)])
    const plan = planExternalUndo(onBranch([ourReset, second, first]), skip)
    expect(plan).toMatchObject({ kind: 'commit', undo: { target: A } })
  })

  it('offers nothing when HEAD is no longer where the move left it', () => {
    const first = move(A, B, 'commit: one', 1000)
    const appMove = move(B, C, 'commit: two', 1001, true)
    // `appMove` is skipped, so `first` surfaces — but HEAD is at C, not B.
    expect(planExternalUndo(onBranch([appMove, first]), new Set([refMoveId(appMove)]))).toBeNull()
  })
})

describe('externalUndoFirst', () => {
  const plan = planExternalUndo(onBranch([move(A, B, 'commit: x', 2000)]), new Set())
  it('prefers whichever happened last', () => {
    expect(externalUndoFirst(plan, undefined)).toBe(true)
    expect(externalUndoFirst(plan, 1_000_000)).toBe(true) // app entry older than the commit
    expect(externalUndoFirst(plan, 3_000_000)).toBe(false) // app entry newer
    expect(externalUndoFirst(null, undefined)).toBe(false)
  })
})

describe('appWrites', () => {
  it('attributes reflog seconds inside a write window to the app', () => {
    noteAppWrite('/tmp/x', 5_000_400, 5_001_200)
    expect(wasAppWrite('/tmp/x', 5000)).toBe(true)
    expect(wasAppWrite('/tmp/x', 5001)).toBe(true)
    // The write was over by 5001.2: a move stamped 5002 was made by someone else.
    expect(wasAppWrite('/tmp/x', 5002)).toBe(false)
    expect(wasAppWrite('/tmp/x', 4999)).toBe(false)
    expect(wasAppWrite('/tmp/other', 5000)).toBe(false)
  })
})

describe('GitHub branch links', () => {
  const remotes = [
    { name: 'origin', url: 'git@github.com:kash/geminio.git' },
    { name: 'up/stream', url: 'https://gitlab.com/x/y.git' }
  ] as Parameters<typeof githubBranchUrl>[0]
  it('builds tree URLs per segment, and only for GitHub remotes', () => {
    expect(githubBranchUrl(remotes, 'origin', 'feat/a b')).toBe('https://github.com/kash/geminio/tree/feat/a%20b')
    expect(githubBranchUrl(remotes, 'up/stream', 'main')).toBeNull()
  })
  it('splits an upstream on the longest matching remote name', () => {
    expect(splitUpstream(remotes, 'up/stream/main')).toEqual({ remote: 'up/stream', branch: 'main' })
    expect(githubLocalBranchUrl(remotes, 'origin/feature/x')).toBe('https://github.com/kash/geminio/tree/feature/x')
    expect(githubLocalBranchUrl(remotes, undefined)).toBeNull()
  })
})

// ─── Real git ──────────────────────────────────────────────────────────────

const roots: string[] = []
afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

function git(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim()
}

function initRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'geminio-extundo-'))
  roots.push(root)
  const repo = join(root, 'repo')
  mkdirSync(repo)
  execFileSync('git', ['init', '-q', '-b', 'main', repo])
  git(repo, ['config', 'user.name', 'Geminio Test'])
  git(repo, ['config', 'user.email', 'geminio@example.invalid'])
  git(repo, ['config', 'commit.gpgsign', 'false'])
  return repo
}

function commitFile(repo: string, file: string, content: string, message: string): string {
  writeFileSync(join(repo, file), content)
  git(repo, ['add', file])
  git(repo, ['commit', '-qm', message])
  return git(repo, ['rev-parse', 'HEAD'])
}

describe('recentRefMoves against a real repository', () => {
  it('is a read, so it never takes the exclusive lock', () => {
    expect(gitMethodIsRead('recentRefMoves')).toBe(true)
  })

  it('sees a terminal commit and plans an uncommit that keeps the change staged', async () => {
    const repo = initRepo()
    const base = commitFile(repo, 'a.txt', 'one\n', 'base')
    const head = commitFile(repo, 'a.txt', 'two\n', 'Change a')

    const moves = await gitService.recentRefMoves(repo)
    expect(moves.branch).toBe('main')
    expect(moves.branchLog[0]).toMatchObject({ old: base, new: head, message: 'commit: Change a', byApp: false })

    const plan = planExternalUndo(moves, new Set())
    expect(plan).toMatchObject({ kind: 'commit', expectedHead: head, undo: { target: base } })

    await gitService.reset(repo, plan!.move.old, 'soft')
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(base)
    expect(git(repo, ['diff', '--cached', '--name-only'])).toBe('a.txt')
  })

  it('sees a terminal uncommit and offers to put the commit back', async () => {
    const repo = initRepo()
    commitFile(repo, 'a.txt', 'one\n', 'base')
    const head = commitFile(repo, 'a.txt', 'two\n', 'feat: change a')
    git(repo, ['reset', '--soft', 'HEAD~1'])

    const plan = planExternalUndo(await gitService.recentRefMoves(repo), new Set())
    expect(plan).toMatchObject({ kind: 'uncommit', subject: 'feat: change a', undo: { target: head } })

    await gitService.reset(repo, plan!.undo.target, 'soft')
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(head)
    expect(git(repo, ['status', '--porcelain'])).toBe('')
  })

  it('sees an uncommit written by Geminio (a sha) and by GitKraken (`undo: commit:`)', async () => {
    for (const how of ['sha', 'gitkraken'] as const) {
      const repo = initRepo()
      const base = commitFile(repo, 'a.txt', 'one\n', 'base')
      commitFile(repo, 'a.txt', 'two\n', 'feat: change a')
      if (how === 'sha') git(repo, ['reset', '--soft', base])
      else git(repo, ['update-ref', '-m', 'undo: commit: feat: change a', 'HEAD', base])
      const plan = planExternalUndo(await gitService.recentRefMoves(repo), new Set())
      expect(plan, how).toMatchObject({ kind: 'uncommit', subject: 'feat: change a' })
    }
  })

  it('sees a terminal checkout', async () => {
    const repo = initRepo()
    commitFile(repo, 'a.txt', 'one\n', 'base')
    git(repo, ['checkout', '-q', '-b', 'dev'])
    const plan = planExternalUndo(await gitService.recentRefMoves(repo), new Set())
    expect(plan).toMatchObject({ kind: 'checkout', from: 'main', to: 'dev' })
  })
})
