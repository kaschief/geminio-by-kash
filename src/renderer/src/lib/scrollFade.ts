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
 * Whether a scroller can carry the frosted strip, which is a sticky `::after`
 * at the end of its content. Only safe when the element has no `::after` of
 * its own and lays its children out top to bottom — in a row the strip would
 * become a sideways item.
 */
export function canFrost(afterContent: string, display: string, flexDirection: string): boolean {
  if (afterContent !== 'none' && afterContent !== 'normal') return false
  if (display === 'block' || display === 'flow-root') return true
  return (display === 'flex' || display === 'inline-flex') && flexDirection.startsWith('column')
}
