// Where a context menu opens, given the pointer and the menu's measured size.
// Pure, so the placement rules are testable without a window.
//
// The rule is the macOS one: the menu hangs off the pointer and never covers
// it. Below and to the right when it fits; flipped above, or to the left, when
// it does not. Only a menu taller than the room on either side gets pushed
// back over the pointer — and then it goes where there is most room, scrolling
// inside its cap, so it covers as little of the clicked row as possible.

export interface MenuPlacement {
  left: number
  top: number
  /** The corner nearest the pointer — the menu grows out of it. */
  origin: `${'top' | 'bottom'} ${'left' | 'right'}`
}

/** Keeps the menu off the window's very edge. */
export const MENU_MARGIN = 8
/** A hair between the pointer and the menu, so the row under it stays legible. */
const POINTER_GAP = 2

export function placeMenu(
  pointer: { x: number; y: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number }
): MenuPlacement {
  const roomBelow = viewport.height - MENU_MARGIN - (pointer.y + POINTER_GAP)
  const roomAbove = pointer.y - POINTER_GAP - MENU_MARGIN
  const roomRight = viewport.width - MENU_MARGIN - (pointer.x + POINTER_GAP)
  const roomLeft = pointer.x - POINTER_GAP - MENU_MARGIN

  let top: number
  let vertical: 'top' | 'bottom'
  if (size.height <= roomBelow) {
    top = pointer.y + POINTER_GAP
    vertical = 'top'
  } else if (size.height <= roomAbove) {
    top = pointer.y - POINTER_GAP - size.height
    vertical = 'bottom'
  } else if (roomBelow >= roomAbove) {
    // Fits neither way: keep the side with more room and slide it only as far
    // as it must go to stay on screen.
    top = Math.max(MENU_MARGIN, viewport.height - MENU_MARGIN - size.height)
    vertical = 'top'
  } else {
    top = MENU_MARGIN
    vertical = 'bottom'
  }

  let left: number
  let horizontal: 'left' | 'right'
  if (size.width <= roomRight || roomRight >= roomLeft) {
    left = Math.min(pointer.x + POINTER_GAP, viewport.width - MENU_MARGIN - size.width)
    horizontal = 'left'
  } else {
    left = Math.max(MENU_MARGIN, pointer.x - POINTER_GAP - size.width)
    horizontal = 'right'
  }

  return { left: Math.max(MENU_MARGIN, left), top, origin: `${vertical} ${horizontal}` }
}

export interface PopoverPlacement {
  left: number
  top: number
  /** Which side of the anchor it opened on — the arrow points back at it. */
  side: 'below' | 'above' | 'left' | 'right'
  /** The arrow's centre along the edge facing the anchor: from the left edge
   *  when it opened below or above, from the top when beside. */
  arrow: number
}

/** The arrow's gap from the anchor, and how far it stays from a corner. */
const ANCHOR_GAP = 10
const ARROW_INSET = 16

type Box = { left: number; top: number; width: number; height: number }
type Size = { width: number; height: number }

/**
 * Where a popover opens beside an anchor, slid only as far as the window edge
 * makes it, with the arrow still pointing at the anchor however far it slid.
 *
 * `beside` suits a row in a narrow list (a file in the changes panel): it opens
 * to the left of the row, else the right, so the rows under it stay visible.
 * `below` suits a button or a wide row (a diff line): below it, else above.
 */
export function placePopover(anchor: Box, size: Size, viewport: Size, prefer: 'beside' | 'below' = 'below'): PopoverPlacement {
  if (prefer === 'beside') {
    const leftX = anchor.left - ANCHOR_GAP - size.width
    const rightX = anchor.left + anchor.width + ANCHOR_GAP
    const side = leftX >= MENU_MARGIN ? 'left' : rightX + size.width <= viewport.width - MENU_MARGIN ? 'right' : null
    if (side) {
      const aimY = anchor.top + anchor.height / 2
      const top = Math.max(MENU_MARGIN, Math.min(aimY - size.height / 2, viewport.height - MENU_MARGIN - size.height))
      const arrow = Math.max(ARROW_INSET, Math.min(aimY - top, size.height - ARROW_INSET))
      return { left: side === 'left' ? leftX : rightX, top, side, arrow }
    }
  }
  const below = anchor.top + anchor.height + ANCHOR_GAP
  const above = anchor.top - ANCHOR_GAP - size.height
  const fitsBelow = below + size.height <= viewport.height - MENU_MARGIN
  const side = fitsBelow || above < MENU_MARGIN ? 'below' : 'above'
  const top = side === 'below' ? Math.min(below, viewport.height - MENU_MARGIN - size.height) : above
  // A wide row (a whole diff line) is pointed at near where it starts, not in
  // the middle of a screen-wide stripe.
  const aimX = anchor.left + Math.min(anchor.width / 2, 120)
  const left = Math.max(MENU_MARGIN, Math.min(aimX - size.width / 2, viewport.width - MENU_MARGIN - size.width))
  const arrow = Math.max(ARROW_INSET, Math.min(aimX - left, size.width - ARROW_INSET))
  return { left, top: Math.max(MENU_MARGIN, top), side, arrow }
}
