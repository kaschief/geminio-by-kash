/**
 * Near-black or white text, whichever reads better on a `#rgb` / `#rrggbb`
 * fill (perceived sRGB luminance). Anything unparseable gets white, the
 * answer for every built-in dark fill.
 */
export function contrastText(fill: string): string {
  const h = fill.trim().replace('#', '')
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6)
  if (!/^[0-9a-f]{6}$/i.test(full)) return '#fff'
  const n = parseInt(full, 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.6 ? '#10121a' : '#fff'
}
