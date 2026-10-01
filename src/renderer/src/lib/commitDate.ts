/**
 * Absolute commit dates for the graph, in the reader's own locale and clock.
 * Pure (given a timestamp), so Settings can show a live example of each format.
 */
export type AbsoluteDateFormat = 'datetime' | 'iso'

/**
 * "datetime" always carries the year — "15 Sep 2026, 17:22" — because a date
 * without one is ambiguous the moment history spans a new year. "iso" is the
 * sortable, locale-free form: "2026-09-15 17:22".
 */
export function formatAbsoluteDate(unixSeconds: number, format: AbsoluteDateFormat): string {
  const d = new Date(unixSeconds * 1000)
  if (format === 'iso') {
    const pad = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
