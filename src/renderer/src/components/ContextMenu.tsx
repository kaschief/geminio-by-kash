import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useUIStore, type MenuItem } from '../stores/ui'
import { submenuSummary } from '../lib/menuState'
import { placeMenu, type MenuPlacement } from '../lib/menuPlacement'
import { ChoiceDot } from './StateMarks'

function itemRole(item: MenuItem): 'menuitem' | 'menuitemcheckbox' | 'menuitemradio' {
  if (item.checked === undefined) return 'menuitem'
  return item.radio ? 'menuitemradio' : 'menuitemcheckbox'
}

/** Focus the first enabled item inside a menu container. */
function focusFirstItem(container: ParentNode | null): void {
  container?.querySelector<HTMLButtonElement>('.menu-item:not(:disabled)')?.focus()
}

/** A single menu row. Rows with a `submenu` open a flyout on hover; leaf rows
 *  close the whole menu and run their `onClick`.
 *
 *  The flyout is portalled to <body> with fixed positioning rather than nested
 *  inside the menu: the parent `.context-menu` has `overflow-y:auto` (for long
 *  menus), and per CSS that forces `overflow-x:auto` too, which would clip a
 *  nested absolutely-positioned flyout and trigger scroll jank. Keyboard events
 *  from the flyout still bubble through the React tree, so the root's arrow-key
 *  handler covers it. */
function MenuRow({ item, close }: { item: MenuItem; close: () => void }): React.JSX.Element {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const rowRef = useRef<HTMLButtonElement>(null)
  const subRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // A toggle flips in place and leaves the menu open, so several can be set in
  // one visit (graph columns, sidebar sections). The items are a snapshot taken
  // when the menu opened, so the row tracks its own state from then on.
  const [toggledOn, setToggledOn] = useState(item.checked === true)

  const cancelClose = (): void => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
  }
  const scheduleClose = (): void => {
    cancelClose()
    closeTimer.current = setTimeout(() => setPos(null), 120)
  }
  useEffect(() => cancelClose, [])

  if (!item.submenu) {
    const isToggle = item.checked !== undefined && !item.radio
    const isChoice = item.checked !== undefined && !!item.radio
    return (
      <button
        className={`menu-item ${item.danger ? 'danger' : ''} ${isChoice && item.checked ? 'chosen' : ''} ${isToggle ? `toggle ${toggledOn ? 'on' : ''}` : ''}`}
        role={itemRole(item)}
        aria-checked={isToggle ? toggledOn : item.checked}
        disabled={item.disabled}
        title={item.title}
        onClick={() => {
          if (isToggle) setToggledOn((v) => !v)
          else close()
          item.onClick?.()
        }}
      >
        {isChoice && <ChoiceDot on={!!item.checked} />}
        {item.icon && <span className="menu-item-icon">{item.icon}</span>}
        <span className="menu-item-label">{item.label}</span>
        {item.detail && <span className="menu-item-detail">{item.detail}</span>}
      </button>
    )
  }

  const summary = item.detail ? { kind: 'value' as const, label: item.detail } : submenuSummary(item.submenu)

  const openSub = (): void => {
    cancelClose()
    const r = rowRef.current?.getBoundingClientRect()
    if (!r) return
    const subW = 220
    // Flip to the left of the row when there isn't room on the right.
    const left = r.right + subW > window.innerWidth - 8 ? r.left - subW - 2 : r.right + 2
    const subH = (item.submenu?.length ?? 0) * 32 + 10
    const top = Math.max(8, Math.min(r.top - 6, window.innerHeight - subH - 8))
    setPos({ left, top })
  }

  const openSubAndFocus = (): void => {
    openSub()
    // The flyout mounts on the next paint; move focus once it exists.
    requestAnimationFrame(() => focusFirstItem(subRef.current))
  }

  return (
    <div className="menu-item-sub" onMouseEnter={openSub} onMouseLeave={scheduleClose}>
      <button
        ref={rowRef}
        className={`menu-item ${item.danger ? 'danger' : ''}`}
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={!!pos}
        disabled={item.disabled}
        title={item.title}
        onClick={openSubAndFocus}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault()
            e.stopPropagation()
            openSubAndFocus()
          }
        }}
      >
        {item.icon && <span className="menu-item-icon">{item.icon}</span>}
        <span className="menu-item-label">{item.label}</span>
        {summary?.kind === 'value' && <span className="menu-item-detail">{summary.label}</span>}
        {summary?.kind === 'on' && <span className="menu-item-on-dot" aria-hidden="true" />}
        <ChevronRight size={13} className="menu-item-chevron" aria-hidden="true" />
      </button>
      {pos &&
        createPortal(
          <div
            ref={subRef}
            className="context-menu submenu"
            role="menu"
            style={{ position: 'fixed', left: pos.left, top: pos.top }}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') {
                e.preventDefault()
                e.stopPropagation()
                setPos(null)
                rowRef.current?.focus()
              }
            }}
          >
            {item.submenu.map((sub, j) =>
              sub.separator ? (
                <div key={j} className="menu-separator" role="separator" />
              ) : (
                <MenuRow key={j} item={sub} close={close} />
              )
            )}
          </div>,
          document.body
        )}
    </div>
  )
}

