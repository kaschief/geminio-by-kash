// Rebuild the app icon artwork: the twenty PNGs in resources/app-icons/, plus the copies of the
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
const FRAME = 'translate(512 512) scale(1.12) translate(-512 -512) translate(58 -44)'
const onRing = (deg) => [MC.x + MR * Math.cos(rad(deg)), MC.y + MR * Math.sin(rad(deg))]

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
    inner: `<g transform="${FRAME}">
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

// =====================================================================
// ROUND TWO: ten more, each a material or idea the first ten do not use
// =====================================================================

// Neon: the monoline g bent from a glass tube, lit hot pink against a dark brick wall.
async function neon() {
  const tube = (attrs) => `<circle cx="${MC.x}" cy="${MC.y}" r="${MR}" ${attrs}/><path d="${hookPath}" ${attrs}/>`
  const ends = [[MSX, MC.y - MR], [hookTip.x, hookTip.y]]
  return shell({
    base: '#140b16',
    defs: `<linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26141f"/><stop offset="1" stop-color="#0e070d"/></linearGradient>
      <pattern id="brick" width="128" height="64" patternUnits="userSpaceOnUse"><path d="M0 .5H128M0 32.5H128M.5 0V32M64.5 32V64" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="5"/><path d="M0 3H128M0 35H128" stroke="#fff" stroke-opacity=".04" stroke-width="2"/></pattern>
      ${blur('b70', 70)}${blur('b26', 26)}${blur('b8', 8)}${blur('b3', 3)}${GRAIN('grain', 0.2, 0.9)}`,
    bg: `<rect width="1024" height="1024" fill="url(#wall)"/><rect width="1024" height="1024" fill="url(#brick)"/><rect width="1024" height="1024" filter="url(#grain)"/>`,
    inner: `<g transform="${FRAME}" fill="none" stroke-linecap="round">
      <g filter="url(#b70)" opacity=".7">${tube('stroke="#ff1f8e" stroke-width="120"')}</g>
      <g filter="url(#b26)" opacity=".9">${tube('stroke="#ff2f9b" stroke-width="54"')}</g>
      <g transform="translate(10 22)" filter="url(#b8)" opacity=".5">${tube('stroke="#000" stroke-width="30"')}</g>
      ${tube('stroke="#ff4fb0" stroke-width="30"')}
      <g filter="url(#b3)">${tube('stroke="#ffc2e4" stroke-width="13"')}</g>
      ${tube('stroke="#fff7fb" stroke-width="5"')}
      ${ends.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="21" fill="#2a1a24" stroke="#5c4452" stroke-width="3"/>`).join('')}
      ${[onRing(160), onRing(20), [MSX, MC.y + MR + 40]].map(([x, y]) => `<rect x="${f(x - 18)}" y="${f(y - 9)}" width="36" height="18" rx="5" fill="#3b2a34" stroke="#6d5562" stroke-width="2" opacity=".55"/>`).join('')}
    </g>`
  })
}

// Shapes: the g broken into bold flat geometry, Bauhaus style. The bowl is a disc, the stem a bar and the
// tail a quarter ring; it reads as a g from across the room and as a composition up close.
async function shapes() {
  const cx = 440, cy = 430, R = 170, sx = cx + R, bot = cy + R + 60, w = 96
  return shell({
    base: '#101a3c',
    defs: `<linearGradient id="navy" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b2a63"/><stop offset="1" stop-color="#0a1130"/></linearGradient>${GRAIN('grain', 0.16, 0.9, 3)}`,
    bg: `<rect width="1024" height="1024" fill="url(#navy)"/>
      <circle cx="830" cy="190" r="190" fill="#16245a"/><rect x="100" y="760" width="230" height="164" fill="#16245a"/>`,
    inner: `<g transform="translate(512 512) scale(1.12) translate(-464 -540)">
      <circle cx="${cx}" cy="${cy}" r="${R}" fill="#ff5a1f"/>
      <circle cx="${cx}" cy="${cy}" r="${R * 0.42}" fill="#101a3c"/>
      <path d="M${cx} ${cy - R} A${R} ${R} 0 0 1 ${sx} ${cy} L${cx} ${cy} Z" fill="#ffc21a"/>
      <path d="M${sx} ${bot} A${R} ${R} 0 0 1 ${sx - R} ${bot + R}" fill="none" stroke="#2fd1c4" stroke-width="${w}"/>
      <rect x="${sx - w / 2}" y="${cy - R}" width="${w}" height="${bot - cy + R}" fill="#ff2e88"/>
      <circle cx="${sx}" cy="${cy - R + w / 2}" r="${w / 2}" fill="#ffc21a"/>
      <circle cx="${sx - R}" cy="${bot + R}" r="30" fill="#fff"/></g>`,
    over: `<rect width="1024" height="1024" filter="url(#grain)"/>`
  })
}

