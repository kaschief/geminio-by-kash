/**
 * Whether a vertical scroller has content left below its visible part. The
 * 1px slack absorbs the fractional scrollTop a zoomed or HiDPI window reports
 * at the very bottom, which would otherwise keep the fade on forever.
 */
export function hasMoreBelow(scrollHeight: number, clientHeight: number, scrollTop: number): boolean {
  return scrollHeight - clientHeight - scrollTop > 1
}

/** A computed `overflow-y` that makes an element scroll vertically. */
export function scrollsVertically(overflowY: string): boolean {
  return overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay'
}

/**
 * How tall the bottom fade is, in px. A fixed strip that suits a tall panel
 * swallows a short list, so the fade is a quarter of what is visible, capped
 * at the look's full size and never so thin it stops reading as "there is more".
 */
export function fadeSize(clientHeight: number, max: number): number {
  return Math.round(Math.min(max, Math.max(12, clientHeight * 0.25)))
}

/**
 * How wide each side's fade is on a sideways strip, in px. A fade as wide as
 * what is hidden on that side, capped at `max`, melts away as the strip nears
 * an end instead of snapping off at it.
 */
export function edgeFades(
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
  max: number
): { start: number; end: number } {
  const hidden = Math.max(0, scrollWidth - clientWidth)
  const left = Math.min(hidden, Math.max(0, scrollLeft))
  const start = left > 1 ? Math.min(max, left) : 0
  const end = hidden - left > 1 ? Math.min(max, hidden - left) : 0
  return { start: Math.round(start), end: Math.round(end) }
}

/**
 * The scrollLeft that brings an item fully clear of the edge fades, or null
 * when it already is. Offsets are relative to the strip's visible left edge.
 */
export function revealOffset(
  itemLeft: number,
  itemWidth: number,
  scrollLeft: number,
  clientWidth: number,
  fade: number
): number | null {
  if (itemLeft < fade) return Math.max(0, scrollLeft + itemLeft - fade)
  const overflow = itemLeft + itemWidth - (clientWidth - fade)
  if (overflow > 0) return scrollLeft + overflow
  return null
}
