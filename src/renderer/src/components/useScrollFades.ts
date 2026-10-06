import { useEffect } from 'react'
import { fadeSize, hasMoreBelow, scrollsVertically } from '../lib/scrollFade'

const SCOPE = '[data-scroll-fade]'

/**
 * The "there is more below" fade, for the panels that opt in with
 * `data-scroll-fade`: `edge` in the details panel, `plain` (the original
 * short fade) in Settings. Everywhere else
 * scrollbars are simply hidden: a graph or a list you are already scrolling
 * needs no hint.
 *
 * Scrollers inside a scope are found rather than registered, so a new tab in
 * the details panel needs no wiring. Measuring waits only for the next frame,
 * so a freshly opened panel shows its fade with its first paint instead of
 * growing one a moment later. Changes outside every scope (the graph churns
 * rows on each scroll frame) never trigger a pass.
 */
export function useScrollFades(): void {
  useEffect(() => {
    const tracked = new Set<HTMLElement>()

    const measure = (el: HTMLElement): void => {
      const more = String(hasMoreBelow(el.scrollHeight, el.clientHeight, el.scrollTop))
      if (el.dataset.moreBelow !== more) el.dataset.moreBelow = more
      // The fade scales with the visible height (see fadeSize); styles.css reads it.
      const size = `${fadeSize(el.clientHeight, el.dataset.fadeLook === 'edge' ? 20 : 28)}px`
      if (el.style.getPropertyValue('--fade-size') !== size) el.style.setProperty('--fade-size', size)
    }
    const resize = new ResizeObserver((entries) => {
      for (const e of entries) measure(e.target as HTMLElement)
    })
    const track = (el: HTMLElement): void => {
      if (tracked.has(el)) return
      tracked.add(el)
      // `plain` keeps Settings' original short fade; `edge` fades only the cut edge.
      el.dataset.fadeLook = el.closest<HTMLElement>(SCOPE)?.dataset.scrollFade === 'edge' ? 'edge' : 'plain'
      resize.observe(el)
      measure(el)
    }

    const scan = (): void => {
      frame = 0
      for (const el of tracked) {
        if (el.isConnected) measure(el)
        else {
          tracked.delete(el)
          resize.unobserve(el)
        }
      }
      for (const scope of document.querySelectorAll<HTMLElement>(SCOPE)) {
        for (const node of [scope, ...scope.getElementsByTagName('*')]) {
          if (!(node instanceof HTMLElement) || tracked.has(node)) continue
          // Cheap size check first; style lookups only for the few that overflow.
          if (node.scrollHeight <= node.clientHeight + 1) continue
          if (scrollsVertically(getComputedStyle(node).overflowY)) track(node)
        }
      }
    }

    let frame = 0
    const schedule = (): void => {
      if (!frame) frame = requestAnimationFrame(scan)
    }
    const touchesScope = (node: Node): boolean =>
      node instanceof Element && (node.closest(SCOPE) !== null || node.querySelector(SCOPE) !== null)

    const mutations = new MutationObserver((records) => {
      for (const r of records) {
        const target = r.target instanceof Element ? r.target : r.target.parentElement
        if (target?.closest(SCOPE) || [...r.addedNodes].some(touchesScope)) {
          schedule()
          return
        }
      }
    })
    mutations.observe(document.body, { childList: true, subtree: true, characterData: true })

    const onScroll = (e: Event): void => {
      const el = e.target
      if (el instanceof HTMLElement && tracked.has(el)) measure(el)
    }
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    window.addEventListener('resize', schedule)
    scan()

    return () => {
      cancelAnimationFrame(frame)
      mutations.disconnect()
      resize.disconnect()
      document.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('resize', schedule)
    }
  }, [])
}
