// Rebuild the app icon artwork: the ten PNGs in resources/app-icons/, plus the copies of the
// default icon the bundle, installer and favicon use (resources/icon.png, build/icon.png,
// build/icon.icns, the renderer logo).
//
// Run: node_modules/.bin/electron scripts/generate-app-icons.cjs
//
// macOS only, on purpose. The art uses the system fonts Avenir Next, Didot and Menlo for the g,
// and the default-icon step uses sips and iconutil. Rendering is done by Electron, so there is
// no separate browser to install. The committed PNGs are the source of truth: regenerating them
// on a machine without those fonts would draw a different g.
//
// To add or reorder an icon, change APP_ICONS in src/shared/appIcons.ts, its name in the English
// dictionary, and the `icons` table at the bottom of this file. test/appIcons.test.ts checks
// that the three agree.
const { app, BrowserWindow } = require('electron')
const { writeFileSync, copyFileSync, mkdtempSync, mkdirSync } = require('node:fs')
const { execFileSync } = require('node:child_process')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const ROOT = join(__dirname, '..')
const DEFAULT_ICON = 'monoline'
let win
// Runs a function in the offscreen page, with the same shape as Playwright's page.evaluate.
const page = { evaluate: (fn, arg) => win.webContents.executeJavaScript(`(${fn.toString()})(${JSON.stringify(arg)})`) }

const f = (n) => Math.round(n * 100) / 100
const rad = (d) => (d * Math.PI) / 180

// ---------- glyph measuring: every g is optically centred; rot is applied around (cx, cy) ----------
async function G({ font, weight, size, cx = 512, cy = 512, rot = 0 }) {
  const m = await page.evaluate(
    ([font, weight, size]) => {
      const c = document.createElement('canvas').getContext('2d')
      c.font = `${weight} ${size}px "${font}"`
      const t = c.measureText('g')
      return { l: t.actualBoundingBoxLeft, r: t.actualBoundingBoxRight, a: t.actualBoundingBoxAscent, d: t.actualBoundingBoxDescent }
    },
    [font, weight, size]
  )
  const x = cx - (m.r - m.l) / 2
  const y = cy - (m.d - m.a) / 2
  const attrs = `font-family="${font}" font-weight="${weight}" font-size="${size}"`
  const tf = (pre = '') => {
    const t = `${pre} ${rot ? `rotate(${rot} ${cx} ${cy})` : ''}`.trim()
    return t ? `transform="${t}"` : ''
  }
  return {
    x, y, font, weight, size, cx, cy, rot,
    top: y - m.a, bottom: y + m.d, left: x - m.l, right: x + m.r, h: m.a + m.d, w: m.l + m.r,
    text: (extra = '', pre = '') => `<text x="${f(x)}" y="${f(y)}" ${attrs} ${extra} ${tf(pre)}>g</text>`
  }
}

// ---------- shell ----------
const BODY = { x: 100, y: 100, w: 824, h: 824, rx: 188 }
const GRAIN = (id, op = 0.18, freq = 1.2, seed = 7) => `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" seed="${seed}"/><feColorMatrix type="matrix" values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 ${op} 0"/></filter>`
const blur = (id, s) => `<filter id="${id}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${s}"/></filter>`
const UMASK = `maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"`

