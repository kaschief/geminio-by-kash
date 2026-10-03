import { ChevronRight } from 'lucide-react'
import { SAMPLE_STATUS, fileStats, summaryChips, toggleBucket, type BucketFilter } from '../lib/fileStats'
import { interp, useT } from '../i18n'
import { statusClass, statusLabel } from './FileListView'

/** The change breakdown above a file list.
 *  Same status tiles the rows use (M / + / − / → / !) and a mono count, so
 *  the header and the tree speak one language.
 *
 *  Given `onFilter`, the counts double as the list's filter: the breakdown is
 *  already where the eye goes for "what kind of change", so it is where you
 *  narrow to one kind, with no extra control in the header. */
export function ChangeSummary({
  files,
  title,
  filter,
  onFilter
}: {
  files: { status: string }[]
  title?: string
  filter?: BucketFilter
  onFilter?: (next: BucketFilter) => void
}): React.JSX.Element {
  const t = useT()
  const chips = summaryChips(fileStats(files))
  const spoken = chips.map((c) => interp(t(c.labelKey), { n: c.n })).join(', ')
  const label = [title, spoken].filter(Boolean).join('. ')
  const filtering = !!filter && filter.size > 0
  return (
    <span
      className={`change-summary${onFilter ? ' filterable' : ''}${filtering ? ' filtering' : ''}`}
      title={onFilter ? undefined : label || undefined}
      aria-label={label || undefined}
      role={onFilter ? 'group' : undefined}
    >
      {chips.map((c) => {
        const status = SAMPLE_STATUS[c.bucket]
        const spokenChip = interp(t(c.labelKey), { n: c.n })
        const content = (
          <>
            <span className={`file-status ${statusClass(status)}`} aria-hidden="true">
              {status === 'R' ? <ChevronRight size={12} strokeWidth={3} /> : statusLabel(status)}
            </span>
            <span className="change-chip-n">{c.n}</span>
          </>
        )
        if (!onFilter) {
          return (
            <span key={c.bucket} className="change-chip" title={spokenChip}>
              {content}
            </span>
          )
        }
        const on = !!filter?.has(c.bucket)
        return (
          <button
            key={c.bucket}
            type="button"
            className={`change-chip${on ? ' on' : ''}`}
            aria-pressed={on}
            aria-label={spokenChip}
            data-tip={interp(t('chg.filterTip'), { label: spokenChip })}
            // A count is a label to read, not an unexplained icon: wait like
            // labelled controls do, so passing over the header stays quiet.
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
