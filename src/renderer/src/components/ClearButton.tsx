import { X } from 'lucide-react'
import { useT } from '../i18n'

// The x inside a search or filter field. Shown only while the field holds text,
// and it hands focus back to the field so the next keystroke starts a new query.
// Inside a bordered wrapper it sits in the row; around a bare bordered input,
// wrap both in `.clearable` and it floats over the input's end instead.
export function ClearButton({
  show,
  onClear,
  label
}: {
  show: boolean
  onClear: () => void
  label?: string
}): React.JSX.Element | null {
  const t = useT()
  if (!show) return null
  const tip = label ?? t('common.clearSearch')
  return (
    <button
      type="button"
      className="input-clear"
      data-tip={tip}
      aria-label={tip}
      // Keep focus in the field rather than moving it to the button and back.
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        onClear()
        e.currentTarget.parentElement?.querySelector('input')?.focus()
      }}
    >
      <X size={12} />
    </button>
  )
}
