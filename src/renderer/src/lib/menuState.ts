// What a submenu parent shows about the state hidden inside it. Pure, so the
// rule is testable without rendering a menu.

import type { MenuItem } from '../stores/ui'

export type SubmenuSummary =
  /** The chosen option of a single-choice group, shown as the parent's value. */
  | { kind: 'value'; label: string }
  /** At least one independent toggle somewhere below is on. */
  | { kind: 'on' }
  | null

/**
 * A single-choice group answers "which one" — its checked label is the value,
 * unless it is the first option, which is the default by convention: a menu
 * should draw the eye to what was changed, not restate every default.
 * Otherwise any checked toggle, at any depth, earns a dot: the point is that a
 * setting buried two levels down is never invisible from the top.
 */
export function submenuSummary(items: MenuItem[]): SubmenuSummary {
  const radios = items.filter((i) => i.radio)
  const chosen = radios.find((i) => i.checked)
  if (chosen?.label && chosen !== radios[0]) return { kind: 'value', label: chosen.label }
  return anyOn(items) ? { kind: 'on' } : null
}

function anyOn(items: MenuItem[]): boolean {
  return items.some((i) => (i.checked && !i.radio) || (i.submenu ? anyOn(i.submenu) || nestedValue(i.submenu) : false))
}

/** A nested single-choice group counts as "on" only when it is not on its first
 *  (default) option — otherwise every menu with a default would carry a dot. */
function nestedValue(items: MenuItem[]): boolean {
  const radios = items.filter((i) => i.radio)
  return radios.length > 0 && !radios[0].checked && radios.some((i) => i.checked)
}