function shell({ base = '#000', defs = '', bg = '', inner = '', over = '' }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
<defs>
  <clipPath id="body"><rect x="${BODY.x}" y="${BODY.y}" width="${BODY.w}" height="${BODY.h}" rx="${BODY.rx}"/></clipPath>
  <filter id="drop" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="16" stdDeviation="16" flood-color="#000" flood-opacity=".38"/></filter>
  ${defs}
</defs>
<g filter="url(#drop)"><rect x="${BODY.x}" y="${BODY.y}" width="${BODY.w}" height="${BODY.h}" rx="${BODY.rx}" fill="${base}"/></g>
<g clip-path="url(#body)">${bg}${inner}${over}</g>
</svg>`
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * Math.min(1, Math.max(0, t))))
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647) }
function stars(n, seed, rMax = 2.2) {
  const rnd = rng(seed)
  let out = ''
  for (let i = 0; i < n; i++) out += `<circle cx="${f(100 + rnd() * 824)}" cy="${f(100 + rnd() * 824)}" r="${f(0.6 + rnd() * rMax)}" fill="#fff" opacity="${f(0.25 + rnd() * 0.6)}"/>`
  return out
}
// Shared monoline geometry: bowl ring, stem and a hooked tail.
const MC = { x: 448, y: 452 }, MR = 150, MSX = MC.x + MR
const hookPath = `M${MSX} ${MC.y - MR} L${MSX} ${MC.y + MR + 70} C${MSX} ${MC.y + MR + 170} ${MSX - 100} ${MC.y + MR + 214} ${MSX - 224} ${MC.y + MR + 176}`
const hookTip = { x: MSX - 224, y: MC.y + MR + 176 }

// =====================================================================
// THE CHOSEN
// =====================================================================

// Portal: the g is a window cut into a pale slab; colour exists only behind it.
async function portal() {
  const g = await G({ font: 'Avenir Next', weight: 800, size: 900, cx: 520, cy: 505 })
  return shell({
    base: '#e9e7e0',
    defs: `
      <mask id="cut" ${UMASK}><rect width="1024" height="1024" fill="#fff"/>${g.text('fill="#000"')}</mask>
      <clipPath id="tclip">${g.text()}</clipPath>
      <filter id="b16" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="16"/></filter>
      <mask id="shiftm" ${UMASK}><rect width="1024" height="1024" fill="#fff"/><g filter="url(#b16)">${g.text('fill="#000"', 'translate(20 28)')}</g></mask>
      ${blur('b70', 70)}
      <linearGradient id="slab" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6f4ee"/><stop offset="1" stop-color="#dcd9d0"/></linearGradient>
      ${GRAIN('grain', 0.2)}`,
    inner: `
      <g clip-path="url(#tclip)">
        <rect width="1024" height="1024" fill="#150d2e"/>
        <g filter="url(#b70)">
          <circle cx="360" cy="360" r="250" fill="#ff5a36"/><circle cx="700" cy="400" r="250" fill="#ff2e93"/>
          <circle cx="470" cy="740" r="290" fill="#3b5bff"/><circle cx="740" cy="760" r="190" fill="#00d1ff"/>
        </g>
        <rect width="1024" height="1024" fill="#000" opacity=".5" mask="url(#shiftm)"/>
      </g>
      <rect width="1024" height="1024" fill="url(#slab)" mask="url(#cut)"/>
      <rect width="1024" height="1024" filter="url(#grain)" mask="url(#cut)"/>`
  })
}

// Night slab: graphite plate, tilted g, a sunrise glowing through it, a hairline rim.
async function nightSlab() {
  const g = await G({ font: 'Avenir Next', weight: 800, size: 900, cx: 512, cy: 505, rot: -8 })
  return shell({
    base: '#151922',
    defs: `
      <mask id="cut" ${UMASK}><rect width="1024" height="1024" fill="#fff"/>${g.text('fill="#000"')}</mask>
      <clipPath id="tclip">${g.text()}</clipPath>
      <filter id="b16" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="16"/></filter>
      <mask id="shiftm" ${UMASK}><rect width="1024" height="1024" fill="#fff"/><g filter="url(#b16)">${g.text('fill="#000"', 'translate(20 28)')}</g></mask>
      ${blur('b70', 70)}${GRAIN('grain', 0.22, 0.9)}
      <linearGradient id="slab" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2d3445"/><stop offset="1" stop-color="#12161f"/></linearGradient>`,
    inner: `
      <g clip-path="url(#tclip)">
        <rect width="1024" height="1024" fill="#07142a"/>
        <g filter="url(#b70)"><circle cx="360" cy="780" r="300" fill="#2fa8ff"/><circle cx="700" cy="720" r="280" fill="#2f4bff"/>
          <circle cx="520" cy="300" r="300" fill="#8f4dff"/><circle cx="800" cy="300" r="220" fill="#ff4fa8"/></g>
        <rect width="1024" height="1024" fill="#000" opacity=".35" mask="url(#shiftm)"/>
      </g>
      <rect width="1024" height="1024" fill="url(#slab)" mask="url(#cut)"/>
      <rect width="1024" height="1024" filter="url(#grain)" mask="url(#cut)"/>
      ${g.text('fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="3"')}`
  })
}

