import { describe, expect, it } from 'vitest'
import { githubRepoUrl } from '../src/renderer/src/lib/hosting'
import {
  applyRepoAlias,
  canonicalRepoName,
  canonicalRepoPath,
  migrateRepoAliases,
  repoDisplayName
} from '../src/renderer/src/lib/repoAlias'
import {
  openRepoSwitcherEntries,
  repoMenuActionTarget,
  repoMenuEntries,
  repoMenuIds,
  type RepoMenuCapabilities
} from '../src/renderer/src/lib/repositoryMenu'
import { defaultSettings, type AppSettings, type GroupTab, type RepoTab } from '../src/shared/types'

const caps = (over: Partial<RepoMenuCapabilities> = {}): RepoMenuCapabilities => ({
  path: '/Users/me/src/geminio',
  canonicalName: 'geminio',
  alias: null,
  pathAvailable: true,
  githubUrl: 'https://github.com/ThalesMMS/geminio',
  editorAvailable: true,
  editorName: 'VS Code',
  terminalAvailable: true,
  gitBusy: false,
  platform: 'darwin',
  ...over
})

const actionIds = (c: RepoMenuCapabilities): string[] =>
  repoMenuEntries(c).flatMap((e) => (e.kind === 'action' ? [e.id] : [`sep`]))

describe('canonical repository identity', () => {
  it('uses the last path segment as the canonical name on POSIX and Windows', () => {
    expect(canonicalRepoName('/Users/me/src/geminio')).toBe('geminio')
    expect(canonicalRepoName('C:\\Users\\me\\src\\geminio')).toBe('geminio')
    expect(canonicalRepoName('C:/Users/me/src/geminio/')).toBe('geminio')
  })

  it('canonicalizes Windows and POSIX paths to one alias key', () => {
    expect(canonicalRepoPath('C:\\Users\\me\\src\\geminio')).toBe('c:/Users/me/src/geminio')
    expect(canonicalRepoPath('C:/Users/me/src/geminio/')).toBe('c:/Users/me/src/geminio')
    expect(canonicalRepoPath('/Users/me/src/geminio/')).toBe('/Users/me/src/geminio')
  })

  it('prefers the path-keyed alias over a leftover RepoRef.name', () => {
    const aliases = { '/repos/geminio': 'Work' }
    expect(repoDisplayName('/repos/geminio', aliases, 'old-chip-name')).toBe('Work')
    expect(repoDisplayName('/repos/geminio', {}, 'old-chip-name')).toBe('old-chip-name')
    expect(repoDisplayName('/repos/geminio', {}, undefined)).toBe('geminio')
  })
})

describe('githubRepoUrl', () => {
  it('prefers origin when it is a GitHub remote', () => {
    expect(
      githubRepoUrl([
        { name: 'upstream', url: 'https://github.com/other/fork.git' },
        { name: 'origin', url: 'git@github.com:ThalesMMS/geminio.git' }
      ])
    ).toBe('https://github.com/ThalesMMS/geminio')
  })

  it('falls back to the first parseable GitHub remote when origin is not GitHub', () => {
    expect(
      githubRepoUrl([
        { name: 'origin', url: 'https://gitlab.com/acme/app.git' },
        { name: 'github', url: 'https://github.com/acme/app.git' }
      ])
    ).toBe('https://github.com/acme/app')
  })

  it('normalizes SSH, HTTPS and ssh:// GitHub remotes', () => {
    expect(githubRepoUrl([{ name: 'origin', url: 'git@github.com:o/r.git' }])).toBe('https://github.com/o/r')
    expect(githubRepoUrl([{ name: 'origin', url: 'https://github.com/o/r.git' }])).toBe('https://github.com/o/r')
    expect(githubRepoUrl([{ name: 'origin', url: 'ssh://git@github.com/o/r.git' }])).toBe('https://github.com/o/r')
  })

  it('returns undefined for GitLab-only or unparseable remotes', () => {
    expect(githubRepoUrl([{ name: 'origin', url: 'https://gitlab.com/acme/app.git' }])).toBeUndefined()
    expect(githubRepoUrl([{ name: 'origin', url: 'not-a-url' }])).toBeUndefined()
    expect(githubRepoUrl([])).toBeUndefined()
  })
})

