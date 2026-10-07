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

/** `t` of `a` blended with the rest of `b`, both `#rrggbb`; `b` when `a` is malformed. */
export function blendHex(a: string, b: string, t: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return b
  const ch = (h: string, i: number): number => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16)
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) * t + ch(b, i) * (1 - t)).toString(16).padStart(2, '0')).join('')}`
}
