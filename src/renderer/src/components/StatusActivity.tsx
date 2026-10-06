import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useUIStore } from '../stores/ui'

/** How long an operation runs before the status bar says it is working. */
const SHOW_AFTER_MS = 500

/**
 * What git is doing, when it takes a while — quietly, in the status bar, where
 * macOS apps report progress. Local actions (stage, discard, undo) finish
 * before it would appear, so they never flash a label; a rebase or a big
 * checkout does show. Pull and push keep their own spinners on their buttons.
 */
export function StatusActivity(): React.JSX.Element | null {
  const busy = useUIStore((s) => (s.busyOp ? null : s.busy))
  const [shown, setShown] = useState<string | null>(null)
  useEffect(() => {
    if (!busy) return setShown(null)
    const timer = setTimeout(() => setShown(busy), SHOW_AFTER_MS)
    return () => clearTimeout(timer)
  }, [busy])
  if (!shown) return null
  return (
    <span className="status-activity" role="status" aria-live="polite">
      <Loader2 size={11} className="spin" aria-hidden="true" />
      <span className="status-activity-label">{shown}</span>
    </span>
  )
}
