import { fileStats, summaryChips, toggleBucket, type BucketFilter, type StatBucket } from '../lib/fileStats'
import { interp, useT } from '../i18n'
import { useSettingsStore } from '../stores/settings'
import type { ChangeCountStyle } from '../../../shared/types'

/** The sign each kind wears, the way `git diff --stat` and GitHub write it. */
const SIGN: Record<StatBucket, string> = { mod: '~', add: '+', del: '−', ren: '→', conflict: '!' }

/** The change breakdown above a file list: one signed, coloured count per
 *  kind (~7 +3 −1). Colour carries the kind, so no tiles or boxes compete with
 *  the rows below. Drawn as loose numbers or as one capsule (Settings → Files
 *  & diffs); `style` overrides that, for the Settings preview.
 *
 *  Given `onFilter`, the counts double as the list's filter: the breakdown is
 *  already where the eye goes for "what kind of change", so it is where you
 *  narrow to one kind, with no extra control in the header. */
export function ChangeSummary({
  files,
  title,
  filter,
  onFilter,
  style
}: {
  files: { status: string }[]
  title?: string
  filter?: BucketFilter
  onFilter?: (next: BucketFilter) => void
  style?: ChangeCountStyle
}): React.JSX.Element {
  const t = useT()
  const saved = useSettingsStore((s) => s.settings.changeCountStyle ?? 'capsule')
  const look = style ?? saved
  const chips = summaryChips(fileStats(files))
  const spoken = chips.map((c) => interp(t(c.labelKey), { n: c.n })).join(', ')
  const label = [title, spoken].filter(Boolean).join('. ')
  const filtering = !!filter && filter.size > 0
  return (
    <span
      className={`change-summary is-${look}${onFilter ? ' filterable' : ''}${filtering ? ' filtering' : ''}`}
      title={onFilter ? undefined : label || undefined}
      aria-label={label || undefined}
      role={onFilter ? 'group' : undefined}
    >
      {chips.map((c) => {
        const spokenChip = interp(t(c.labelKey), { n: c.n })
        const content = `${SIGN[c.bucket]}${c.n}`
        const className = `change-chip kind-${c.bucket}`
        if (!onFilter) {
          return (
            <span key={c.bucket} className={className} title={spokenChip}>
              {content}
            </span>
          )
        }
        const on = !!filter?.has(c.bucket)
        return (
          <button
            key={c.bucket}
            type="button"
            className={`${className}${on ? ' on' : ''}`}
            aria-pressed={on}
            aria-label={spokenChip}
            // Just the count in words. How to filter is in the handbook; a tip
            // that teaches it on every hover would be noise after the first.
            data-tip={spokenChip}
            data-tip-delay="labelled"
            onClick={(e) => onFilter(toggleBucket(filter ?? new Set(), c.bucket, e.metaKey || e.ctrlKey))}
          >
            {content}
          </button>
        )
      })}
      {filtering && onFilter && (
        <button type="button" className="change-summary-clear" onClick={() => onFilter(new Set())}>
          {t('chg.showAll')}
        </button>
      )}
    </span>
  )
}