describe('repository context menu builder', () => {
  it('keeps GitHub Desktop order and grouping', () => {
    expect(actionIds(caps())).toEqual([
      'createAlias',
      'showWorktrees',
      'newWorktree',
      'copyName',
      'copyPath',
      'sep',
      'viewOnGitHub',
      'openTerminal',
      'reveal',
      'openEditor',
      'sep',
      'remove'
    ])
  })

  it('offers Change Alias and Remove Alias when an alias exists', () => {
    expect(actionIds(caps({ alias: 'Work' }))).toEqual([
      'changeAlias',
      'removeAlias',
      'showWorktrees',
      'newWorktree',
      'copyName',
      'copyPath',
      'sep',
      'viewOnGitHub',
      'openTerminal',
      'reveal',
      'openEditor',
      'sep',
      'remove'
    ])
  })

  it('uses platform-specific reveal labels', () => {
    expect(repoMenuEntries(caps({ platform: 'darwin' })).find((e) => e.kind === 'action' && e.id === 'reveal'))
      .toMatchObject({ labelKey: 'repoMenu.revealFinder' })
    expect(repoMenuEntries(caps({ platform: 'win32' })).find((e) => e.kind === 'action' && e.id === 'reveal'))
      .toMatchObject({ labelKey: 'repoMenu.revealExplorer' })
    expect(repoMenuEntries(caps({ platform: 'linux' })).find((e) => e.kind === 'action' && e.id === 'reveal'))
      .toMatchObject({ labelKey: 'repoMenu.revealFileManager' })
  })

  it('keeps unavailable integrations visible but disabled', () => {
    const entries = repoMenuEntries(
      caps({ githubUrl: null, editorAvailable: false, terminalAvailable: false })
    )
    const byId = Object.fromEntries(
      entries.filter((e) => e.kind === 'action').map((e) => [e.id, e])
    )
    expect(byId.viewOnGitHub.disabled).toBe(true)
    expect(byId.openEditor.disabled).toBe(true)
    expect(byId.openTerminal.disabled).toBe(true)
    expect(repoMenuIds(entries)).toEqual(expect.arrayContaining(['viewOnGitHub', 'openEditor', 'openTerminal']))
  })

  it('disables open/inspect actions for a missing path but keeps copy, alias and remove', () => {
    const entries = repoMenuEntries(caps({ pathAvailable: false }))
    const byId = Object.fromEntries(
      entries.filter((e) => e.kind === 'action').map((e) => [e.id, e])
    )
    expect(byId.createAlias.disabled).toBe(false)
    expect(byId.copyName.disabled).toBe(false)
    expect(byId.copyPath.disabled).toBe(false)
    expect(byId.remove.disabled).toBe(false)
    expect(byId.showWorktrees.disabled).toBe(true)
    expect(byId.newWorktree.disabled).toBe(true)
    expect(byId.openTerminal.disabled).toBe(true)
    expect(byId.reveal.disabled).toBe(true)
    expect(byId.openEditor.disabled).toBe(true)
    expect(byId.viewOnGitHub.disabled).toBe(false)
  })

  it('disables worktree mutation during an incompatible git operation', () => {
    const entries = repoMenuEntries(caps({ gitBusy: true }))
    const byId = Object.fromEntries(
      entries.filter((e) => e.kind === 'action').map((e) => [e.id, e])
    )
    expect(byId.showWorktrees.disabled).toBe(false)
    expect(byId.newWorktree.disabled).toBe(true)
    expect(byId.reveal.disabled).toBe(false)
  })

  it('is repository-scoped: grouped and nested-folder surfaces share the same action ids', () => {
    const standalone = repoMenuIds(repoMenuEntries(caps()))
    const grouped = repoMenuIds(repoMenuEntries(caps({ path: '/repos/nested/app' })))
    expect(grouped).toEqual(standalone)
  })
})

describe('toolbar repository switcher entries', () => {
  it('lists standalone tabs and group members, skipping page tabs', () => {
    const { tabs } = settingsWithRepos()
    expect(openRepoSwitcherEntries(tabs)).toEqual([
      { tabId: 't1', tabKind: 'repo', groupName: null, path: '/repos/geminio', name: 'geminio' },
      { tabId: 'g1', tabKind: 'group', groupName: 'Work', path: '/repos/geminio', name: 'geminio' },
      { tabId: 'g1', tabKind: 'group', groupName: 'Work', path: '/repos/other', name: 'other' }
    ])
  })

  it('omits page tabs', () => {
    expect(
      openRepoSwitcherEntries([
        {
          id: 'p1',
          kind: 'page',
          name: 'Vault',
          page: { type: 'vault' }
        }
      ])
    ).toEqual([])
  })
})

