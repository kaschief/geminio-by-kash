import { Pencil } from 'lucide-react'
import { useRepoStore } from '../stores/repo'
import { useUIStore } from '../stores/ui'
import { useT, interp } from '../i18n'
import { workingChangeCount } from '../lib/workingChanges'

/**
 * Top of the details panel while a commit or stash is shown: "you have
 * uncommitted changes", with a way back to them. Reading history is exactly
 * when the WIP row is out of sight — scrolled away, or covered by a file — and
 * the details panel is where the eye already is. Absent when the tree is clean.
 */
export function WorkingChangesBanner({ path }: { path: string }): React.JSX.Element | null {
  const t = useT()
  const count = useRepoStore((s) => workingChangeCount(s.repos[path]?.status))
  if (count === 0) return null
  return (
    <div className="wip-banner" role="status">
      <Pencil size={12} aria-hidden="true" />
      <span className="wip-banner-text">
        {interp(t(count === 1 ? 'wipBanner.one' : 'wipBanner.many'), { n: count })}
      </span>
      <button
        type="button"
        className="btn ghost tiny wip-banner-btn"
        onClick={() => {
          useUIStore.getState().setFileView(null)
          useRepoStore.getState().select(path, { type: 'wip' })
        }}
      >
        {t('wipBanner.view')}
      </button>
    </div>
  )
}
