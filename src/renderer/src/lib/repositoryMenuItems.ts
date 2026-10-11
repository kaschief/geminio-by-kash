import type { MenuItem } from '../stores/ui'
import { useUIStore } from '../stores/ui'
import { useSettingsStore } from '../stores/settings'
import { useRepoStore, repoActions } from '../stores/repo'
import { useTerminalsStore } from '../stores/terminals'
import { shellApi } from '../infrastructure/api'
import { editorIcon, openInEditor } from './editorOpen'
import { githubRepoUrl } from './hosting'
import { canonicalRepoName, lookupRepoAlias, repoDisplayName } from './repoAlias'
import {
  repoMenuActionTarget,
  repoMenuEntries,
  type RepoMenuActionId,
  type RepoMenuCapabilities,
  type RepoMenuPlatform
} from './repositoryMenu'
import { t, interp } from '../i18n'
import { mi } from '../components/menuIcons'
import { tabLabel } from './tabLabel'
import { closeNotice, repoCloseStatus, tabCloseStatus } from './tabClose'

function platformOf(): RepoMenuPlatform {
  const p = window.api.platform
  if (p === 'darwin' || p === 'win32') return p
  return 'linux'
}

export function repoMenuCapabilities(path: string): RepoMenuCapabilities {
  const settings = useSettingsStore.getState().settings
  const repo = useRepoStore.getState().repos[path]
  const alias = lookupRepoAlias(path, settings.repoAliases) ?? null
  return {
    path,
    canonicalName: canonicalRepoName(path),
    alias,
    pathAvailable: repo ? !repo.notGit : true,
    githubUrl: githubRepoUrl(repo?.remotes ?? []) ?? null,
    editorAvailable: !!settings.editor?.command,
    editorName: settings.editor?.name,
    terminalAvailable: true,
    gitBusy: !!repo?.mergeState,
    platform: platformOf()
  }
}

function promptAlias(path: string, current: string | null, canonical: string): void {
  useUIStore.getState().openModal({
    kind: 'input',
    title: t('repoMenu.aliasTitle'),
    label: t('repoMenu.aliasLabel'),
    initial: current ?? canonical,
    submitLabel: t('common.save'),
    onSubmit: (value) => useSettingsStore.getState().setRepoAlias(path, value.trim() || null)
  })
}

function focusRepo(path: string): void {
  const settings = useSettingsStore.getState()
  const tab = settings.settings.tabs.find((t) => t.kind !== 'page' && t.repos.some((r) => r.path === path))
  if (!tab) return
  settings.setActiveTab(tab.id)
  if (tab.kind === 'group') settings.setGroupActiveRepo(tab.id, path)
}

function showWorktrees(path: string): void {
  focusRepo(path)
  const settings = useSettingsStore.getState()
  settings.updateRepoLayout(path, (l) => {
    const hidden = l.sidebarHidden ?? settings.settings.sidebarHidden ?? []
    return {
      ...l,
      sidebarHidden: hidden.filter((id) => id !== 'worktrees'),
      sidebarExpanded: { ...(l.sidebarExpanded ?? {}), worktrees: true }
    }
  })
}

function promptNewWorktree(path: string): void {
  const repo = useRepoStore.getState().repos[path]
  useUIStore.getState().openModal({
    kind: 'input',
    title: t('sidebar.addWorktree'),
    label: t('sidebar.addWorktreeLabel'),
    placeholder: t('sidebar.addWorktreePlaceholder'),
    submitLabel: t('common.add'),
    onSubmit: (value) => {
      const parts = value.trim().split(/\s+/)
      const dir = parts[0]
      const branch = parts[1] ?? repo?.branches.current
      if (!dir || !branch) return
      const isExisting = repo?.branches.locals.some((b) => b.name === branch) ?? false
      void repoActions.worktreeAdd(path, dir, branch, !isExisting)
    }
  })
}

function openTerminal(path: string): void {
  focusRepo(path)
  useTerminalsStore.getState().ensureRepo(path, path)
  useUIStore.getState().setTerminalOpen(path, true)
}

function runAction(id: RepoMenuActionId, caps: RepoMenuCapabilities, onRemove: () => void): void {
  const target = repoMenuActionTarget(id, caps)
  switch (id) {
    case 'createAlias':
    case 'changeAlias':
      promptAlias(caps.path, caps.alias, caps.canonicalName)
      return
    case 'removeAlias':
      useSettingsStore.getState().setRepoAlias(caps.path, null)
      return
    case 'showWorktrees':
      showWorktrees(caps.path)
      return
    case 'newWorktree':
      promptNewWorktree(caps.path)
      return
    case 'copyName':
    case 'copyPath':
      if (target?.copy) void navigator.clipboard.writeText(target.copy)
      return
    case 'viewOnGitHub':
      if (target?.url) void shellApi.openExternal(target.url)
      return
    case 'openTerminal':
      openTerminal(caps.path)
      return
    case 'reveal':
      void shellApi.revealInFolder(caps.path)
      return
    case 'openEditor': {
      const editor = useSettingsStore.getState().settings.editor
      if (editor) void openInEditor(editor, { path: caps.path, isDir: true })
      return
    }
    case 'remove':
      onRemove()
  }
}

