import { LayoutDashboard } from 'lucide-react'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'

/** The repository overview; workspace management lives in Settings. */
export function AppHomeButton(): React.JSX.Element {
  const open = useUIStore((s) => s.missionOpen)
  const setOpen = useUIStore((s) => s.setMissionOpen)
  const t = useT()
  return (
    <button className={`app-home-mark ${open ? 'active' : ''}`} data-tip={t('mission.open')} data-tip-delay="labelled"
      aria-label={t('mission.open')} aria-pressed={open} onClick={() => setOpen(!open)}>
      <LayoutDashboard size={16} strokeWidth={1.6} aria-hidden="true" />
    </button>
  )
}
