import { Search } from 'lucide-react'
import type { InputHTMLAttributes, ReactNode, Ref } from 'react'
import { ClearButton } from './ClearButton'

type InputExtras = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'placeholder' | 'className' | 'ref'>

// Every search and filter field in the app: one box, one magnifier, one hint
// style and the clear x, so they read as the same control wherever they sit.
// Callers only place and size it (`className`); the look lives in `.search-field`.
export function SearchField({
  value,
  onChange,
  placeholder,
  className = '',
  inputRef,
  clearLabel,
  tip,
  children,
  ...input
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  className?: string
  inputRef?: Ref<HTMLInputElement>
  clearLabel?: string
  /** A tip for the whole field, e.g. why it is disabled. */
  tip?: string
  /** Controls that live inside the box after the x, such as match-case toggles. */
  children?: ReactNode
} & InputExtras): React.JSX.Element {
  return (
    <div className={`search-field${input.disabled ? ' is-disabled' : ''} ${className}`} data-tip={tip}>
      <Search size={13} className="search-field-icon" aria-hidden="true" />
      <input
        ref={inputRef}
        spellCheck={false}
        aria-label={placeholder}
        {...input}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          input.onKeyDown?.(e)
          // A caller that handles Escape itself (a find bar closing) wins;
          // otherwise the first Escape empties the field and stays there.
          if (e.defaultPrevented || e.key !== 'Escape' || !value) return
          e.preventDefault()
          e.stopPropagation()
          onChange('')
        }}
      />
      <ClearButton show={!!value && !input.disabled} label={clearLabel} onClear={() => onChange('')} />
      {children}
    </div>
  )
}
