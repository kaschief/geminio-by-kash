import { describe, it, expect, afterAll } from 'vitest'
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { gitMethodIsRead, gitService } from '../src/main/git'
import { ROW_HAZE_ALPHA, normalizeRowAccent, rowAccentParts, withAlpha } from '../src/renderer/src/graph/style'
import { defaultGraphRowAccent } from '../src/shared/types'

describe('row accent helpers', () => {
  it('turns hex into rgba at an alpha, and passes anything else through', () => {
    expect(withAlpha('#6c5ce7', 0.25)).toBe('rgba(108, 92, 231, 0.25)')
    expect(withAlpha('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)')
    expect(withAlpha('var(--accent)', 0.5)).toBe('var(--accent)')
  })

  it('keeps the old look by default', () => {
    // The haze was always the lane colour at 0x40.
    expect(ROW_HAZE_ALPHA).toBe(0.25)
    expect(defaultGraphRowAccent()).toEqual({ color: null, style: 'full', unpushed: 'dashed', unpushedRow: false })
    expect(rowAccentParts('full')).toEqual({ ring: true, bar: true, haze: true })
    expect(rowAccentParts('ring')).toEqual({ ring: true, bar: false, haze: false })
  })

  it('repairs stored settings from older shapes instead of trusting them', () => {
    expect(normalizeRowAccent(undefined)).toEqual(defaultGraphRowAccent())
    const old = { color: '#ff0000', ring: 'thick', haze: 'strong', unpushed: 'row' }
    expect(normalizeRowAccent(old)).toEqual({ color: '#ff0000', style: 'full', unpushed: 'dashed', unpushedRow: false })
    expect(normalizeRowAccent({ color: 'red', style: 'ring' }).color).toBeNull()
  })
})

const roots: string[] = []
afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

function git(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' }).trim()
}

function initRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'geminio-unpushed-'))
  roots.push(root)
  const repo = join(root, 'repo')
  mkdirSync(repo)
  execFileSync('git', ['init', '-q', '-b', 'main', repo])
  git(repo, ['config', 'user.name', 'Geminio Test'])
  git(repo, ['config', 'user.email', 'geminio@example.invalid'])
  git(repo, ['config', 'commit.gpgsign', 'false'])
  return repo
}

function commitFile(repo: string, content: string, message: string): string {
  writeFileSync(join(repo, 'a.txt'), content)
  git(repo, ['add', 'a.txt'])
  git(repo, ['commit', '-qm', message])
  return git(repo, ['rev-parse', 'HEAD'])
}

describe('unpushedCommits', () => {
  it('is a read', () => {
    expect(gitMethodIsRead('unpushedCommits')).toBe(true)
  })

  it('marks nothing without a remote, then exactly what a push would publish', async () => {
    const repo = initRepo()
    commitFile(repo, '1\n', 'one')
    expect(await gitService.unpushedCommits(repo)).toEqual([])

    const bare = join(repo, '..', 'origin.git')
    execFileSync('git', ['init', '-q', '--bare', bare])
    git(repo, ['remote', 'add', 'origin', bare])
    git(repo, ['push', '-q', '-u', 'origin', 'main'])
    expect(await gitService.unpushedCommits(repo)).toEqual([])

    const two = commitFile(repo, '2\n', 'two')
    const three = commitFile(repo, '3\n', 'three')
    expect(await gitService.unpushedCommits(repo)).toEqual([three, two])
  })
})
