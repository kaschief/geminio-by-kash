import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useT } from '../i18n'
import { useSettingsStore } from '../stores/settings'
import { useUIStore, type FileViewState } from '../stores/ui'
import { adjacentFile, fileSequenceKey } from '../lib/fileSequence'
import { ElasticFilePull, PULL_QUIET_MS, pullConfig, type PullConfig, type PullDirection } from '../lib/elasticFilePull'

// FileViewer remounts when its file changes. Carry the tail guard across that
// remount so one trackpad gesture cannot skip several files.
let quietUntil = 0
interface PullPreview { direction: PullDirection; file: string; stretch: number; ready: boolean; progress: number; opening: boolean }

export function useElasticFileNavigation(bodyRef: RefObject<HTMLDivElement>, view: FileViewState, enabled: boolean, config: PullConfig): PullPreview | null {
  const [preview, setPreview] = useState<PullPreview | null>(null)
  const live = useRef({ view, enabled })
  live.current = { view, enabled }
  const key = `${fileSequenceKey(view)}:${view.file}:${view.mode}`
  const entered = useRef('')

  useLayoutEffect(() => {
    if (!enabled || entered.current === key) return
    entered.current = key
    const body = bodyRef.current
    if (body && view.initialScroll === 'end') {
      body.scrollTop = body.scrollHeight
      body.querySelectorAll<HTMLElement>('.diff-split-col').forEach((col) => { col.scrollTop = col.scrollHeight })
    }
    if (body && view.initialScroll && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      body.animate([{ transform: `translateY(${view.initialScroll === 'end' ? -64 : 64}px)`, opacity: 0.25 }, { transform: 'translateY(0)', opacity: 1 }], { duration: config.entryMs, easing: 'cubic-bezier(.16,1,.3,1)' })
    }
  }, [key, enabled, view.initialScroll, bodyRef, config])

  useEffect(() => {
    const body = bodyRef.current
    setPreview(null)
    if (!body || !enabled) return
    const pull = new ElasticFilePull(config)
    let timer: ReturnType<typeof setTimeout> | undefined
    let targetFile: string | undefined
    let committing = false
    const cancel = (): void => {
      clearTimeout(timer)
      pull.reset()
      committing = false
      targetFile = undefined
      setPreview(null)
    }
    const release = (): void => {
      const direction = pull.release(performance.now())
      const expected = targetFile
      const ui = useUIStore.getState()
      if (!direction || !live.current.enabled || ui.modal || ui.editorDirty) { cancel(); return }
      const next = adjacentFile(live.current.view, direction)
      if (!next || next.file !== expected) { cancel(); return }
      committing = true
      setPreview((value) => value ? { ...value, opening: true, stretch: 190 } : null)
      // Give the armed state a distinct release beat before the next file enters.
      timer = setTimeout(() => {
        const state = useUIStore.getState()
        const target = adjacentFile(live.current.view, direction)
        if (!live.current.enabled || state.modal || state.editorDirty || target?.file !== expected) { cancel(); return }
        quietUntil = performance.now() + 600
        target.open()
        const opened = useUIStore.getState()
        if (opened.fileView?.file === target.file && fileSequenceKey(opened.fileView) === fileSequenceKey(live.current.view)) {
          opened.setFileView({ ...opened.fileView, initialScroll: direction === -1 ? 'end' : 'start' })
        }
      }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : config.openingMs)
    }
    const wheel = (event: WheelEvent): void => {
      const current = live.current
      const ui = useUIStore.getState()
      if (!current.enabled || ui.modal || ui.editorDirty || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) { cancel(); return }
      if (committing) { event.preventDefault(); return }
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY) || !event.deltaY) { cancel(); return }
      const now = performance.now()
      if (now < quietUntil) {
        // Guard only against another file switch. Let the browser scroll the
        // new file immediately, even while the old gesture's wheel tail runs.
        quietUntil = Math.max(quietUntil, now + PULL_QUIET_MS)
        return
      }
      // Split diffs have nested scrollers. An inner column must reach its own
      // edge before a pull can begin; normal wheel scrolling stays native.
      let scroller: HTMLElement = event.target instanceof Element ? event.target.closest<HTMLElement>('.diff-split-col') ?? body : body
      if (!body.contains(scroller)) scroller = body
      const direction: PullDirection = event.deltaY > 0 ? 1 : -1
      const edge = direction === -1 ? scroller.scrollTop <= 1 : scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1
      const next = adjacentFile(current.view, pull.direction ?? direction)
      if (!next) { cancel(); return }
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroller.clientHeight : 1)
      const consumed = pull.wheel(delta, now, edge ? direction : null)
      clearTimeout(timer)
      if (!consumed) { setPreview(null); return }
      event.preventDefault()
      targetFile = next.file
      setPreview(pull.direction ? { direction: pull.direction, file: next.file, stretch: pull.stretch, ready: pull.ready, progress: pull.progress, opening: false } : null)
      timer = setTimeout(release, config.releaseMs)
    }
    const keydown = (event: KeyboardEvent): void => { if (event.key === 'Escape') cancel() }
    body.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener('blur', cancel)
    window.addEventListener('keydown', keydown)
    body.addEventListener('pointerdown', cancel)
    return () => {
      clearTimeout(timer)
      body.removeEventListener('wheel', wheel)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('keydown', keydown)
      body.removeEventListener('pointerdown', cancel)
    }
  }, [bodyRef, key, enabled, config])
  return enabled ? preview : null
}

// Keep animation state in this tiny sibling: rendering hundreds of highlighted
// diff lines on every wheel sample would make the gesture stutter.
export function ElasticFileNavigation({ bodyRef, view, enabled }: { bodyRef: RefObject<HTMLDivElement>; view: FileViewState; enabled: boolean }): React.JSX.Element | null {
  const gestureEnabled = useSettingsStore((s) => s.settings.elasticFileNavigation ?? true)
  const feel = useSettingsStore((s) => s.settings.elasticFileNavigationFeel)
  const config = pullConfig(feel)
  const pull = useElasticFileNavigation(bodyRef, view, enabled && gestureEnabled, config)
  const t = useT()
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body) return
    body.style.setProperty('--file-pull-return-ms', `${config.entryMs}ms`)
    body.style.transform = `translateY(${pull ? -pull.direction * pull.stretch : 0}px)`
    body.classList.toggle('is-pulling', !!pull && !pull.opening)
    body.classList.toggle('is-opening-file', !!pull?.opening)
  }, [bodyRef, pull, config])
  return pull ? (
    <div className={`fv-file-pull ${pull.direction === 1 ? 'at-bottom' : 'at-top'} ${pull.ready ? 'is-ready' : ''} ${pull.opening ? 'is-opening' : ''}`} role="status">
      <div className="fv-pull-meter" aria-hidden="true">
        <svg viewBox="0 0 48 48"><circle className="fv-pull-track" cx="24" cy="24" r="20" /><circle className="fv-pull-progress" cx="24" cy="24" r="20" strokeDasharray="125.664" strokeDashoffset={125.664 * (1 - pull.progress)} /></svg>
        {pull.direction === 1 ? <ChevronDown size={22} /> : <ChevronUp size={22} />}
      </div>
      <div>
        <span>{pull.opening ? t('fileViewer.openingFile') : pull.ready ? t('fileViewer.releaseToOpen') : pull.direction === 1 ? t('fileViewer.pullNext') : t('fileViewer.pullPrevious')}</span>
        <strong>{pull.file}</strong>
      </div>
    </div>
  ) : null
}