// Circuit: the monoline g etched as a copper trace on a green circuit board, with vias, pads and a chip.
async function circuit() {
  const via = ([x, y], r = 22) => `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="url(#gold)" stroke="#5a3a08" stroke-width="3"/><circle cx="${f(x)}" cy="${f(y)}" r="${r * 0.42}" fill="#061d14"/>`
  const outer = MR + 58
  const side = (attrs) => `<path d="M${f(MC.x - outer * Math.cos(rad(40)))} ${f(MC.y - outer * Math.sin(rad(40)))} A${outer} ${outer} 0 0 0 ${f(MC.x + outer * Math.cos(rad(70)))} ${f(MC.y + outer * Math.sin(rad(70)))}" ${attrs}/>
    <path d="M${MSX + 58} ${MC.y - MR + 30} V${MC.y + MR + 40} L${MSX + 120} ${MC.y + MR + 100} H${MSX + 180}" ${attrs}/>
    <path d="M${MC.x - MR - 120} ${MC.y + 40} H${MC.x - MR - 40}" ${attrs}/>`
  return shell({
    base: '#0a3a28',
    defs: `<radialGradient id="mask" cx=".45" cy=".4" r=".9"><stop offset="0" stop-color="#16603f"/><stop offset="1" stop-color="#062517"/></radialGradient>
      <pattern id="fine" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="1.6" fill="#000" opacity=".25"/></pattern>
      <linearGradient id="copper" gradientUnits="userSpaceOnUse" x1="250" y1="250" x2="700" y2="850"><stop offset="0" stop-color="#ffd9a0"/><stop offset=".4" stop-color="#e08a3c"/><stop offset=".7" stop-color="#9a4f16"/><stop offset="1" stop-color="#f2b072"/></linearGradient>
      <radialGradient id="gold" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff2b0"/><stop offset=".6" stop-color="#d9a52c"/><stop offset="1" stop-color="#8a6010"/></radialGradient>
      <filter id="etch" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="#000" flood-opacity=".5"/></filter>
      ${GRAIN('grain', 0.18, 1, 8)}`,
    bg: `<rect width="1024" height="1024" fill="url(#mask)"/><rect width="1024" height="1024" fill="url(#fine)"/>
      <g fill="none" stroke="#2a8a5c" stroke-width="10" stroke-linecap="round" opacity=".55">
        <path d="M100 250 H260 L320 190 H520"/><path d="M924 330 H800 L740 390 V560"/><path d="M924 700 H820"/><path d="M100 820 H240 L300 760"/></g>`,
    inner: `<g transform="${FRAME}"><g filter="url(#etch)" fill="none" stroke-linecap="round" stroke-linejoin="round">
        ${side('stroke="#3d9b6c" stroke-width="12"')}
        <circle cx="${MC.x}" cy="${MC.y}" r="${MR}" stroke="#4a2408" stroke-width="44"/><path d="${hookPath}" stroke="#4a2408" stroke-width="44"/>
        <circle cx="${MC.x}" cy="${MC.y}" r="${MR}" stroke="url(#copper)" stroke-width="34"/><path d="${hookPath}" stroke="url(#copper)" stroke-width="34"/></g>
      ${via([MSX, MC.y - MR], 30)}${via([hookTip.x, hookTip.y], 30)}${via(onRing(180))}${via([MSX + 180, MC.y + MR + 100], 16)}${via([MC.x - MR - 120, MC.y + 40], 16)}
      <g transform="translate(${MC.x - 62} ${MC.y - 62})"><rect width="124" height="124" rx="8" fill="#15171c" stroke="#3a3d45" stroke-width="3"/>
        ${[22, 50, 78, 102].map((v) => `<rect x="${v - 6}" y="-14" width="12" height="14" fill="url(#gold)"/><rect x="${v - 6}" y="124" width="12" height="14" fill="url(#gold)"/>`).join('')}
        <circle cx="22" cy="22" r="7" fill="#2a2d34"/></g></g>`,
    over: `<rect width="1024" height="1024" filter="url(#grain)"/>`
  })
}