// Monoline: one hairline g with a single glowing commit at the tail.
async function monoline() {
  return shell({
    base: '#0c0d11',
    defs: `<radialGradient id="bg" cx=".5" cy=".38" r=".8"><stop offset="0" stop-color="#1b1d27"/><stop offset="1" stop-color="#090a0d"/></radialGradient>
      <linearGradient id="line" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#8fb8ff"/></linearGradient>
      <radialGradient id="halo"><stop offset="0" stop-color="#ff7a3d" stop-opacity=".9"/><stop offset="1" stop-color="#ff7a3d" stop-opacity="0"/></radialGradient>
      ${blur('soft', 6)}`,
    bg: `<rect width="1024" height="1024" fill="url(#bg)"/>`,
    inner: `<g transform="translate(512 512) scale(1.12) translate(-512 -512) translate(58 -44)">
      <circle cx="${MC.x}" cy="${MC.y}" r="${MR + 62}" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="2"/>
      <g fill="none" stroke="url(#line)" stroke-width="26" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="${MC.x}" cy="${MC.y}" r="${MR}" opacity=".35" filter="url(#soft)"/><path d="${hookPath}" opacity=".35" filter="url(#soft)"/>
        <circle cx="${MC.x}" cy="${MC.y}" r="${MR}"/><path d="${hookPath}"/>
      </g>
      <circle cx="${hookTip.x}" cy="${hookTip.y}" r="92" fill="url(#halo)"/>
      <circle cx="${hookTip.x}" cy="${hookTip.y}" r="34" fill="#0c0d11"/><circle cx="${hookTip.x}" cy="${hookTip.y}" r="22" fill="#ff7a3d"/>
    </g>`
  })
}

// Deboss: a serif g pressed into its own surface, tone on tone.
async function deboss() {
  const g = await G({ font: 'Didot', weight: 700, size: 900, cx: 512, cy: 505 })
  return shell({
    base: '#1c1d22',
    defs: `<linearGradient id="surf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2c33"/><stop offset="1" stop-color="#17181c"/></linearGradient>
      <filter id="inner" x="-10%" y="-10%" width="120%" height="120%">
        <feFlood flood-color="#000" flood-opacity=".85" result="c"/><feComposite in="c" in2="SourceAlpha" operator="out" result="inv"/>
        <feGaussianBlur in="inv" stdDeviation="13" result="bl"/><feOffset in="bl" dx="13" dy="17" result="of"/>
        <feComposite in="of" in2="SourceAlpha" operator="in" result="sh"/>
        <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="sh"/></feMerge>
      </filter>
      ${blur('lip', 1.6)}${GRAIN('grain', 0.16, 0.9)}`,
    bg: `<rect width="1024" height="1024" fill="url(#surf)"/><rect width="1024" height="1024" filter="url(#grain)"/>`,
    inner: `${g.text('fill="#fff" opacity=".11" filter="url(#lip)"', 'translate(4 6)')}${g.text('fill="#202228" filter="url(#inner)"')}`
  })
}

// =====================================================================
// THE FIVE NEW: each a different material or idea from the five above
// =====================================================================

