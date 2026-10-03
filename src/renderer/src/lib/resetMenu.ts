// "Reset <branch> to here" as one row with a flyout, instead of three rows that
// each repeat the branch and hang the mode off an em dash. The mode is the
// choice; what it does to your work rides alongside as a dimmed detail.

import type { MenuItem } from '../stores/ui'
import { useUIStore } from '../stores/ui'
import { repoActions } from '../stores/repo'
import { t, interp } from '../i18n'
import { mi } from '../components/menuIcons'

export function resetToRefMenuItem(opts: {
  repoPath: string
  /** The ref or commit the branch would move to. */
  ref: string
  /** The checked-out branch, or null when HEAD is detached. */
  branch: string | null
  /** Shown when the row is disabled (detached HEAD). */
  disabledTitle?: string
}): MenuItem {
  const { repoPath, ref, branch } = opts
  return {
    label: interp(t('reset.toHere'), { branch: branch ?? '' }),
    icon: mi.reset(),
    disabled: !branch,
    title: branch ? undefined : opts.disabledTitle,
    submenu: [
      {
        label: t('reset.soft'),
        detail: t('reset.softDetail'),
        icon: mi.reset(),
        onClick: () => void repoActions.reset(repoPath, ref, 'soft')
      },
      {
        label: t('reset.mixed'),
        detail: t('reset.mixedDetail'),
        icon: mi.reset(),
        onClick: () => void repoActions.reset(repoPath, ref, 'mixed')
      },
      {
        label: t('reset.hard'),
        detail: t('reset.hardDetail'),
        icon: mi.discard(),
        danger: true,
        onClick: () =>
          useUIStore.getState().openModal({
            kind: 'confirm',
            title: t('commit.hardResetTitle'),
            message: interp(t('commit.hardResetMsg'), { sha: ref }),
            danger: true,
            confirmLabel: t('commit.hardResetConfirm'),
            onConfirm: () => void repoActions.reset(repoPath, ref, 'hard')
          })
      }
    ]
  }
}
