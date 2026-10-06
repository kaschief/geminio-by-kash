import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useUIStore } from '../stores/ui'
import { placePopover, type PopoverPlacement } from '../lib/menuPlacement'
import { useOutsidePress } from './useOutsidePress'
import { useT } from '../i18n'

/**
 * The confirm that points at what was chosen (see `ConfirmPopoverSpec`). It is
 * not modal: the window behind keeps scrolling, so the change can be read
 * before answering. A press outside only closes it, the way a menu closes.
 *
 * Cancel takes the focus, so an Enter pressed out of habit never destroys
 * anything; Esc cancels.
 */
export function ConfirmPopover(): React.JSX.Element {
  const t = useT()
  const spec = useUIStore((s) => s.confirmPopover)
  const close = useUIStore((s) => s.closeConfirmPopover)
  const ref = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [placement, setPlacement] = useState<PopoverPlacement | null>(null)

  const cancel = (): void => {
    spec?.onCancel?.()
    close()
  }

  // Measured before the first paint, like the context menu.
  useLayoutEffect(() => {
    const el = ref.current
    if (!spec || !el) return setPlacement(null)
    setPlacement(
      placePopover(
        spec.anchor,
        { width: el.offsetWidth, height: el.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
        spec.prefer
      )
    )
  }, [spec])

  useEffect(() => {
    if (!spec) return
    // A frame later: a menu that opened this hands focus back to its row as it
    // closes, which would otherwise take it straight off Cancel.
    const frame = requestAnimationFrame(() => cancelRef.current?.focus())
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      cancel()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKey, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec])

  useOutsidePress(!!spec, [ref], cancel)

  const beside = placement?.side === 'left' || placement?.side === 'right'
  return (
    <AnimatePresence>
      {spec && (
        <motion.div
          ref={ref}
          className="confirm-popover"
          role="alertdialog"
          aria-modal="false"
          aria-labelledby="confirm-popover-title"
          aria-describedby={spec.detail ? 'confirm-popover-detail' : undefined}
          data-side={placement?.side}
          style={placement ? { left: placement.left, top: placement.top } : { left: 0, top: 0, visibility: 'hidden' }}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.12 }}
        >
          {placement && (
            <span
              className="confirm-popover-arrow"
              aria-hidden="true"
              style={beside ? { top: placement.arrow - 5 } : { left: placement.arrow - 5 }}
            />
          )}
          <div id="confirm-popover-title" className="confirm-popover-title">
            {spec.title}
          </div>
          {spec.detail && (
            <div id="confirm-popover-detail" className="confirm-popover-detail">
              {spec.detail}
            </div>
          )}
          <div className="confirm-popover-actions">
            <button ref={cancelRef} type="button" className="btn small" onClick={cancel}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className={`btn small${spec.danger === false ? '' : ' danger'}`}
              onClick={() => {
                close()
                spec.onConfirm()
              }}
            >
              {spec.confirmLabel}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