describe('repository menu action routing', () => {
  it('copies the canonical name, not the display alias', () => {
    expect(repoMenuActionTarget('copyName', caps({ alias: 'Work', canonicalName: 'geminio' }))).toEqual({
      copy: 'geminio'
    })
  })

  it('copies the absolute repository path', () => {
    expect(repoMenuActionTarget('copyPath', caps({ path: 'C:\\src\\geminio' }))).toEqual({
      copy: 'C:\\src\\geminio'
    })
  })

  it('opens the normalized GitHub web URL', () => {
    expect(
      repoMenuActionTarget('viewOnGitHub', caps({ githubUrl: 'https://github.com/ThalesMMS/geminio' }))
    ).toEqual({ url: 'https://github.com/ThalesMMS/geminio' })
  })

  it('targets the repository root for terminal, reveal and editor', () => {
    const path = '/Users/me/src/geminio'
    expect(repoMenuActionTarget('openTerminal', caps({ path }))).toEqual({ path })
    expect(repoMenuActionTarget('reveal', caps({ path }))).toEqual({ path })
    expect(repoMenuActionTarget('openEditor', caps({ path }))).toEqual({ path })
  })
})

function settingsWithRepos(): AppSettings {
  const path = '/repos/geminio'
  const other = '/repos/other'
  const repoTab: RepoTab = {
    id: 't1',
    kind: 'repo',
    name: 'geminio',
    repos: [{ path, name: 'geminio' }],
    activeRepoPath: path
  }
  const groupTab: GroupTab = {
    id: 'g1',
    kind: 'group',
    name: 'Work',
    repos: [
      { path, name: 'geminio' },
      { path: other, name: 'other' }
    ],
    folders: [{ id: 'f1', name: 'Nested', paths: [path], folders: [] }],
    activeRepoPath: path
  }
  return {
    ...defaultSettings(),
    tabs: [repoTab, groupTab],
    recentRepos: [{ path, name: 'geminio' }],
    workspaces: [
      { id: 'default', name: 'Geminio', tabs: [repoTab, groupTab], activeTabId: 't1' },
      {
        id: 'personal',
        name: 'Personal',
        tabs: [
          {
            id: 't2',
            kind: 'repo',
            name: 'geminio',
            repos: [{ path, name: 'geminio' }],
            activeRepoPath: path
          }
        ],
        activeTabId: 't2'
      }
    ]
  }
}

describe('path-keyed aliases', () => {
  it('persists one display alias across standalone tabs, groups, nested folders and workspaces', () => {
    const next = applyRepoAlias(settingsWithRepos(), '/repos/geminio', 'Work alias')
    expect(next.repoAliases[canonicalRepoPath('/repos/geminio')]).toBe('Work alias')
    expect(next.tabs[0].name).toBe('Work alias')
    expect(next.tabs[0].kind === 'repo' && next.tabs[0].repos[0].name).toBe('Work alias')
    expect(next.tabs[1].kind === 'group' && next.tabs[1].repos[0].name).toBe('Work alias')
    expect(next.tabs[1].kind === 'group' && next.tabs[1].repos[1].name).toBe('other')
    expect(next.recentRepos[0].name).toBe('Work alias')
    const otherWs = next.workspaces.find((w) => w.id === 'personal')
    expect(otherWs?.tabs[0].name).toBe('Work alias')
    expect(otherWs?.tabs[0].kind === 'repo' && otherWs.tabs[0].repos[0].name).toBe('Work alias')
  })

  it('removing an alias restores the canonical folder name without touching the directory', () => {
    const aliased = applyRepoAlias(settingsWithRepos(), '/repos/geminio', 'Work alias')
    const next = applyRepoAlias(aliased, '/repos/geminio', null)
    expect(next.repoAliases['/repos/geminio']).toBeUndefined()
    expect(next.tabs[0].name).toBe('geminio')
    expect(next.tabs[0].kind === 'repo' && next.tabs[0].repos[0].name).toBe('geminio')
  })

  it('migrates per-group RepoRef.name custom names into the shared alias map', () => {
    const s = settingsWithRepos()
    if (s.tabs[1].kind === 'group') {
      s.tabs[1] = {
        ...s.tabs[1],
        repos: s.tabs[1].repos.map((r) => (r.path === '/repos/geminio' ? { ...r, name: 'Old group name' } : r))
      }
    }
    const next = migrateRepoAliases(s)
    expect(next.repoAliases['/repos/geminio']).toBe('Old group name')
    expect(next.tabs[0].kind === 'repo' && next.tabs[0].repos[0].name).toBe('Old group name')
    expect(next.tabs[1].kind === 'group' && next.tabs[1].repos[0].name).toBe('Old group name')
  })

  it('does not treat the canonical folder name as an alias', () => {
    expect(migrateRepoAliases(settingsWithRepos()).repoAliases).toEqual({})
  })
})
