// The file list's own view settings, offered where the user already is: on a
// right-click in any file list. The same setting the header toggle writes, so
// the two never disagree.

import type { MenuItem } from '../stores/ui'
import { useSettingsStore } from '../stores/settings'
import { t } from '../i18n'
import { mi } from '../components/menuIcons'

export function fileListViewMenuItems(): MenuItem[] {
  const { settings, update } = useSettingsStore.getState()
  const view = settings.fileListView ?? 'path'
  const sort = settings.fileListSort ?? 'git'
  const tree = view === 'tree'
  return [
    { separator: true },
    {
      label: t('fileList.viewAs'),
      icon: mi.view(),
      submenu: [
        {
          label: t('composer.pathView'),
          radio: true,
          checked: !tree,
          icon: mi.list(),
          onClick: () => update((s) => ({ ...s, fileListView: 'path' }))
        },
        {
          label: t('composer.treeView'),
          radio: true,
          checked: tree,
          icon: mi.folders(),
          onClick: () => update((s) => ({ ...s, fileListView: 'tree' }))
        }
      ]
    },
    {
      label: t('fileList.sortBy'),
      icon: mi.sort(),
      // The tree is always by name; say so rather than offer a choice that does nothing.
      disabled: tree,
      title: tree ? t('composer.sortTreeTitle') : undefined,
      submenu: [
        {
          label: t('fileList.sortGit'),
          radio: true,
          checked: sort === 'git',
          icon: mi.status(),
          onClick: () => update((s) => ({ ...s, fileListSort: 'git' }))
        },
        {
          label: t('fileList.sortName'),
          radio: true,
          checked: sort === 'alpha',
          icon: mi.alphabetical(),
          onClick: () => update((s) => ({ ...s, fileListSort: 'alpha' }))
        }
      ]
    }
  ]
}
