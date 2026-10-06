// Every discard can be undone: captureWork saves what is staged and what is on
// disk before it, restoreWork puts exactly the discarded paths back.
import { describe, it, expect, afterAll } from 'vitest'
import { writeFileSync, readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gitService } from '../src/main/git'

const dirs: string[] = []
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })))

function repo(): { dir: string; git: (...a: string[]) => string } {
  const dir = mkdtempSync(join(tmpdir(), 'geminio-discard-undo-'))
  dirs.push(dir)
  const git = (...a: string[]): string =>
    execFileSync('git', ['-C', dir, '-c', 'user.name=D', '-c', 'user.email=d@example.invalid', ...a], { encoding: 'utf8' })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(dir, 'a.txt'), 'one\n')
  writeFileSync(join(dir, 'keep.txt'), 'keep\n')
  git('add', '-A')
  git('commit', '-qm', 'start')
  return { dir, git }
}

describe('discard undo', () => {
  it('puts back staged and unstaged edits, an untracked file and a staged new file exactly', async () => {
    const { dir, git } = repo()
    writeFileSync(join(dir, 'a.txt'), 'one\nstaged\n')
    git('add', 'a.txt')
    writeFileSync(join(dir, 'a.txt'), 'one\nstaged\nunstaged\n')
    writeFileSync(join(dir, 'new.txt'), 'untracked\n')
    writeFileSync(join(dir, 'added.txt'), 'staged new\n')
    git('add', 'added.txt')
    const statusBefore = git('status', '--porcelain')
    const stagedBefore = git('diff', '--cached')

    const saved = await gitService.captureWork(dir)
    expect(saved).not.toBeNull()
    // Discard all, the way the app does: unstage, then discard tracked and untracked.
    await gitService.unstageAll(dir)
    await gitService.discard(dir, ['a.txt', 'added.txt'], false)
    await gitService.discard(dir, ['new.txt'], true)
    expect(git('status', '--porcelain').trim()).toBe('')

    await gitService.restoreWork(dir, saved!, ['a.txt', 'added.txt', 'new.txt'])
    expect(git('status', '--porcelain')).toBe(statusBefore)
    expect(git('diff', '--cached')).toBe(stagedBefore)
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('one\nstaged\nunstaged\n')
    expect(readFileSync(join(dir, 'new.txt'), 'utf8')).toBe('untracked\n')
  })

  it('touches only the discarded paths', async () => {
    const { dir } = repo()
    writeFileSync(join(dir, 'a.txt'), 'changed\n')
    const saved = await gitService.captureWork(dir)
    await gitService.discard(dir, ['a.txt'], false)
    // Edited after the discard, before the undo: must survive it.
    writeFileSync(join(dir, 'keep.txt'), 'edited later\n')
    await gitService.restoreWork(dir, saved!, ['a.txt'])
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('changed\n')
    expect(readFileSync(join(dir, 'keep.txt'), 'utf8')).toBe('edited later\n')
  })

  it('removes a path that did not exist when the work was saved', async () => {
    const { dir } = repo()
    const saved = await gitService.captureWork(dir)
    writeFileSync(join(dir, 'later.txt'), 'x\n')
    await gitService.restoreWork(dir, saved!, ['later.txt'])
    expect(existsSync(join(dir, 'later.txt'))).toBe(false)
  })

  it('refuses a path outside the repository', async () => {
    const { dir } = repo()
    const saved = await gitService.captureWork(dir)
    await expect(gitService.restoreWork(dir, saved!, ['../escape.txt'])).rejects.toThrow(/outside/)
  })
})
