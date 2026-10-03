import { useEffect, useRef } from 'react'
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
  const total = files.length
  const allLabel = total === 1 ? t('chg.allFilesOne') : interp(t('chg.allFiles'), { n: total })

  // Esc clears the filter while focus is anywhere in this panel (the counts,
  // the list, a row). It runs before window-level Esc handlers — closing an
  // open file — so a second Esc still does that. Fields keep their own Esc.
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!filtering || !onFilter) return
    const scope = ref.current?.closest<HTMLElement>('.details, .composer')
    if (!scope) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if ((e.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) return
      e.preventDefault()
      e.stopPropagation()
      onFilter(new Set())
    }
    scope.addEventListener('keydown', onKey)
    return () => scope.removeEventListener('keydown', onKey)
  }, [filtering, onFilter])

  return (
    <span
      ref={ref}
      className={`change-summary is-${look}${onFilter ? ' filterable' : ''}${filtering ? ' filtering' : ''}`}
      title={onFilter ? undefined : label || undefined}
      aria-label={label || undefined}
      role={onFilter ? 'group' : undefined}
    >
      {onFilter && chips.length > 0 && (
        // The "All" segment: the total, lit while nothing is filtered, and the
        // way back to everything. Always present, so filtering moves nothing.
        <button
          type="button"
          className={`change-chip kind-all${filtering ? '' : ' on'}`}
          aria-pressed={!filtering}
          aria-label={allLabel}
          data-tip={allLabel}
          data-tip-delay="labelled"
          onClick={() => onFilter(new Set())}
        >
          {total}
        </button>
      )}
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
    </span>
  )
}