// Terminal: a pixel g with a blinking cursor, glowing like phosphor on a CRT.
async function terminal() {
  // Sample a real monospace g into an LED grid, so the hook and proportions are a true g, not a "9".
  const cell = 23, gap = 3.5
  const bm = await page.evaluate(([cell]) => {
    const c = document.createElement('canvas'); c.width = c.height = 1200
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx.font = '400 640px Menlo'; ctx.fillStyle = '#000'; ctx.fillText('g', 250, 800)
    const m = ctx.measureText('g')
    const left = 250 - m.actualBoundingBoxLeft, top = 800 - m.actualBoundingBoxAscent
    const w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight, h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent
    const cols = Math.round(w / cell), rows = Math.round(h / cell)
    const sx = w / cols, sy = h / rows
    const d = ctx.getImageData(0, 0, 1200, 1200).data
    const bits = []
    for (let j = 0; j < rows; j++) { bits[j] = ''; for (let i = 0; i < cols; i++) {
      let a = 0, n = 0
      for (let yy = 0; yy < 6; yy++) for (let xx = 0; xx < 6; xx++) { const px = Math.floor(left + (i + (xx + 0.5) / 6) * sx), py = Math.floor(top + (j + (yy + 0.5) / 6) * sy); a += d[(py * 1200 + px) * 4 + 3]; n++ }
      bits[j] += a / n / 255 > 0.5 ? 'X' : '.'
    } }
    return { cols, rows, bits, baselineRow: Math.round(m.actualBoundingBoxAscent / sy) }
  }, [cell])
  const cursorCols = Math.round(bm.cols * 0.62), gapCols = 1
  const totalCols = bm.cols + gapCols + cursorCols
  const ox = 512 - (totalCols * cell) / 2, oy = 512 - (bm.rows * cell) / 2
  let px = ''
  const rect = (i, j) => `<rect x="${f(ox + i * cell)}" y="${f(oy + j * cell)}" width="${cell - gap}" height="${cell - gap}" rx="6"/>`
  bm.bits.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === 'X') px += rect(i, j) }))
  let cursor = ''
  for (let j = bm.baselineRow; j < bm.baselineRow + 2; j++) for (let i = 0; i < cursorCols; i++) cursor += rect(bm.cols + gapCols + i, j)
  return shell({
    base: '#030b1c',
    defs: `<radialGradient id="bg" cx=".5" cy=".45" r=".8"><stop offset="0" stop-color="#0d2a66"/><stop offset=".7" stop-color="#040f26"/><stop offset="1" stop-color="#010510"/></radialGradient>
      <linearGradient id="px" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eaf5ff"/><stop offset="1" stop-color="#4f9bff"/></linearGradient>
      <pattern id="scan" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="2.6" fill="#000" opacity=".28"/></pattern>
      ${blur('g1', 12)}${blur('g2', 30)}${GRAIN('grain', 0.12, 1.4)}
      <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <radialGradient id="vig" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".6"/></radialGradient>`,
    bg: `<rect width="1024" height="1024" fill="url(#bg)"/>`,
    inner: `<g fill="#2f6bff" filter="url(#g2)" opacity=".85">${px}${cursor}</g>
      <g fill="#7ab8ff" filter="url(#g1)" opacity=".9">${px}${cursor}</g>
      <g fill="url(#px)">${px}</g><g fill="#d6eaff">${cursor}</g>`,
    over: `<rect width="1024" height="1024" fill="url(#scan)"/><rect width="1024" height="1024" filter="url(#grain)"/>
      <rect width="1024" height="1024" fill="url(#gloss)"/><rect width="1024" height="1024" fill="url(#vig)"/>`
  })
}

// Crystal: the g is faceted like a cut gem, every facet catching the light differently.
async function crystal() {
  const g = await G({ font: 'Avenir Next', weight: 800, size: 900, cx: 512, cy: 505, rot: -6 })
  const rnd = rng(42), cellSize = 62, cols = 18, rowsN = 18
  const V = []
  for (let j = 0; j <= rowsN; j++) { V[j] = []; for (let i = 0; i <= cols; i++) V[j][i] = [60 + i * cellSize + (rnd() - 0.5) * 36, 60 + j * cellSize + (rnd() - 0.5) * 36] }
  const pal = [hex('#38e1ff'), hex('#7b5cff'), hex('#ff4fa8')]
  const colorAt = (x, y, shade) => {
    const t = Math.min(1, Math.max(0, (x + y - 300) / 1100))
    const c = t < 0.5 ? mix(pal[0], pal[1], t * 2) : mix(pal[1], pal[2], (t - 0.5) * 2)
    return rgb(c.map((v) => Math.max(0, Math.min(255, Math.round(v * shade)))))
  }
  let tris = ''
  for (let j = 0; j < rowsN; j++) for (let i = 0; i < cols; i++) {
    const a = V[j][i], b = V[j][i + 1], c = V[j + 1][i + 1], d = V[j + 1][i]
    const quads = (i + j) % 2 ? [[a, b, d], [b, c, d]] : [[a, b, c], [a, c, d]]
    quads.forEach((t, k) => {
      const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3
      const shade = 0.66 + rnd() * 0.5 + (k ? -0.06 : 0.08)
      tris += `<polygon points="${t.map((p) => f(p[0]) + ',' + f(p[1])).join(' ')}" fill="${colorAt(cx, cy, shade)}" stroke="#fff" stroke-opacity=".16" stroke-width="1.4" stroke-linejoin="round"/>`
    })
  }
  return shell({
    base: '#0b0a1c',
    defs: `<radialGradient id="bg" cx=".5" cy=".4" r=".9"><stop offset="0" stop-color="#241552"/><stop offset="1" stop-color="#080716"/></radialGradient>
      <clipPath id="tclip">${g.text()}</clipPath>${blur('b30', 30)}
      <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>`,
    bg: `<rect width="1024" height="1024" fill="url(#bg)"/>${stars(30, 9, 1.4)}`,
    inner: `${g.text('fill="#7b5cff" opacity=".55" filter="url(#b30)"', 'translate(0 24)')}
      <g clip-path="url(#tclip)">${tris}<rect width="1024" height="1024" fill="url(#sheen)"/></g>
      ${g.text('fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="3"')}`
  })
}

