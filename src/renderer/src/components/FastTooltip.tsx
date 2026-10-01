import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Quick tooltips for icon-only controls. Any element with a `data-tip` attribute
 * gets one; nothing else changes.
 *
 * Native `title` tooltips are drawn by the OS after roughly a second, with no
 * way to shorten it — fine for a labelled button, too slow for a bare icon whose
 * name is the only explanation. One listener on the document serves every such
 * control, so a button opts in with an attribute instead of a wrapper.
 *
 * Opted-in elements must not also carry `title`, or both tips would show.
 * They keep an `aria-label`: this is a visual aid, the label is what a screen
 * reader announces.
 */

/** First tip waits this long, so sweeping the pointer across a toolbar stays quiet. */
const SHOW_DELAY_MS = 250
/** Moving to a neighbour this soon after a tip closed shows its tip at once. */
const WARM_WINDOW_MS = 600
/** Gap between the control and its tip, and the minimum margin from the window edge. */
const OFFSET_PX = 6
const EDGE_PX = 8

interface Tip {
  text: string
  anchor: DOMRect
}

function tipTarget(node: EventTarget | null): HTMLElement | null {
  return node instanceof Element ? (node.closest('[data-tip]') as HTMLElement | null) : null
}

export function FastTooltip(): React.JSX.Element | null {
  const [tip, setTip] = useState<Tip | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let timer: number | undefined
    let current: HTMLElement | null = null
    let lastHiddenAt = 0

    const hide = (): void => {
      window.clearTimeout(timer)
      if (current) lastHiddenAt = performance.now()
      current = null
      setTip(null)
    }

    const show = (el: HTMLElement): void => {
      const text = el.dataset.tip
      if (!text) return
      window.clearTimeout(timer)
      current = el
      const warm = performance.now() - lastHiddenAt < WARM_WINDOW_MS
      timer = window.setTimeout(
        () => {
          // The control may have been disabled-and-moved or unmounted meanwhile.
          if (current === el && el.isConnected) setTip({ text, anchor: el.getBoundingClientRect() })
        },
        warm ? 0 : SHOW_DELAY_MS
      )
    }

    const onOver = (e: PointerEvent): void => {
      const el = tipTarget(e.target)
      if (el === current) return
      if (el) show(el)
      else if (current) hide()
    }
    const onFocus = (e: FocusEvent): void => {
      const el = tipTarget(e.target)
      // Keyboard focus only: a click also focuses, and a tip popping up under the
      // pointer right after clicking is noise.
      if (el && el.matches(':focus-visible')) show(el)
    }
    const onOut = (e: FocusEvent): void => {
      if (tipTarget(e.target) === current) hide()
    }

    document.addEventListener('pointerover', onOver)
    document.addEventListener('focusin', onFocus)
    document.addEventListener('focusout', onOut)
    document.addEventListener('pointerdown', hide, true)
    document.addEventListener('keydown', hide, true)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('blur', hide)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('focusout', onOut)
      document.removeEventListener('pointerdown', hide, true)
      document.removeEventListener('keydown', hide, true)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])

  // Measure the bubble, then place it under the control — or above, when the
  // window ends first — clamped so it never runs off either side.
  useLayoutEffect(() => {
    const bubble = bubbleRef.current
    if (!tip || !bubble) {
      setPos(null)
      return
    }
    const { width, height } = bubble.getBoundingClientRect()
    const a = tip.anchor
    const below = a.bottom + OFFSET_PX
    const top = below + height + EDGE_PX > window.innerHeight ? a.top - OFFSET_PX - height : below
    const centred = a.left + a.width / 2 - width / 2
    const left = Math.min(Math.max(centred, EDGE_PX), window.innerWidth - width - EDGE_PX)
    setPos({ left, top })
  }, [tip])

  if (!tip) return null
  return createPortal(
    <div
      ref={bubbleRef}
      className="fast-tooltip"
      role="tooltip"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
    >
      {tip.text}
    </div>,
    document.body
  )
}