// Holo foil: the g stamped in holographic foil on black card, its rainbow shifting across the embossed surface.
async function holoFoil() {
  const g = await G({ font: 'Avenir Next', weight: 800, size: 760, cx: 512, cy: 500, rot: -4 })
  return shell({
    base: '#07070a',
    defs: `<radialGradient id="card" cx=".5" cy=".35" r=".9"><stop offset="0" stop-color="#1c1c24"/><stop offset="1" stop-color="#050507"/></radialGradient>
      ${GRAIN('grain', 0.22, 0.9, 4)}
      <linearGradient id="holo" gradientUnits="userSpaceOnUse" x1="250" y1="180" x2="780" y2="860">
        <stop offset="0" stop-color="#ff3cac"/><stop offset=".18" stop-color="#ffb13d"/><stop offset=".34" stop-color="#d4ff4a"/><stop offset=".5" stop-color="#2bffd5"/>
        <stop offset=".66" stop-color="#3d7bff"/><stop offset=".82" stop-color="#b44dff"/><stop offset="1" stop-color="#ff3cac"/></linearGradient>
      <filter id="foil" filterUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
        <feTurbulence type="fractalNoise" baseFrequency=".006 .02" numOctaves="2" seed="13" result="n"/>
        <feColorMatrix in="n" type="hueRotate" values="0" result="n2"/><feBlend in="SourceGraphic" in2="n2" mode="overlay" result="sh"/>
        <feGaussianBlur in="SourceAlpha" stdDeviation="6" result="a"/>
        <feSpecularLighting in="a" surfaceScale="8" specularConstant="1.2" specularExponent="30" lighting-color="#fff" result="sp"><feDistantLight azimuth="225" elevation="45"/></feSpecularLighting>
        <feComposite in="sh" in2="SourceAlpha" operator="in" result="c"/><feComposite in="sp" in2="SourceAlpha" operator="in" result="s"/>
        <feMerge><feMergeNode in="c"/><feMergeNode in="s"/></feMerge></filter>
      <clipPath id="tclip">${g.text()}</clipPath>
      <pattern id="lines" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)"><rect width="7" height="2" fill="#fff" opacity=".14"/></pattern>
      ${blur('b50', 50)}`,
    bg: `<rect width="1024" height="1024" fill="url(#card)"/><rect width="1024" height="1024" filter="url(#grain)"/>`,
    inner: `<g filter="url(#b50)" opacity=".45">${g.text('fill="url(#holo)"')}</g>
      ${g.text('fill="url(#holo)" filter="url(#foil)"')}
      <g clip-path="url(#tclip)"><rect width="1024" height="1024" fill="url(#lines)"/></g>
      ${g.text('fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2"')}`
  })
}