/** Shared repository-scoped context menu. `extras` are appended after Remove;
 *  a null `onRemove` leaves Remove out. */
export function repositoryMenuItems(path: string, onRemove: (() => void) | null, extras?: MenuItem[]): MenuItem[] {
  const caps = repoMenuCapabilities(path)
  const editor = useSettingsStore.getState().settings.editor
  const items: MenuItem[] = repoMenuEntries(caps, onRemove !== null).map((entry) => {
    if (entry.kind === 'separator') return { separator: true }
    return {
      label: entry.vars ? interp(t(entry.labelKey), entry.vars) : t(entry.labelKey),
      icon: entry.id === 'openEditor' && editor?.command ? editorIcon(editor) : mi[entry.icon](),
      disabled: entry.disabled,
      danger: entry.danger,
      onClick: () => runAction(entry.id, caps, () => onRemove?.())
    }
  })
  if (extras?.length) items.push({ separator: true }, ...extras)
  return items
}

/** Drop a repo from its group at once. Its files are untouched; work in
 *  progress earns a note with a way back. */
export function requestRemoveRepoFromGroup(groupTabId: string, repoPath: string): void {
  const settingsStore = useSettingsStore.getState()
  const group = settingsStore.settings.tabs.find((tab) => tab.id === groupTabId)
  if (!group || group.kind === 'page') return
  const ref = group.repos.find((r) => r.path === repoPath)
  if (!ref) return
  const status = repoCloseStatus(useRepoStore.getState().repos[repoPath])
  settingsStore.removeRepoFromGroup(groupTabId, repoPath)
  const name = repoDisplayName(repoPath, settingsStore.settings.repoAliases, ref.name)
  announceClose(closeNotice(status, name, 'remove'), () => {
    const st = useSettingsStore.getState()
    // The last repo out takes the group with it; reopening the group restores both.
    if (st.settings.tabs.some((tab) => tab.id === groupTabId)) st.addRepoToGroup(groupTabId, ref)
    else st.reopenTab(groupTabId)
  })
}

/** Close a tab at once — every close path (×, middle-click, menus, ⌘W) lands here. */
export function requestCloseTab(tabId: string): void {
  const settingsStore = useSettingsStore.getState()
  const tab = settingsStore.settings.tabs.find((candidate) => candidate.id === tabId)
  if (!tab) return
  settingsStore.closeTab(tab.id)
  if (tab.kind === 'page') return

  const status = tabCloseStatus(tab.repos, useRepoStore.getState().repos)
  const name =
    tab.kind === 'group' && tab.repos.length > 1
      ? tab.name
      : repoDisplayName(tab.repos[0]?.path ?? '', settingsStore.settings.repoAliases, tab.repos[0]?.name)
  announceClose(closeNotice(status, name, 'close'), () => useSettingsStore.getState().reopenTab(tab.id))
}

/** Close every tab but this one, with one note that brings them all back. */
export function requestCloseOtherTabs(tabId: string): void {
  const settingsStore = useSettingsStore.getState()
  const others = settingsStore.settings.tabs.filter((tab) => tab.id !== tabId)
  if (others.length === 0) return
  settingsStore.closeOtherTabs(tabId)
  const only = others.length === 1 ? others[0] : null
  const name = !only
    ? null
    : only.kind === 'page'
      ? tabLabel(only, t)
      : only.kind === 'group' && only.repos.length > 1
        ? only.name
        : repoDisplayName(only.repos[0]?.path ?? '', settingsStore.settings.repoAliases, only.repos[0]?.name)
  const message = name
    ? interp(t('titlebar.closedOtherOne'), { name })
    : interp(t('titlebar.closedOthers'), { count: others.length })
  useUIStore.getState().toast('info', message, {
    action: {
      label: t('titlebar.reopen'),
      // Left to right, so each lands back at its old index.
      run: () => {
        const st = useSettingsStore.getState()
        for (const tab of others) st.reopenTab(tab.id)
        st.setActiveTab(tabId)
      }
    }
  })
}

function announceClose(notice: ReturnType<typeof closeNotice>, reopen: () => void): void {
  if (!notice) return
  useUIStore.getState().toast('info', interp(t(notice.key), notice.vars), {
    action: { label: t('titlebar.reopen'), run: reopen }
  })
}

export function confirmRemoveRecentRepo(repoPath: string): void {
  const settingsStore = useSettingsStore.getState()
  settingsStore.update((s) => ({
    ...s,
    recentRepos: s.recentRepos.filter((r) => r.path !== repoPath)
  }))
}