// Mercury: a drop of liquid metal that pinches off copies of itself. Geminio = duplication.
async function mercury() {
  const pts = []
  for (let a = -90; a <= 270; a += 2) pts.push([MC.x + MR * Math.cos(rad(a)), MC.y + MR * Math.sin(rad(a)), 31])
  const ringEnd = pts.length
  for (let y = MC.y - MR; y <= MC.y + MR + 70; y += 3) pts.push([MSX, y, 27])
  const bz = (t) => {
    const p0 = [MSX, MC.y + MR + 70], p1 = [MSX, MC.y + MR + 170], p2 = [MSX - 100, MC.y + MR + 214], p3 = [hookTip.x, hookTip.y], u = 1 - t
    return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]
  }
  for (let t = 0; t <= 1; t += 0.012) { const p = bz(t); pts.push([p[0], p[1], 27 - 6 * t]) }
  const spaced = []
  let last = null
  for (const p of pts) { if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= 11) { spaced.push(p); last = p } }
  const drops = [[hookTip.x - 62, hookTip.y + 14, 22], [hookTip.x - 128, hookTip.y + 32, 15], [hookTip.x - 178, hookTip.y + 48, 9]]
  const circles = spaced.map((p) => `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${p[2]}"/>`).join('') + drops.map((d) => `<circle cx="${d[0]}" cy="${d[1]}" r="${d[2]}"/>`).join('')
  void ringEnd
  return shell({
    base: '#0a0d16',
    defs: `<radialGradient id="bg" cx=".5" cy=".35" r=".95"><stop offset="0" stop-color="#1b2438"/><stop offset="1" stop-color="#070910"/></radialGradient>
      <filter id="goo" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceGraphic" stdDeviation="8" result="b"/><feColorMatrix in="b" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10"/></filter>
      <filter id="shine" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="7" result="a"/>
        <feSpecularLighting in="a" surfaceScale="9" specularConstant="1.2" specularExponent="24" lighting-color="#fff" result="sp"><feDistantLight azimuth="230" elevation="50"/></feSpecularLighting>
        <feComposite in="sp" in2="SourceAlpha" operator="in" result="spc"/>
        <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="spc"/></feMerge>
      </filter>
      <linearGradient id="metal" gradientUnits="userSpaceOnUse" x1="300" y1="290" x2="640" y2="830">
        <stop offset="0" stop-color="#f1f5ff"/><stop offset=".3" stop-color="#8f9cc0"/><stop offset=".48" stop-color="#1b2234"/>
        <stop offset=".6" stop-color="#b8c6e8"/><stop offset=".82" stop-color="#5a6685"/><stop offset="1" stop-color="#e8eeff"/></linearGradient>
      ${blur('glowb', 30)}`,
    bg: `<rect width="1024" height="1024" fill="url(#bg)"/>`,
    inner: `<g transform="translate(57 -50)">
      <g filter="url(#glowb)" opacity=".7"><g filter="url(#goo)" fill="#2fb4ff" transform="translate(-14 12)">${circles}</g></g>
      <g filter="url(#glowb)" opacity=".55"><g filter="url(#goo)" fill="#ff4fa8" transform="translate(16 14)">${circles}</g></g>
      <g filter="url(#shine)"><g filter="url(#goo)" fill="url(#metal)">${circles}</g></g>
    </g>`
  })
}