/** Eat the mouse events that complete a dismissing click (down, up, click,
 *  and a double-click's second click), so none reaches the page beneath. */
function swallowRestOfClick(): void {
  const types = ['mousedown', 'mouseup', 'click', 'dblclick', 'pointerup'] as const
  const eat = (e: Event): void => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'click') done()
  }
  const done = (): void => {
    for (const type of types) window.removeEventListener(type, eat, true)
    window.clearTimeout(timer)
  }
  for (const type of types) window.addEventListener(type, eat, true)
  // A click that never completes (the pointer was dragged off) must not leave
  // the page deaf; the double-click window bounds the rest.
  const timer = window.setTimeout(done, 500)
}

export function ContextMenu(): React.JSX.Element {
  const { contextMenu, closeContextMenu } = useUIStore()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      const target = e.target as HTMLElement
      // Submenus are portalled to <body>, outside `ref`. Treat a click inside
      // any `.context-menu` (root or flyout) as inside, so submenu items fire
      // their onClick instead of the menu closing out from under them.
      if (target.closest?.('.context-menu')) return
      if (!useUIStore.getState().contextMenu || !ref.current || ref.current.contains(target)) return
      closeContextMenu()
      // A click away only dismisses, as in a native menu: it must not also
      // land on whatever sits under the pointer — selecting a file, switching
      // the view — which is never what someone closing a menu meant. A
      // right-click is let through, so it can open the next menu in one go.
      if (e.button === 2) return
      e.preventDefault()
      e.stopPropagation()
      swallowRestOfClick()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && useUIStore.getState().contextMenu) {
        e.preventDefault()
        closeContextMenu()
      }
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', closeContextMenu)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', closeContextMenu)
    }
  }, [closeContextMenu])

  // Window-drag regions (the title bar, the cosmos chrome) hand their clicks to
  // the OS, so the outside-click listener above never sees them and the menu
  // stays open. While a menu is up, the stylesheet keys off this attribute to
  // make those regions ordinary content; the window just can't be dragged then.
  const menuOpen = contextMenu != null
  useEffect(() => {
    if (!menuOpen) return
    const root = document.documentElement
    root.setAttribute('data-context-menu-open', '')
    return () => root.removeAttribute('data-context-menu-open')
  }, [menuOpen])

  // Move focus into the menu on open, so arrow keys and screen readers land on
  // the first action instead of staying on whatever was behind the menu.
  useEffect(() => {
    if (contextMenu) requestAnimationFrame(() => focusFirstItem(ref.current))
  }, [contextMenu])

  // Placed from its real size, measured before the first paint: an estimate
  // from the row count ran short (separators, two-line rows), and the clamp that
  // made up for it slid the menu up over the very row that was clicked.
  const [placement, setPlacement] = useState<MenuPlacement | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!contextMenu || !el) return setPlacement(null)
    setPlacement(
      placeMenu(
        { x: contextMenu.x, y: contextMenu.y },
        { width: el.offsetWidth, height: el.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight }
      )
    )
  }, [contextMenu])

  // Arrow-key movement, scoped to the menu the focus is currently in (root or
  // flyout — flyout key events bubble here through the React tree).
  const onMenuKey = (e: React.KeyboardEvent): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
    const scope = (document.activeElement as HTMLElement | null)?.closest('.context-menu') ?? ref.current
    if (!scope) return
    const items = Array.from(scope.querySelectorAll<HTMLButtonElement>(':scope > .menu-item:not(:disabled), :scope > .menu-item-sub > .menu-item:not(:disabled)'))
    if (items.length === 0) return
    e.preventDefault()
    const at = items.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? items.length - 1
          : e.key === 'ArrowDown'
            ? (at + 1) % items.length
            : (at - 1 + items.length) % items.length
    items[next].focus()
  }

  return (
    <AnimatePresence>
      {contextMenu && (
        <motion.div
          ref={ref}
          className="context-menu"
          role="menu"
          style={
            placement
              ? { left: placement.left, top: placement.top, transformOrigin: placement.origin }
              : { left: 0, top: 0, visibility: 'hidden' }
          }
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.12 }}
          onKeyDown={onMenuKey}
        >
          {contextMenu.items.map((item, i) =>
            item.separator ? (
              <div key={i} className="menu-separator" role="separator" />
            ) : (
              <MenuRow key={i} item={item} close={closeContextMenu} />
            )
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
