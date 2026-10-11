import { useCallback } from 'react'

/**
 * For a list that scrolls in its own box: when the box mounts, scroll it so the chosen item sits in
 * the middle. Setting scrollTop directly keeps the page around it from jumping, which
 * scrollIntoView would do. The box must be the items' offsetParent (position: relative).
 */
export function useScrollToSelected<T extends HTMLElement>(selector: string): (box: T | null) => void {
  return useCallback((box: T | null) => {
    const chosen = box?.querySelector<HTMLElement>(selector)
    if (box && chosen) box.scrollTop = Math.max(0, chosen.offsetTop - (box.clientHeight - chosen.offsetHeight) / 2)
  }, [selector])
}
