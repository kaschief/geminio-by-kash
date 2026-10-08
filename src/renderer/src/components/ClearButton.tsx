import { X } from 'lucide-react'
import { useT } from '../i18n'

// The x inside a search or filter field. It keeps its slot while the field is
// empty (hidden, not removed), so typing the first letter never widens the field
// and shifts the controls beside it. Clicking it hands focus back to the field.
export function ClearButton({
  show,
  onClear,
  label
}: {
  show: boolean
  onClear: () => void
  label?: string
}): React.JSX.Element {
  const t = useT()
  const tip = label ?? t('common.clearSearch')
  return (
    <button
      type="button"
      className={`input-clear${show ? '' : ' is-idle'}`}
      data-tip={show ? tip : undefined}
      aria-label={tip}
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
      disabled={!show}
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
