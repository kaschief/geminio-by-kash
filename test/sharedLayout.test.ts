import { describe, expect, it } from 'vitest'
import { defaultSettings } from '../src/shared/types'
import { migrateSharedLayout, updateSharedLayout } from '../src/shared/sharedLayout'

describe('shared repository presentation', () => {
  it('adopts the open repository once and ignores other repository overrides', () => {
    const settings = defaultSettings()
    settings.tabs = [{ id: 'repo', kind: 'repo', name: 'A', repos: [{ path: '/a', name: 'A' }], activeRepoPath: '/a' }]
    settings.activeTabId = 'repo'
    settings.repoLayouts = {
      '/a': { sidebarOrder: ['tags', 'local'], sidebarHidden: ['stashes'], sidebarExpanded: { local: true, 'grp:feature': false } },
      '/b': { sidebarOrder: ['remotes', 'local'], sidebarExpanded: { tags: true }, pinnedBranches: ['topic'] }
    }
    const shared = migrateSharedLayout(settings)
    expect(shared.sidebarOrder).toEqual(['tags', 'local'])
    expect(shared.sidebarExpanded).toEqual({ local: true })
    const edited = updateSharedLayout(shared, '/b', (layout) => ({ ...layout, graphColumnOrder: ['sha', 'message', 'author', 'date', 'signature', 'deployment'] }))
    expect(edited.graphColumnOrder[0]).toBe('sha')
    expect(edited.sidebarOrder).toEqual(['tags', 'local'])
    expect(edited.sidebarExpanded).toEqual({ local: true })
    expect(edited.repoLayouts['/b'].pinnedBranches).toEqual(['topic'])
    expect(migrateSharedLayout(edited)).toBe(edited)
  })

  it('shares visibility and top-level expansion without sharing branch folders', () => {
    const settings = defaultSettings()
    const edited = updateSharedLayout(settings, '/a', (layout) => ({
      ...layout,
      graphColumns: { ...settings.graphColumns, author: { ...settings.graphColumns.author, visible: false, width: 180 } },
      sidebarExpanded: { local: true, 'grp:feature': false },
      pinnedBranches: ['main']
    }))
    const other = updateSharedLayout(edited, '/b', (layout) => layout)
    expect(other.graphColumns.author).toMatchObject({ visible: false, width: 180 })
    expect(other.sidebarExpanded).toEqual({ local: true })
    expect(other.repoLayouts['/a']).toMatchObject({ pinnedBranches: ['main'], sidebarExpanded: { 'grp:feature': false } })
    expect(other.repoLayouts['/b']).toMatchObject({ sidebarExpanded: {} })
    expect(other.repoLayouts['/b'].pinnedBranches).toBeUndefined()
  })
})
