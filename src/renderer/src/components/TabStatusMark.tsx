import { badgeCount, tabMark } from '../lib/tabMark'
import type { TabStatus } from '../lib/tabClose'
import { interp, useT } from '../i18n'

/** The status mark at the end of a repository tab, folder or group member. */
export function TabStatusMark({ status, unpushed }: { status: TabStatus; unpushed: number }): React.JSX.Element | null {
  const t = useT()
  const mark = tabMark(status, unpushed)
  if (!mark) return null
  if (mark.kind === 'conflict')
    return <span className="tab-status tab-status-conflict" title={t('titlebar.conflictsInProgress')} />
  if (mark.kind === 'changes')
    return <span className="tab-status tab-status-wip" title={t('titlebar.uncommittedChangesShort')} />
  const pushTitle = interp(t('titlebar.unpushedCommits'), { n: mark.count })
  return (
    <span
      className="tab-status-marks"
      title={mark.changes ? `${pushTitle} · ${t('titlebar.uncommittedChangesShort')}` : pushTitle}
    >
      <span className="tab-push-badge">{badgeCount(mark.count)}</span>
      {mark.changes && <span className="tab-status tab-status-wip" />}
    </span>
  )
}