// Enamel pin: hard enamel inside a raised gold cloison, glossy, pinned to green felt.
async function enamelPin() {
  const g = await G({ font: 'Avenir Next', weight: 800, size: 700, cx: 512, cy: 500 })
  return shell({
    base: '#1d4636',
    defs: `<radialGradient id="felt" cx=".5" cy=".4" r=".8"><stop offset="0" stop-color="#2c6a50"/><stop offset="1" stop-color="#143327"/></radialGradient>
      ${GRAIN('fuzz', 0.4, 0.75, 12)}
      <linearGradient id="gold" gradientUnits="userSpaceOnUse" x1="260" y1="200" x2="760" y2="860"><stop offset="0" stop-color="#fff4b8"/><stop offset=".25" stop-color="#e2b23a"/><stop offset=".5" stop-color="#8c5c06"/><stop offset=".72" stop-color="#f6d777"/><stop offset="1" stop-color="#a6720f"/></linearGradient>
      <linearGradient id="enamel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5262"/><stop offset="1" stop-color="#c0142b"/></linearGradient>
      <linearGradient id="gloss" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".35" stop-color="#fff" stop-opacity=".05"/><stop offset=".36" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <clipPath id="tclip">${g.text()}</clipPath>
      <filter id="pinshadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="18" stdDeviation="14" flood-color="#04140d" flood-opacity=".6"/></filter>
      <filter id="metal" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur in="SourceAlpha" stdDeviation="4" result="a"/>
        <feSpecularLighting in="a" surfaceScale="6" specularConstant="1.1" specularExponent="28" lighting-color="#fffbe6" result="s"><feDistantLight azimuth="235" elevation="48"/></feSpecularLighting>
        <feComposite in="s" in2="SourceAlpha" operator="in" result="sc"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="sc"/></feMerge></filter>`,
    bg: `<rect width="1024" height="1024" fill="url(#felt)"/><rect width="1024" height="1024" filter="url(#fuzz)"/>`,
    inner: `<g filter="url(#pinshadow)"><g filter="url(#metal)">${g.text('fill="url(#gold)" stroke="url(#gold)" stroke-width="56" stroke-linejoin="round"')}</g></g>
      ${g.text('fill="url(#enamel)" stroke="#5a0610" stroke-opacity=".5" stroke-width="3"')}
      <g clip-path="url(#tclip)"><rect width="1024" height="1024" fill="url(#gloss)"/></g>`
  })
}

// Embroidered patch: a satin-stitched g on a twill patch with a merrow border, sewn onto denim.
async function patch() {
  const g = await G({ font: 'Avenir Next', weight: 800, size: 520, cx: 512, cy: 508 })
  const R = 318
  return shell({
    base: '#2a4a7a',
    defs: `<linearGradient id="denimbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a6fa8"/><stop offset="1" stop-color="#1d355e"/></linearGradient>
      <pattern id="twill" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(-38)"><rect width="10" height="10" fill="none"/><rect width="10" height="4" fill="#fff" opacity=".08"/></pattern>
      ${GRAIN('grain', 0.3, 0.8, 5)}
      <pattern id="satin" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(52)"><rect width="9" height="9" fill="#ff9f1c"/><rect width="9" height="3.2" fill="#ffd27a"/><rect y="6.4" width="9" height="1.4" fill="#c86a00" opacity=".7"/></pattern>
      <pattern id="cloth" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#f3ead6"/><path d="M0 6L6 0" stroke="#d6c9ab" stroke-width="1.6"/></pattern>
      <filter id="sewn" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="9" flood-color="#06152e" flood-opacity=".55"/></filter>
      <filter id="puff" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur in="SourceAlpha" stdDeviation="5" result="a"/>
        <feDiffuseLighting in="a" surfaceScale="5" diffuseConstant="1.05" lighting-color="#fff" result="d"><feDistantLight azimuth="235" elevation="55"/></feDiffuseLighting>
        <feComposite in="SourceGraphic" in2="d" operator="arithmetic" k1="1.15" k2="0" k3="0" k4="0" result="lit"/><feComposite in="lit" in2="SourceAlpha" operator="in"/></filter>`,
    bg: `<rect width="1024" height="1024" fill="url(#denimbg)"/><rect width="1024" height="1024" fill="url(#twill)"/><rect width="1024" height="1024" filter="url(#grain)"/>
      <path d="M100 180 Q520 230 924 170" fill="none" stroke="#f0b14a" stroke-width="3" stroke-dasharray="14 9" opacity=".7"/>`,
    inner: `<g filter="url(#sewn)"><circle cx="512" cy="512" r="${R}" fill="url(#cloth)"/>
        <g filter="url(#puff)"><circle cx="512" cy="512" r="${R - 14}" fill="none" stroke="#1d3d6e" stroke-width="40"/></g>
        <circle cx="512" cy="512" r="${R - 14}" fill="none" stroke="#5f86c4" stroke-width="40" stroke-dasharray="3 5" opacity=".55"/></g>
      <circle cx="512" cy="512" r="${R - 52}" fill="none" stroke="#c9b892" stroke-width="3" stroke-dasharray="10 8"/>
      <g filter="url(#puff)">${g.text('fill="url(#satin)" stroke="#7a3b00" stroke-width="6" stroke-linejoin="round"')}</g>`
  })
}

