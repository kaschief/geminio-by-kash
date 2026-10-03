import { useLayoutEffect, useRef, useState } from 'react'

/** Beyond this many characters a message reads as a paragraph, not a title. */
const LONG_MESSAGE_CHARS = 120

/**
 * A commit message that cannot take over the panel. A long one is set a
 * little smaller and tighter, and stops at four lines with a fade; clicking
 * the text opens it in place. The fade alone says there is more — no "Show
 * more" link and no arrow. Short messages render exactly as before.
 *
 * Clicking a link inside, or finishing a text selection, never toggles it:
 * the text stays readable, linkable and copyable either way.
 */
export function ClampedMessage({
  text,
  resetKey,
  className,
  children
}: {
  /** The plain message, to judge its length. */
  text: string
  /** Collapses again when this changes (the selected commit). */
  resetKey: string
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  const ref = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  // Whether the clamp actually cuts text off: a long message in a wide panel
  // may fit in four lines, and then there is nothing to fade or open.
  const [overflows, setOverflows] = useState(false)
  const long = text.length > LONG_MESSAGE_CHARS

  useLayoutEffect(() => setOpen(false), [resetKey])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !long) {
      setOverflows(false)
      return
    }
    const measure = (): void => {
      if (open) return
      setOverflows(el.scrollHeight > el.clientHeight + 1)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [long, open, text])

  const toggle = (e: React.MouseEvent): void => {
    if ((e.target as HTMLElement).closest('a')) return
    if (window.getSelection()?.toString()) return
    setOpen((v) => !v)
  }

  const interactive = long && (overflows || open)
  // The frame carries the padding and divider; only the text inside is
  // clamped and masked, so the fade never eats the divider line.
  return (
    <div className={className}>
      <p
        ref={ref}
        className={`clamped-message${long ? ' is-long' : ''}${long && !open ? ' is-clamped' : ''}${interactive && !open ? ' has-more' : ''}`}
        onClick={interactive ? toggle : undefined}
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setOpen((v) => !v)
                }
              }
            : undefined
        }
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-expanded={interactive ? open : undefined}
      >
        {children}
      </p>
    </div>
  )
}
