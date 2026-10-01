import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { migrateBrandData } from '../src/main/branding'
import { readRepoConfig } from '../src/main/repoConfig'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'geminio-brand-'))
  dirs.push(dir)
  return dir
}

describe('Geminio compatibility', () => {
  it('copies saved data without copying locks or overwriting either app', () => {
    const root = fixture()
    const source = join(root, 'Gitcito')
    const target = join(root, 'Geminio')
    mkdirSync(join(source, 'Local Storage'), { recursive: true })
    writeFileSync(join(source, 'gitcito-settings.json'), '{"existing":true}')
    writeFileSync(join(source, 'gitcito-vault.enc'), 'encrypted bytes')
    writeFileSync(join(source, 'Local Storage', 'layout'), 'saved layout')
    writeFileSync(join(source, 'SingletonLock'), 'old process')
    migrateBrandData(target, [join(root, 'missing'), source])
    expect(readFileSync(join(target, 'gitcito-vault.enc'), 'utf8')).toBe('encrypted bytes')
    expect(readFileSync(join(target, 'Local Storage', 'layout'), 'utf8')).toBe('saved layout')
    expect(existsSync(join(target, 'SingletonLock'))).toBe(false)
    writeFileSync(join(target, 'gitcito-settings.json'), '{"new":true}')
    migrateBrandData(target, [source])
    expect(readFileSync(join(target, 'gitcito-settings.json'), 'utf8')).toBe('{"new":true}')
    expect(readFileSync(join(source, 'gitcito-settings.json'), 'utf8')).toBe('{"existing":true}')
  })

  it('reads legacy repository rules but prefers the renamed config', async () => {
    const root = fixture()
    writeFileSync(join(root, '.gitcito.json'), '{"version":1,"protect":["legacy"]}')
    expect((await readRepoConfig(root)).config?.protect).toEqual(['legacy'])
    writeFileSync(join(root, '.geminio.json'), '{"version":1,"protect":["main"]}')
    expect((await readRepoConfig(root)).config?.protect).toEqual(['main'])
  })
})
