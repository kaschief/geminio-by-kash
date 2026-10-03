// The store-facing half of tab sorting: snapshot repo state, apply an order,
// and build the "Sort Tabs" submenu. The ordering itself is in `tabSort.ts`.

import { ArrowDownUp } from 'lucide-react'
import type { TabSortKey } from '../../../shared/types'
import type { MenuItem } from '../stores/ui'
import { mi, type MenuIconName } from '../components/menuIcons'
import { useSettingsStore } from '../stores/settings'
import { useRepoStore } from '../stores/repo'
import { t } from '../i18n'
import { TAB_SORT_OPTIONS, activeTabSortKey, sortTabs, tabSortStats } from './tabSort'

// Icons live here, not beside the keys, so `tabSort.ts` stays pure and JSX-free.
const SORT_ICONS: Record<TabSortKey, MenuIconName> = {
  attention: 'attention',
  unpushed: 'ahead',
  changes: 'rename',
  behind: 'behind',
  name: 'alphabetical',
  recent: 'recent'
}

/** Reorder the live strip by `key`. No write when the order is already right. */
export function applyTabSort(key: TabSortKey): void {
  const { settings, setTabOrder } = useSettingsStore.getState()
  const repos = useRepoStore.getState().repos
  const sorted = sortTabs(settings.tabs, key, (tab) => tabSortStats(tab, repos, settings.recentRepos))
  if (sorted !== settings.tabs) setTabOrder(sorted)
}

function selectTabSort(key: TabSortKey | null): void {
  useSettingsStore.getState().setTabSort(key)
  if (key) applyTabSort(key)
}

/** One selection, not a set of one-shot actions: the checked row is the order
 *  the strip is held in, and Manual (first, so the default) is the absence of
 *  one. The parent row shows a held order before the flyout is opened. */
export function tabSortMenuItem(): MenuItem {
  const active = activeTabSortKey(useSettingsStore.getState().settings.tabSort)
  return {
    label: t('tabSort.menu'),
    icon: <ArrowDownUp size={15} strokeWidth={1.75} />,
    submenu: [
      {
        label: t('tabSort.manual'),
        icon: mi.manual(),
        radio: true,
        checked: active === null,
        title: t('tabSort.manualTitle'),
        onClick: () => selectTabSort(null)
      },
      { separator: true },
      ...TAB_SORT_OPTIONS.map(
        (o): MenuItem => ({
          label: t(o.labelKey),
          icon: mi[SORT_ICONS[o.key]](),
          radio: true,
          checked: o.key === active,
          title: t('tabSort.heldTitle'),
          onClick: () => selectTabSort(o.key)
        })
      )
    ]
  }
}
