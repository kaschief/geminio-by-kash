import { describe, expect, it } from 'vitest'
import { searchSettings } from '../src/renderer/src/lib/settingsSearch'
import { en } from '../src/renderer/src/i18n/en'
import { editorLaunch, type EditorSetting } from '../src/shared/editors'
const search = (query: string) => searchSettings(query, key => en[key])
describe('settings search', () => {
  it('finds nested controls and preserves case-insensitive substring matching', () => {
    expect(search('  MINIMAP  ').some(m => m.page === 'files')).toBe(true)
    expect(search('vscode')[0]?.page).toBe('general')
    expect(search('app icon').some(m => m.page === 'themes' && m.tab === 'theme')).toBe(true)
    expect(search('line thickness').some(m => m.page === 'themes' && m.tab === 'graph')).toBe(true)
    expect(search('protected branches').some(m => m.page === 'repository' && m.tab === 'general')).toBe(true)
  })
  it('finds translated copy and gives no matches for empty or unknown queries', () => {
    expect(searchSettings('Zoekinstelling', () => 'Zoekinstelling').length).toBeGreaterThan(0)
    expect(search('')).toEqual([])
    expect(search('nothingmatchesxyzzzz')).toEqual([])
  })
})
describe('workspace editor launch', () => {
  const vscode: EditorSetting = { id:'vscode', name:'Visual Studio Code', command:'/usr/bin/code', source:'cli' }
  it('passes repository and file as distinct arguments, including spaces and line numbers', () => {
    expect(editorLaunch(vscode, { repo:'/my repo', path:'/my repo/a b.ts', line:12 })?.args).toEqual(['/my repo', '-g', '/my repo/a b.ts:12:1'])
    expect(editorLaunch(vscode, { repo:'/my repo', path:'/my repo/a b.ts' })?.args).toEqual(['/my repo', '-g', '/my repo/a b.ts'])
  })
  it('preserves folder-only and custom editor command semantics', () => {
    expect(editorLaunch(vscode, { repo:'/repo', path:'/repo', isDir:true })?.args).toEqual(['/repo'])
    expect(editorLaunch({ ...vscode, id:'custom', fileArgs:'--file {path}' }, { repo:'/repo', path:'/repo/a.ts' })?.args).toEqual(['--file', '/repo/a.ts'])
  })
})