// Extruded: a solid g block with a long flat shadow, a pure geometric take in sunny colours.
async function extruded() {
  const g = await G({ font: 'Avenir Next', weight: 800, size: 640, cx: 470, cy: 470 })
  let shadow = '', side = ''
  for (let i = 300; i > 0; i -= 3) shadow += g.text('fill="#0b7d73"', `translate(${i} ${i})`)
  for (let i = 44; i > 0; i -= 1) side += g.text(`fill="${rgb(mix(hex('#c2410c'), hex('#7c2d12'), i / 44))}"`, `translate(${i * 0.8} ${i})`)
  return shell({
    base: '#0fb5a6',
    defs: `<linearGradient id="sea" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2dd4bf"/><stop offset="1" stop-color="#0e9488"/></linearGradient>
      <linearGradient id="face" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe680"/><stop offset="1" stop-color="#ffb21a"/></linearGradient>
      <linearGradient id="fade" x1="0" y1="0" x2="1" y2="1"><stop offset=".3" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <mask id="fadem" ${UMASK}><rect width="1024" height="1024" fill="url(#fade)"/></mask>`,
    bg: `<rect width="1024" height="1024" fill="url(#sea)"/>`,
    inner: `<g mask="url(#fadem)" opacity=".55">${shadow}</g>${side}${g.text('fill="url(#face)"')}
      ${g.text('fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="3"', 'translate(-1 -1)')}`
  })
}

// Stained glass: the g leaded from jewel-coloured panes, sunlight pouring through it in a dark stone wall.
async function stainedGlass() {
  const g = await G({ font: 'Avenir Next', weight: 800, size: 760, cx: 512, cy: 500 })
  const rnd = rng(31), cell = 92, n = 11
  const V = []
  for (let j = 0; j <= n; j++) { V[j] = []; for (let i = 0; i <= n; i++) V[j][i] = [40 + i * cell + (rnd() - 0.5) * 50, 40 + j * cell + (rnd() - 0.5) * 50] }
  const jewels = ['#c8102e', '#e8a317', '#1f4fd1', '#0f8f5c', '#7a2bbf', '#f05a28', '#1fa3c9', '#d61f7a']
  let panes = ''
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const q = [V[j][i], V[j][i + 1], V[j + 1][i + 1], V[j + 1][i]]
    const tri = rnd() > 0.5 ? [[q[0], q[1], q[2]], [q[0], q[2], q[3]]] : [[q[0], q[1], q[3]], [q[1], q[2], q[3]]]
    tri.forEach((t) => { panes += `<polygon points="${t.map((p) => f(p[0]) + ',' + f(p[1])).join(' ')}" fill="${jewels[Math.floor(rnd() * jewels.length)]}"/>` })
  }
  return shell({
    base: '#1a1714',
    defs: `<linearGradient id="stone" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a342d"/><stop offset="1" stop-color="#15120f"/></linearGradient>
      ${GRAIN('grain', 0.35, 0.55, 14)}
      <clipPath id="tclip">${g.text()}</clipPath>
      <radialGradient id="sun" cx=".3" cy=".22" r=".8"><stop offset="0" stop-color="#fff6d8" stop-opacity=".75"/><stop offset=".45" stop-color="#fff6d8" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient>
      <filter id="glassy" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="3" seed="6"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .5 -.18"/></filter>
      ${blur('b40', 40)}`,
    bg: `<rect width="1024" height="1024" fill="url(#stone)"/><rect width="1024" height="1024" filter="url(#grain)"/>`,
    inner: `<g filter="url(#b40)" opacity=".6"><g clip-path="url(#tclip)">${panes}</g></g>
      <g clip-path="url(#tclip)">${panes}
        <g fill="none" stroke="#141210" stroke-width="9" stroke-linejoin="round">${panes.replace(/fill="[^"]+"/g, '')}</g>
        <rect width="1024" height="1024" filter="url(#glassy)"/><rect width="1024" height="1024" fill="url(#sun)"/></g>
      ${g.text('fill="none" stroke="#141210" stroke-width="22" stroke-linejoin="round"')}
      ${g.text('fill="none" stroke="#8a7a62" stroke-opacity=".6" stroke-width="3" stroke-linejoin="round"', 'translate(-3 -3)')}`
  })
}

