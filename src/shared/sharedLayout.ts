import type { AppSettings, RepoLayout } from './types'

/** Adopt the current repository's arrangement once when upgrading old settings. */
export function migrateSharedLayout(settings: AppSettings): AppSettings {
  if (settings.sharedLayoutVersion === 1) return settings
  const tab = settings.tabs.find((t) => t.id === settings.activeTabId)
  const path = tab && tab.kind !== 'page' ? tab.activeRepoPath : null
  const layout = path ? settings.repoLayouts?.[path] : undefined
  return {
    ...settings,
    graphColumns: { ...settings.graphColumns, ...layout?.graphColumns },
    graphColumnOrder: layout?.graphColumnOrder ?? settings.graphColumnOrder,
    sidebarOrder: layout?.sidebarOrder ?? settings.sidebarOrder,
    sidebarHidden: layout?.sidebarHidden ?? settings.sidebarHidden,
    sidebarExpanded: Object.fromEntries(Object.entries(layout?.sidebarExpanded ?? settings.sidebarExpanded ?? {}).filter(([key]) => !key.includes(':'))),
    sharedLayoutVersion: 1
  }
}

/** Presentation is shared; branch pins and folder expansion belong to a repo. */
export function updateSharedLayout(settings: AppSettings, path: string, mut: (layout: RepoLayout) => RepoLayout): AppSettings {
  const local = settings.repoLayouts?.[path] ?? {}
  const layout = mut({
    ...local,
    graphColumns: settings.graphColumns,
    graphColumnOrder: settings.graphColumnOrder,
    sidebarOrder: settings.sidebarOrder,
    sidebarHidden: settings.sidebarHidden,
    sidebarExpanded: { ...Object.fromEntries(Object.entries(local.sidebarExpanded ?? {}).filter(([key]) => key.includes(':'))), ...settings.sidebarExpanded }
  })
  const expanded = Object.entries(layout.sidebarExpanded ?? {})
  return {
    ...settings,
    graphColumns: layout.graphColumns ?? settings.graphColumns,
    graphColumnOrder: layout.graphColumnOrder ?? settings.graphColumnOrder,
    sidebarOrder: layout.sidebarOrder ?? settings.sidebarOrder,
    sidebarHidden: layout.sidebarHidden ?? settings.sidebarHidden,
    sidebarExpanded: Object.fromEntries(expanded.filter(([key]) => !key.includes(':'))),
    sharedLayoutVersion: 1,
    repoLayouts: {
      ...settings.repoLayouts,
      [path]: { pinnedBranches: layout.pinnedBranches, sidebarExpanded: Object.fromEntries(expanded.filter(([key]) => key.includes(':'))) }
    }
  }
}
