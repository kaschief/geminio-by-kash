/**
 * The website's own copy. English only, like the handbook it fronts: the
 * generator still takes a locale everywhere, so `strings(locale)` falls back to
 * English for anything it is asked for.
 */
import { en } from './en.mjs'

export const SITE = { en }

/** Endonyms, for the language switcher — which hides itself with one language. */
export const LOCALE_NAMES = { en: 'English' }

export const RTL_LOCALES = new Set()

/**
 * A translator bound to one locale: `t('nav.handbook')`, with `{token}`
 * substitution for the handful of strings that carry one.
 */
export function strings(locale) {
  const dict = SITE[locale] ?? en
  return (key, vars) => {
    let out = dict[key] ?? en[key] ?? key
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, v)
    return out
  }
}
