/** Zoom steps for the diff pane alone, a finer ladder than the app zoom's at
 *  the small end: shrinking a diff to fit one more hunk is the common reason. */
export const DIFF_ZOOM_LEVELS = [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]
export const DIFF_ZOOM_MIN = DIFF_ZOOM_LEVELS[0]
export const DIFF_ZOOM_MAX = DIFF_ZOOM_LEVELS[DIFF_ZOOM_LEVELS.length - 1]

/** A stored value, made safe: anything unreadable is 100%. */
export function parseDiffZoom(raw: string | null): number {
  const n = Number(raw)
  if (raw === null || !Number.isFinite(n) || n <= 0) return 1
  return Math.min(DIFF_ZOOM_MAX, Math.max(DIFF_ZOOM_MIN, n))
}

/** The next level up (dir 1) or down (dir -1), clamped at the ends. A value
 *  between levels moves to the nearest level in that direction. */
export function stepDiffZoom(current: number, dir: 1 | -1): number {
  if (dir > 0) return DIFF_ZOOM_LEVELS.find((l) => l > current + 0.001) ?? DIFF_ZOOM_MAX
  return [...DIFF_ZOOM_LEVELS].reverse().find((l) => l < current - 0.001) ?? DIFF_ZOOM_MIN
}
