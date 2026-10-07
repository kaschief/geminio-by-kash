import type { DiffScale } from '../../../shared/types'

/** The choices offered in Settings, largest first. 1 is the diff as drawn
 *  today; there is deliberately nothing above it. */
export const DIFF_SCALES = [1, 0.9, 0.8, 0.7] as const satisfies readonly DiffScale[]

/** A saved value, made safe: anything that is not one of the offered steps
 *  (a hand-edited file, a value from a future build) reads as 1. */
export function normalizeDiffScale(raw: unknown): DiffScale {
  return DIFF_SCALES.find((s) => s === raw) ?? 1
}