// Toy bricks: the g built from glossy yellow plastic bricks, snapped onto a blue baseplate.
async function toyBricks() {
  const cell = 48
  const bm = await page.evaluate(([cell, font]) => {
    const c = document.createElement('canvas'); c.width = c.height = 1200
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx.font = `800 760px ${font}`; ctx.fillText('g', 250, 800)
    const m = ctx.measureText('g')
    const left = 250 - m.actualBoundingBoxLeft, top = 800 - m.actualBoundingBoxAscent
    const w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight, h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent
    const cols = Math.round(w / cell), rows = Math.round(h / cell), sx = w / cols, sy = h / rows
    const d = ctx.getImageData(0, 0, 1200, 1200).data
    const bits = []
    for (let j = 0; j < rows; j++) { bits[j] = ''; for (let i = 0; i < cols; i++) {
      let a = 0, n = 0
      for (let yy = 0; yy < 6; yy++) for (let xx = 0; xx < 6; xx++) { const px = Math.floor(left + (i + (xx + 0.5) / 6) * sx), py = Math.floor(top + (j + (yy + 0.5) / 6) * sy); a += d[(py * 1200 + px) * 4 + 3]; n++ }
      bits[j] += a / n / 255 > 0.45 ? 'X' : '.'
    } }
    return { cols, rows, bits }
  }, [cell, '"Avenir Next"'])
  const ox = 512 - (bm.cols * cell) / 2, oy = 500 - (bm.rows * cell) / 2
  let bricks = '', shadows = ''
  bm.bits.forEach((r, j) => [...r].forEach((ch, i) => {
    if (ch !== 'X') return
    const x = ox + i * cell, y = oy + j * cell, c = cell / 2
    shadows += `<rect x="${f(x + 10)}" y="${f(y + 14)}" width="${cell}" height="${cell}" rx="6"/>`
    bricks += `<rect x="${f(x + 1)}" y="${f(y + 1)}" width="${cell - 2}" height="${cell - 2}" rx="6" fill="url(#plastic)" stroke="#b07800" stroke-width="2"/>
      <circle cx="${f(x + c + 2)}" cy="${f(y + c + 4)}" r="${c * 0.56}" fill="#a86f00" opacity=".55"/>
      <circle cx="${f(x + c)}" cy="${f(y + c)}" r="${c * 0.56}" fill="url(#stud)"/>`
  }))
  return shell({
    base: '#1e5bd8',
    defs: `<linearGradient id="plate" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3d82ff"/><stop offset="1" stop-color="#1546b8"/></linearGradient>
      <pattern id="studs" x="${f(ox % cell)}" y="${f(oy % cell)}" width="${cell}" height="${cell}" patternUnits="userSpaceOnUse">
        <circle cx="${cell / 2 + 2}" cy="${cell / 2 + 4}" r="${cell * 0.28}" fill="#0d3590" opacity=".6"/><circle cx="${cell / 2}" cy="${cell / 2}" r="${cell * 0.28}" fill="#4a8cff"/>
        <circle cx="${cell / 2 - 4}" cy="${cell / 2 - 5}" r="${cell * 0.12}" fill="#9cc2ff" opacity=".7"/></pattern>
      <linearGradient id="plastic" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe14d"/><stop offset="1" stop-color="#ffb800"/></linearGradient>
      <radialGradient id="stud" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff6c0"/><stop offset=".35" stop-color="#ffd83a"/><stop offset="1" stop-color="#f0a800"/></radialGradient>
      ${blur('b10', 10)}`,
    bg: `<rect width="1024" height="1024" fill="url(#plate)"/><rect width="1024" height="1024" fill="url(#studs)"/>`,
    inner: `<g fill="#062466" opacity=".55" filter="url(#b10)">${shadows}</g>${bricks}`
  })
}