// Blueprint: the g as a technical drawing, with construction circles, guides and dimensions.
async function blueprint() {
  const g = await G({ font: 'Avenir Next', weight: 800, size: 760, cx: 512, cy: 505 })
  const baseline = g.y, xTop = g.top, desc = g.bottom
  const bowlR = (baseline - xTop) / 2, bowlC = { x: g.left + bowlR, y: (xTop + baseline) / 2 }
  const dimX = g.right + 56
  const arrow = (x1, y1, x2, y2) => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="#fff" stroke-opacity=".75" stroke-width="2" marker-start="url(#ar)" marker-end="url(#ar)"/>`
  return shell({
    base: '#133a96',
    defs: `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2058c4"/><stop offset="1" stop-color="#0c2a78"/></linearGradient>
      <pattern id="minor" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#fff" stroke-opacity=".07" stroke-width="1"/></pattern>
      <pattern id="major" width="96" height="96" patternUnits="userSpaceOnUse"><path d="M96 0H0V96" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="1.4"/></pattern>
      <filter id="olw" filterUnits="userSpaceOnUse" x="-200" y="-200" width="1500" height="1500"><feMorphology in="SourceAlpha" operator="erode" radius="2.4" result="e"/><feComposite in="SourceAlpha" in2="e" operator="out" result="o"/><feFlood flood-color="#fff"/><feComposite in2="o" operator="in"/></filter>
      <marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0 1L9 5L0 9" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="1.6"/></marker>
      ${GRAIN('grain', 0.12, 0.9)}`,
    bg: `<rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#minor)"/><rect width="1024" height="1024" fill="url(#major)"/>`,
    inner: `<g stroke="#fff" fill="none" stroke-linecap="round">
        <g stroke-opacity=".42" stroke-width="1.6" stroke-dasharray="12 8">
          <line x1="130" y1="${f(xTop)}" x2="894" y2="${f(xTop)}"/><line x1="130" y1="${f(baseline)}" x2="894" y2="${f(baseline)}"/><line x1="130" y1="${f(desc)}" x2="894" y2="${f(desc)}"/>
          <line x1="${f(g.right)}" y1="130" x2="${f(g.right)}" y2="894"/><line x1="${f(g.left)}" y1="130" x2="${f(g.left)}" y2="894"/>
          <circle cx="${f(bowlC.x)}" cy="${f(bowlC.y)}" r="${f(bowlR)}"/><circle cx="${f(bowlC.x)}" cy="${f(bowlC.y)}" r="${f(bowlR * 0.5)}"/>
        </g>
        <g stroke-opacity=".5" stroke-width="1.6"><line x1="${f(bowlC.x - 34)}" y1="${f(bowlC.y)}" x2="${f(bowlC.x + 34)}" y2="${f(bowlC.y)}"/><line x1="${f(bowlC.x)}" y1="${f(bowlC.y - 34)}" x2="${f(bowlC.x)}" y2="${f(bowlC.y + 34)}"/></g>
      </g>
      ${g.text('fill="#fff" opacity=".1"')}
      ${g.text('fill="#fff" filter="url(#olw)"')}
      ${arrow(dimX, xTop, dimX, desc)}
      <g stroke="#fff" stroke-opacity=".75" stroke-width="2"><line x1="${f(dimX - 14)}" y1="${f(xTop)}" x2="${f(dimX + 14)}" y2="${f(xTop)}"/><line x1="${f(dimX - 14)}" y1="${f(desc)}" x2="${f(dimX + 14)}" y2="${f(desc)}"/></g>
      ${arrow(g.left, desc + 52, g.right, desc + 52)}
      <g fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.6"><rect x="690" y="806" width="190" height="60" rx="4"/><line x1="690" y1="826" x2="880" y2="826"/><line x1="770" y1="806" x2="770" y2="866"/>
        <line x1="700" y1="846" x2="750" y2="846"/><line x1="784" y1="846" x2="866" y2="846"/></g>`,
    over: `<rect width="1024" height="1024" filter="url(#grain)"/>`
  })
}

