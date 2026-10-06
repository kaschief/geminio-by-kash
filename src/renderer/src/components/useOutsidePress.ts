import { useEffect, useRef, type RefObject } from 'react'

/**
 * Dismiss a popover when the person presses outside it — and only dismiss it.
 * The press is swallowed, along with the click that follows, the way a macOS
 * menu behaves: closing the popover must not also switch the tab or press the
 * button that happened to be under the pointer.
 *
 * `inside` lists the elements that count as part of the popover (the trigger
 * and the panel). `except` lets a caller exempt other overlays it owns, such
 * as a context menu opened from inside the popover.
 */
export function useOutsidePress(
  active: boolean,
  inside: RefObject<HTMLElement | null>[],
  onDismiss: () => void,
  except?: (target: HTMLElement) => boolean
): void {
  // Read at press time, so the listener is added once per opening.
  const latest = useRef({ inside, onDismiss, except })
  latest.current = { inside, onDismiss, except }
  useEffect(() => {
    if (!active) return
    const swallow = (event: Event): void => {
      event.preventDefault()
      event.stopPropagation()
    }
    const onPress = (event: PointerEvent): void => {
      const { inside, onDismiss, except } = latest.current
      const target = event.target as HTMLElement
      if (inside.some((ref) => ref.current?.contains(target))) return
      if (except?.(target)) return
      swallow(event)
      // The press is already past; its mousedown and click are still to come.
      window.addEventListener('mousedown', swallow, { capture: true, once: true })
      window.addEventListener('click', swallow, { capture: true, once: true })
      // If no click follows (the press became a drag), do not eat a later one.
      window.setTimeout(() => {
        window.removeEventListener('mousedown', swallow, { capture: true })
        window.removeEventListener('click', swallow, { capture: true })
      }, 500)
      onDismiss()
    }
    window.addEventListener('pointerdown', onPress, true)
    return () => window.removeEventListener('pointerdown', onPress, true)
  }, [active])
}
