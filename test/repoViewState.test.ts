import { repathRepoTabs } from '../src/renderer/src/lib/repoRepath'
import { beforeEach, describe, expect, it } from 'vitest'
import { fileViewKey, useUIStore, type FileViewState, type FileReaderSession } from '../src/renderer/src/stores/ui'

const a: FileViewState = { repoPath: '/a', file: 'same.ts', source: { type: 'commit', hash: 'aaa' }, mode: 'diff' }
const b: FileViewState = { repoPath: '/b', file: 'same.ts', source: { type: 'commit', hash: 'bbb' }, mode: 'file' }
const reader = (view: FileViewState): FileReaderSession => ({ key: fileViewKey(view), mode: view.mode, editing: true, draft: 'unsaved', findOpen: true, find: { query: 'needle', caseSensitive: false, wholeWord: false, regex: false }, ignoreWs: false, scroll: [{ top: 480, left: 0 }] })
const ui = () => useUIStore.getState()

beforeEach(() => {
  useUIStore.setState(useUIStore.getInitialState(), true)
  ui().activateRepoView('/a')
})

describe('repository working views', () => {
  it('restores independent files, modes and filters without changing global layout', () => {
    ui().setFileView(a)
    ui().setGraphFilter('alpha')
    ui().setAuthorFilter('Alice')
    ui().setSidebarTab('files')
    ui().openChatPanel()
    const layout = ui().layout
    ui().activateRepoView('/b')
    expect(ui()).toMatchObject({ fileView: null, graphFilter: '', authorFilter: null, sidebarTab: 'git', rightPanelTab: 'details' })
    ui().setFileView(b)
    ui().setGraphFilter('beta')
    ui().activateRepoView('/a')
    expect(ui()).toMatchObject({ fileView: a, graphFilter: 'alpha', authorFilter: 'Alice', sidebarTab: 'files', rightPanelTab: 'chat' })
    expect(ui().layout).toBe(layout)
    ui().activateRepoView('/b')
    expect(ui()).toMatchObject({ fileView: b, graphFilter: 'beta' })
  })
  it('closing one file leaves the other repo open', () => {
    ui().setFileView(a)
    ui().activateRepoView('/b')
    ui().setFileView(b)
    ui().setFileView(null, '/a')
    expect(ui().fileView).toEqual(b)
    ui().activateRepoView('/a')
    expect(ui().fileView).toBeNull()
    ui().activateRepoView('/b')
    expect(ui().fileView).toEqual(b)
  })
  it('parks views across a page tab and does not reset on a same-repo settings update', () => {
    ui().setFileView(a)
    ui().setEditorDirty(true, '/a')
    ui().activateRepoView('/a')
    expect(ui().editorDirty).toBe(true)
    ui().activateRepoView(null)
    expect(ui().fileView).toBeNull()
    ui().activateRepoView('/a')
    expect(ui().fileView).toEqual(a)
  })
  it('does not replay a pull entry or search-hit jump when returning', () => {
    ui().setFileView({ ...a, initialScroll: 'end', line: 42 })
    ui().activateRepoView('/b')
    ui().activateRepoView('/a')
    expect(ui().fileView?.initialScroll).toBeUndefined()
    expect(ui().fileView?.line).toBeUndefined()
    expect(ui().fileView?.file).toBe('same.ts')
  })
  it('isolates conflict views and background completion', () => {
    ui().setConflictView({ repoPath: '/a', file: 'conflict.txt' })
    ui().activateRepoView('/b')
    ui().setConflictView({ repoPath: '/b', file: 'conflict.txt' })
    ui().openChatPanel()
    ui().setConflictView(null, '/a')
    ui().showDetailsPanel('/a')
    expect(ui().conflictView?.repoPath).toBe('/b')
    expect(ui().rightPanelTab).toBe('chat')
    ui().activateRepoView('/a')
    expect(ui().conflictView).toBeNull()
  })
  it('ignores an outgoing component clearing the new repo search or dirty flag', () => {
    ui().activateRepoView('/b')
    ui().setEditorDirty(true, '/b')
    ui().setFileSearch(reader(b).find, '/b')
    ui().setEditorDirty(false, '/a')
    ui().setFileSearch(null, '/a')
    expect(ui().editorDirty).toBe(true)
    expect(ui().fileSearch?.query).toBe('needle')
  })
  it('captures reader cleanup for its original repo after a switch, but not after close or replacement', () => {
    ui().setFileView(a)
    ui().activateRepoView('/b')
    ui().setFileView(b)
    ui().rememberFileReader(a, reader(a))
    expect(ui().fileReaders['/a'].draft).toBe('unsaved')
    expect(ui().fileView).toEqual(b)
    ui().setFileView(null, '/a')
    ui().rememberFileReader(a, reader(a))
    expect(ui().fileReaders['/a']).toBeUndefined()
    ui().setFileView({ ...a, source: { type: 'commit', hash: 'new-revision' } })
    ui().rememberFileReader(a, reader(a))
    expect(ui().fileReaders['/a']).toBeUndefined()
    expect(fileViewKey(a)).not.toBe(fileViewKey(b))
  })
})


it('reconnects tabs, nested group folders and repo pages without duplicate entries', () => {
  const tabs = repathRepoTabs([
    { id: 'g', kind: 'group', name: 'Group', activeRepoPath: '/old', repos: [{ path: '/old', name: 'Old' }, { path: '/new', name: 'New' }], folders: [{ id: 'f', name: 'Nested', paths: ['/old'], folders: [] }], pages: [{ type: 'wiki', repoPath: '/old' }] },
    { id: 'r', kind: 'repo', name: 'Repo', activeRepoPath: '/old', repos: [{ path: '/old', name: 'Repo' }] },
    { id: 'p', kind: 'page', name: 'Insights', page: { type: 'insights', repoPath: '/old' } }
  ], '/old', '/new')
  expect(JSON.stringify(tabs)).not.toContain('/old')
  expect(tabs[0]).toMatchObject({ activeRepoPath: '/new', repos: [{ path: '/new' }], folders: [{ paths: ['/new'] }], pages: [{ repoPath: '/new' }] })
  expect(tabs[1]).toMatchObject({ activeRepoPath: '/new', repos: [{ path: '/new' }] })
  expect(tabs[2]).toMatchObject({ page: { repoPath: '/new' } })
})