// Topo: a contour map where the g is the summit. Calm, cartographic, and the lines wobble like terrain.
async function topo() {
  const g = await G({ font: 'Avenir Next', weight: 800, size: 560, cx: 512, cy: 505 })
  const n = 15
  let lines = ''
  for (let i = n; i >= 1; i--) {
    const d = 15 * Math.pow(i, 1.12)
    const t = i / n
    const col = rgb(mix(hex('#e9ecff'), hex('#5560b8'), Math.pow(t, 0.7)))
    lines += g.text(`fill="${col}" stroke="${col}" stroke-width="${f(d * 2)}" stroke-linejoin="round"`)
    lines += g.text(`fill="#12163a" stroke="#12163a" stroke-width="${f(d * 2 - 5)}" stroke-linejoin="round"`)
  }
  return shell({
    base: '#12163a',
    defs: `<radialGradient id="bg" cx=".5" cy=".42" r=".85"><stop offset="0" stop-color="#1c2260"/><stop offset="1" stop-color="#0b0e2a"/></radialGradient>
      <filter id="warp" filterUnits="userSpaceOnUse" x="-100" y="-100" width="1224" height="1224"><feTurbulence type="fractalNoise" baseFrequency="0.0048 0.006" numOctaves="2" seed="11" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="78" xChannelSelector="R" yChannelSelector="G"/></filter>
      <linearGradient id="peak" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d3d9ff"/></linearGradient>
      <filter id="lift" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#000" flood-opacity=".5"/></filter>`,
    bg: `<rect width="1024" height="1024" fill="url(#bg)"/>`,
    inner: `<g filter="url(#warp)">${lines}</g><g filter="url(#lift)">${g.text('fill="url(#peak)"')}</g>`
  })
}

// Water: a clear drop shaped like a g, resting on a sunlit pool. Light bends through it and ripples spread out.
// Caustics are thin iso-contours of noise (a web of light, not blobs); ripples are rounded iso-contours of a blur.
const peakTable = (n, centers, half) => Array.from({ length: n + 1 }, (_, i) => f(Math.max(0, ...centers.map((c) => 1 - Math.abs(i - c) / half)))).join(' ')
async function water() {
  const g = await G({ font: 'Avenir Next', weight: 800, size: 860, cx: 512, cy: 505, rot: -4 })
  const caus = (id, seed, freq) => `<filter id="${id}" filterUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
    <feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" seed="${seed}"/>
    <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1 0 0 0 0"/>
    <feComponentTransfer><feFuncA type="table" tableValues="${peakTable(40, [16, 23], 1.6)}"/></feComponentTransfer>
    <feGaussianBlur stdDeviation="1"/></filter>`
  const ripple = (id, sigma, thick) => {
    const half = Math.max(1.5, ((thick * 0.37) / sigma) / 0.005)
    return `<filter id="${id}" filterUnits="userSpaceOnUse" x="-300" y="-300" width="1624" height="1624">
      <feGaussianBlur in="SourceAlpha" stdDeviation="${sigma}"/>
      <feComponentTransfer><feFuncA type="table" tableValues="${peakTable(200, [70], half)}"/></feComponentTransfer>
      <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0"/></filter>`
  }
  const drop = (x, y, r) => `<ellipse cx="${x + r * 0.35}" cy="${y + r * 1.15}" rx="${r * 1.1}" ry="${r * 0.55}" fill="#06306e" opacity=".3" filter="url(#b8)"/>
    <circle cx="${x}" cy="${y}" r="${r}" fill="url(#dropfill)" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>
    <ellipse cx="${x - r * 0.35}" cy="${y - r * 0.4}" rx="${r * 0.3}" ry="${r * 0.18}" fill="#fff" opacity=".9" transform="rotate(-35 ${x - r * 0.35} ${y - r * 0.4})"/>`
  return shell({
    base: '#2a7fe6',
    defs: `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fdcff"/><stop offset=".55" stop-color="#2f8df0"/><stop offset="1" stop-color="#1450cc"/></linearGradient>
      <radialGradient id="light" cx=".25" cy=".12" r=".85"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      ${caus('causA', 5, '0.0085 0.0115')}${caus('causB', 21, '0.017 0.021')}
      <clipPath id="tclip">${g.text()}</clipPath>
      <clipPath id="under">${g.text('', 'translate(34 52)')}</clipPath>
      <filter id="spec" filterUnits="userSpaceOnUse" x="-100" y="-100" width="1224" height="1224">
        <feGaussianBlur in="SourceAlpha" stdDeviation="9" result="a"/>
        <feSpecularLighting in="a" surfaceScale="12" specularConstant="1.3" specularExponent="36" lighting-color="#fff" result="s"><feDistantLight azimuth="225" elevation="42"/></feSpecularLighting>
        <feComposite in="s" in2="SourceAlpha" operator="in"/></filter>
      <radialGradient id="dropfill" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset=".6" stop-color="#7cc4ff" stop-opacity=".25"/><stop offset="1" stop-color="#0a4ab8" stop-opacity=".55"/></radialGradient>
      <linearGradient id="shade" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#05358f" stop-opacity=".5"/></linearGradient>
      ${blur('b8', 8)}${blur('b14', 14)}${blur('b6', 6)}${ripple('r1', 70, 4.5)}${ripple('r2', 130, 4.5)}${ripple('r3', 200, 4.5)}`,
    bg: `<rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#light)"/>
      <rect width="1024" height="1024" filter="url(#causA)" opacity=".5"/><rect width="1024" height="1024" filter="url(#causB)" opacity=".28"/>`,
    inner: `${g.text('fill="#05358f" opacity=".4" filter="url(#b14)"', 'translate(18 34)')}
      <g clip-path="url(#under)"><rect width="1024" height="1024" filter="url(#causA)" opacity="1"/><rect width="1024" height="1024" filter="url(#causB)" opacity=".8"/></g>
      <g opacity=".55">${g.text('fill="#000" filter="url(#r1)"')}</g><g opacity=".4">${g.text('fill="#000" filter="url(#r2)"')}</g><g opacity=".26">${g.text('fill="#000" filter="url(#r3)"')}</g>
      <g clip-path="url(#tclip)">
        <g transform="translate(512 512) scale(1.2) translate(-512 -512) translate(-14 -18)" filter="url(#b6)">
          <rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" filter="url(#causA)" opacity=".75"/></g>
        <rect width="1024" height="1024" fill="url(#shade)"/>
        ${g.text('fill="none" stroke="#04318a" stroke-opacity=".55" stroke-width="30" filter="url(#b6)"')}
      </g>
      ${g.text('fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="3"')}
      ${g.text('fill="#000" filter="url(#spec)"')}
      ${drop(822, 790, 30)}${drop(868, 706, 15)}${drop(196, 800, 22)}`
  })
}