// Clay: a hand-rolled g of deep vermilion plasticine, pressed onto a slate board. Wobbly edges, thumb
// dents and tool drag come from noise in the height map, so the light catches it like real modelling clay.
async function clay() {
  const g = await G({ font: 'Avenir Next', weight: 800, size: 720, cx: 506, cy: 492, rot: -6 })
  const lightUp = `<feDistantLight azimuth="240" elevation="38"/>`
  return shell({
    base: '#14161c',
    defs: `<radialGradient id="slate" cx=".4" cy=".3" r=".95"><stop offset="0" stop-color="#2b2f3a"/><stop offset="1" stop-color="#0c0d12"/></radialGradient>
      ${GRAIN('grain', 0.3, 0.6, 21)}
      <filter id="clayf" filterUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
        <feTurbulence type="fractalNoise" baseFrequency=".011" numOctaves="2" seed="5" result="wob"/>
        <feDisplacementMap in="SourceAlpha" in2="wob" scale="24" xChannelSelector="R" yChannelSelector="G" result="d"/>
        <feMorphology in="d" operator="dilate" radius="12" result="fat"/><feGaussianBlur in="fat" stdDeviation="9" result="sb"/>
        <feComponentTransfer in="sb" result="shape"><feFuncA type="linear" slope="4" intercept="-1.6"/></feComponentTransfer>
        <feGaussianBlur in="shape" stdDeviation="28" result="dome"/>
        <feTurbulence type="fractalNoise" baseFrequency=".009 .014" numOctaves="2" seed="9" result="n"/>
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.4 0 0 0 -.5" result="dents"/>
        <feComposite in="dome" in2="dents" operator="arithmetic" k2="1" k3=".14" result="h"/>
        <feDiffuseLighting in="h" surfaceScale="40" diffuseConstant="1.3" lighting-color="#fff" result="dl">${lightUp}</feDiffuseLighting>
        <feSpecularLighting in="h" surfaceScale="40" specularConstant=".25" specularExponent="14" lighting-color="#ffd2bf" result="sl">${lightUp}</feSpecularLighting>
        <feFlood flood-color="#c4200a" result="col"/>
        <feComposite in="col" in2="dl" operator="arithmetic" k1="1.05" result="lit"/>
        <feComposite in="sl" in2="lit" operator="arithmetic" k2=".7" k3="1" result="all"/>
        <feComposite in="all" in2="shape" operator="in"/></filter>
      <filter id="restf" filterUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
        <feTurbulence type="fractalNoise" baseFrequency=".011" numOctaves="2" seed="5" result="wob"/>
        <feDisplacementMap in="SourceAlpha" in2="wob" scale="24" xChannelSelector="R" yChannelSelector="G"/>
        <feMorphology operator="dilate" radius="14"/><feGaussianBlur stdDeviation="16"/><feOffset dx="18" dy="28"/>
        <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .75 0"/></filter>`,
    bg: `<rect width="1024" height="1024" fill="url(#slate)"/><rect width="1024" height="1024" filter="url(#grain)"/>
      <g fill="#d8320f" opacity=".5"><circle cx="812" cy="806" r="16"/><circle cx="846" cy="776" r="9"/><circle cx="214" cy="226" r="11"/></g>`,
    inner: `${g.text('fill="#000" filter="url(#restf)"')}${g.text('fill="#000" filter="url(#clayf)"')}`
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
  ['blueprint', blueprint],
  ['neon', neon],
  ['shapes', shapes],
  ['circuit', circuit],
  ['holo-foil', holoFoil],
  ['enamel-pin', enamelPin],
  ['patch', patch],
  ['extruded', extruded],
  ['stained-glass', stainedGlass],
  ['toy-bricks', toyBricks],
  ['clay', clay]
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
