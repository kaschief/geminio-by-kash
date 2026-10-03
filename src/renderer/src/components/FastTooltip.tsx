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
 * Buttons that only carry a `title` are taken over as well (see adoptTitle),
 * so there is one tooltip style in the app, never the system's.
 */

/** First tip waits this long, so sweeping the pointer across a toolbar stays quiet. */
const SHOW_DELAY_MS = 250
/**
 * A labelled button already says what it is; its tip only adds detail, so it
 * waits until the pointer has clearly settled — the same bubble, never the
 * system's, but out of the way of anyone just passing over.
 */
const LABELLED_DELAY_MS = 1100
/** Moving to a neighbour this soon after a tip closed shows its tip at once. */
const WARM_WINDOW_MS = 600
/** Gap between the control and its tip, and the minimum margin from the window edge. */
const OFFSET_PX = 6
const EDGE_PX = 8

interface Tip {
  text: string
  anchor: DOMRect
}

const TITLED_CONTROL = 'button[title], [role="button"][title]'

/** Normalised words, for comparing a tip with the text already on the button. */
function words(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

/**
 * Hand a control's native `title` to this bubble, so every tip in the app
 * looks the same and none waits on the system's one-second delay.
 *
 * - A title that only repeats the visible label ("Push" on Push) is dropped:
 *   a tip that says what the button already says is noise.
 * - On a labelled button (a visible word of three or more letters) the tip
 *   adds detail, so it waits longer (see LABELLED_DELAY_MS).
 * - On an icon, or a glyph like "Aa" or ".*", the tip is the explanation, so
 *   it is quick.
 *
 * The title stays with screen readers: on an icon it was the accessible name;
 * next to a visible label the label stays the name (a name that differs from
 * the screen breaks voice control) and the title becomes the description.
 */
/** A visible word of three or more letters: the control already says what it is. */
function hasVisibleLabel(el: HTMLElement): boolean {
  return /\p{L}{3,}/u.test((el.textContent ?? '').trim())
}

function adoptTitle(el: HTMLElement): void {
  const title = el.getAttribute('title')
  if (!title) return
  const label = (el.textContent ?? '').trim()
  const labelled = hasVisibleLabel(el)
  el.removeAttribute('title')
  if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) {
    if (labelled) el.setAttribute('aria-description', title)
    else el.setAttribute('aria-label', title)
  }
  const redundant = labelled && words(label).includes(words(title))
  if (redundant) {
    delete el.dataset.tip
    return
  }
  el.dataset.tip = title
  if (labelled) el.dataset.tipDelay = 'labelled'
  else delete el.dataset.tipDelay
}

function tipTarget(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null
  const titled = node.closest(TITLED_CONTROL) as HTMLElement | null
  // React re-sets `title` when the prop changes; adopting again keeps the new text.
  if (titled) adoptTitle(titled)
  return node.closest('[data-tip]') as HTMLElement | null
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
      // Judged on the element itself too, not only on adopted titles: a button
      // that sets `data-tip` directly next to an icon and a word is just as
      // labelled, and a quick tip over it is noise every time the pointer passes.
      const labelled = el.dataset.tipDelay === 'labelled' || hasVisibleLabel(el)
      const delay = labelled ? LABELLED_DELAY_MS : warm ? 0 : SHOW_DELAY_MS
      timer = window.setTimeout(
        () => {
          // The control may have been disabled-and-moved or unmounted meanwhile.
          if (current === el && el.isConnected) setTip({ text, anchor: el.getBoundingClientRect() })
        },
        delay
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