// ---------- render ----------
const icons = [
  ['monoline', monoline],
  ['portal', portal],
  ['deboss', deboss],
  ['night-slab', nightSlab],
  ['terminal', terminal],
  ['crystal', crystal],
  ['topo', topo],
  ['water', water],
  ['mercury', mercury],
  ['blueprint', blueprint]
]

async function render(svg) {
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<style>html,body{margin:0;background:transparent;overflow:hidden}</style>${svg}`)}`)
  await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  const image = await win.webContents.capturePage()
  const { width } = image.getSize()
  return (width === 1024 ? image : image.resize({ width: 1024, height: 1024, quality: 'best' })).toPNG()
}

// The bundle icon: an .icns assembled from the default artwork with the tools macOS ships.
function buildIcns(source, destination) {
  const set = join(mkdtempSync(join(tmpdir(), 'geminio-iconset-')), 'icon.iconset')
  mkdirSync(set)
  for (const size of [16, 32, 128, 256, 512]) {
    execFileSync('/usr/bin/sips', ['-z', String(size), String(size), source, '--out', join(set, `icon_${size}x${size}.png`)], { stdio: 'ignore' })
    execFileSync('/usr/bin/sips', ['-z', String(size * 2), String(size * 2), source, '--out', join(set, `icon_${size}x${size}@2x.png`)], { stdio: 'ignore' })
  }
  execFileSync('/usr/bin/iconutil', ['-c', 'icns', set, '-o', destination])
}

app.whenReady().then(async () => {
  win = new BrowserWindow({ width: 1024, height: 1024, useContentSize: true, show: false, transparent: true, frame: false, webPreferences: { offscreen: true, backgroundThrottling: false } })
  await win.loadURL('about:blank')
  const dir = join(ROOT, 'resources/app-icons')
  mkdirSync(dir, { recursive: true })
  for (const [id, draw] of icons) {
    writeFileSync(join(dir, `${id}.png`), await render(await draw()))
    console.log(`  ✓ resources/app-icons/${id}.png`)
  }
  const source = join(dir, `${DEFAULT_ICON}.png`)
  for (const copy of ['resources/icon.png', 'build/icon.png', 'src/renderer/src/assets/logo.png']) copyFileSync(source, join(ROOT, copy))
  buildIcns(source, join(ROOT, 'build/icon.icns'))
  console.log('  ✓ default icon copies and build/icon.icns')
  win.destroy()
  app.quit()
}).catch((error) => { console.error(error); app.exit(1) })
