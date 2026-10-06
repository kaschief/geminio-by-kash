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
