import type { RepoRef } from '../../shared/types'
import { gitApi, shellApi } from './infrastructure/api'
import { useUIStore } from './stores/ui'
import { useSettingsStore } from './stores/settings'
import { canonicalRepoPath } from './lib/repoAlias'
import { t, interp, type TranslationKey } from './i18n'

function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

function reportSkipped(names: string[], one: TranslationKey, many: TranslationKey): void {
  if (!names.length) return
  const message =
    names.length === 1
      ? interp(t(one), { name: names[0] })
      : interp(t(many), { n: names.length, names: names.join(', ') })
  useUIStore.getState().toast('info', message)
}

/** Open in any tab, standalone or inside a group. */
export function isRepositoryOpen(path: string): boolean {
  const key = canonicalRepoPath(path)
  return useSettingsStore
    .getState()
    .settings.tabs.some((tab) => tab.kind !== 'page' && tab.repos.some((r) => canonicalRepoPath(r.path) === key))
}

/**
 * The Open Repository picker, which takes several folders at once. A single
 * pick behaves as it always has: an open repository is focused and a plain
 * folder opens with the offer to initialise. In a multi-pick, folders that are
 * already open or are not repositories are skipped and named, so they neither
 * block the rest nor duplicate a tab. Electron's dialog cannot grey out folders
 * in the panel itself (no NSOpenPanel delegate), so this is the fallback.
 */
export async function chooseRepositories(isOpen: (path: string) => boolean = isRepositoryOpen): Promise<RepoRef[]> {
  const paths = await shellApi.selectDirectories()
  if (paths.length <= 1) return paths.map((path) => ({ path, name: folderName(path) }))

  const open = paths.filter(isOpen)
  const fresh = paths.filter((path) => !isOpen(path))
  const checks = await Promise.all(fresh.map((path) => gitApi.isRepository(path).catch(() => false)))
  reportSkipped(open.map(folderName), 'repos.skippedOpenOne', 'repos.skippedOpenMany')
  reportSkipped(
    fresh.filter((_, i) => !checks[i]).map(folderName),
    'repos.skippedNotRepoOne',
    'repos.skippedNotRepoMany'
  )
  return fresh.filter((_, i) => checks[i]).map((path) => ({ path, name: folderName(path) }))
}
