// Round two of app icon concepts: ten new g icons, rendered with the same shell, glyph centring and
// SVG-in-Chromium rasterising as scripts/generate-app-icons.cjs, for comparison only. Nothing here is
// wired into the app; a chosen concept moves into the real generator and APP_ICONS.
//
// Run on the Mac (house fonts): node_modules/.bin/electron scripts/icon-concepts.cjs [outDir]
// Run anywhere with Playwright:  node scripts/icon-concepts.cjs [outDir]
// Fonts fall back from Avenir Next to Inter, so a machine without Avenir draws a close cousin of the g.
const { writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')

const OUT = process.argv.slice(2).find((a) => !a.startsWith('-')) ?? join(__dirname, '..', 'icon-concepts')
const SANS = "'Avenir Next', 'Inter'"
const SERIF = "'Didot', 'DejaVu Serif'"
let page

const f = (n) => Math.round(n * 100) / 100
const rad = (d) => (d * Math.PI) / 180
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * Math.min(1, Math.max(0, t))))
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647) }

// Same optical centring as the real generator, with a font stack instead of one family.
async function G({ font = SANS, weight = 800, size, cx = 512, cy = 512, rot = 0 }) {
  const m = await page.evaluate(([font, weight, size]) => {
    const c = document.createElement('canvas').getContext('2d')
    c.font = `${weight} ${size}px ${font}`
    const t = c.measureText('g')
    return { l: t.actualBoundingBoxLeft, r: t.actualBoundingBoxRight, a: t.actualBoundingBoxAscent, d: t.actualBoundingBoxDescent }
  }, [font, weight, size])
  const x = cx - (m.r - m.l) / 2
  const y = cy - (m.d - m.a) / 2
  const attrs = `font-family="${font}" font-weight="${weight}" font-size="${size}"`
  const tf = (pre = '') => {
    const t = `${pre} ${rot ? `rotate(${rot} ${cx} ${cy})` : ''}`.trim()
    return t ? `transform="${t}"` : ''
  }
  return {
    x, y, top: y - m.a, bottom: y + m.d, left: x - m.l, right: x + m.r,
    text: (extra = '', pre = '') => `<text x="${f(x)}" y="${f(y)}" ${attrs} ${extra} ${tf(pre)}>g</text>`
  }
}

// ---------- shell, identical to the shipped icons ----------
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

// The monoline g's geometry, carried over: bowl ring, stem and hooked tail, and the frame that centres it.
const MC = { x: 448, y: 452 }, MR = 150, MSX = MC.x + MR
const hookPath = `M${MSX} ${MC.y - MR} L${MSX} ${MC.y + MR + 70} C${MSX} ${MC.y + MR + 170} ${MSX - 100} ${MC.y + MR + 214} ${MSX - 224} ${MC.y + MR + 176}`
const hookTip = { x: MSX - 224, y: MC.y + MR + 176 }
const FRAME = 'translate(512 512) scale(1.12) translate(-512 -512) translate(58 -44)'
const bezier = (t) => {
  const p0 = [MSX, MC.y + MR + 70], p1 = [MSX, MC.y + MR + 170], p2 = [MSX - 100, MC.y + MR + 214], p3 = [hookTip.x, hookTip.y], u = 1 - t
  return [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k])
}
const onRing = (deg) => [MC.x + MR * Math.cos(rad(deg)), MC.y + MR * Math.sin(rad(deg))]

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

// Sticker: a die-cut vinyl g with a thick white border, stuck slightly crooked on a brushed aluminium lid.
async function sticker() {
  const g = await G({ size: 720, cx: 512, cy: 500, rot: -9 })
  return shell({
    base: '#b9bdc4',
    defs: `<linearGradient id="alu" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e3e5e9"/><stop offset=".55" stop-color="#b8bcc3"/><stop offset="1" stop-color="#8f949c"/></linearGradient>
      <filter id="brush" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.002 0.9" numOctaves="2" seed="4"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .35 -.05"/></filter>
      <linearGradient id="vinyl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd23d"/><stop offset=".5" stop-color="#ff7a1f"/><stop offset="1" stop-color="#ff2e6e"/></linearGradient>
      <linearGradient id="shine" x1="0" y1="0" x2="1" y2="1"><stop offset=".25" stop-color="#fff" stop-opacity="0"/><stop offset=".38" stop-color="#fff" stop-opacity=".5"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <clipPath id="tclip">${g.text()}</clipPath>
      <filter id="lift" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="6" dy="14" stdDeviation="12" flood-color="#2b2f36" flood-opacity=".45"/></filter>`,
    bg: `<rect width="1024" height="1024" fill="url(#alu)"/><rect width="1024" height="1024" filter="url(#brush)"/>`,
    inner: `<g filter="url(#lift)">${g.text('fill="#fff" stroke="#fff" stroke-width="64" stroke-linejoin="round"')}</g>
      ${g.text('fill="url(#vinyl)"')}
      <g clip-path="url(#tclip)"><rect width="1024" height="1024" fill="url(#shine)"/></g>
      ${g.text('fill="none" stroke="#000" stroke-opacity=".12" stroke-width="2"')}`
  })
}

// Commit graph: the g is a branch diagram. The bowl is a branch that leaves the main line and merges back.
async function commitGraph() {
  const dot = ([x, y], c, r = 26) => `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="#fff" stroke="${c}" stroke-width="13"/>`
  const lane = '#3567ff', branch = '#ff4f8b', tip = '#16b981'
  const stem = [MC.y - MR, MC.y - MR / 2, MC.y + MR / 2 + 20, MC.y + MR + 70].map((y) => [MSX, y])
  return shell({
    base: '#f3efe7',
    defs: `<linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf8f2"/><stop offset="1" stop-color="#e9e3d7"/></linearGradient>
      <pattern id="dots" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="16" cy="16" r="2" fill="#000" opacity=".09"/></pattern>
      <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="9" flood-color="#5a4a2a" flood-opacity=".22"/></filter>
      <radialGradient id="halo"><stop offset="0" stop-color="${tip}" stop-opacity=".45"/><stop offset="1" stop-color="${tip}" stop-opacity="0"/></radialGradient>`,
    bg: `<rect width="1024" height="1024" fill="url(#paper)"/><rect width="1024" height="1024" fill="url(#dots)"/>`,
    inner: `<g transform="${FRAME}"><g filter="url(#soft)">
      <circle cx="${MC.x}" cy="${MC.y}" r="${MR}" fill="none" stroke="${branch}" stroke-width="30"/>
      <path d="${hookPath}" fill="none" stroke="${lane}" stroke-width="30" stroke-linecap="round"/>
      <path d="M${MSX} ${MC.y + MR + 70} C${MSX} ${MC.y + MR + 170} ${MSX - 100} ${MC.y + MR + 214} ${hookTip.x} ${hookTip.y}" fill="none" stroke="${tip}" stroke-width="30" stroke-linecap="round"/>
      ${[200, 140, 260].map((a) => dot(onRing(a), branch)).join('')}
      ${stem.map((p) => dot(p, lane)).join('')}
      ${dot([MSX, MC.y], branch, 34)}
    </g>
    <circle cx="${hookTip.x}" cy="${hookTip.y}" r="86" fill="url(#halo)"/>${dot([hookTip.x, hookTip.y], tip, 32)}</g>`
  })
}

// Riso twins: two g's printed in fluorescent pink and blue risograph ink, slightly off register.
// The overlap prints purple; Geminio is the twin, the copy. Uneven ink and paper fibre are noise masks.
async function risoTwins() {
  const g = await G({ size: 690, cx: 512, cy: 505 })
  const ink = (id, seed) => `<filter id="${id}" filterUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="${seed}"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -1.6 0 0 0 1.55"/></filter>
    <mask id="${id}m" ${UMASK}><rect width="1024" height="1024" filter="url(#${id})"/></mask>`
  return shell({
    base: '#f2ead8',
    defs: `${ink('inkA', 3)}${ink('inkB', 8)}${GRAIN('fibre', 0.22, 0.65, 2)}
      <pattern id="half" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(22)"><circle cx="7" cy="7" r="3.2" fill="#f2ead8"/></pattern>`,
    bg: `<rect width="1024" height="1024" fill="#f2ead8"/><rect width="1024" height="1024" filter="url(#fibre)"/>`,
    inner: `<g style="mix-blend-mode:multiply" mask="url(#inkA)">${g.text('fill="#ff48b0"', 'translate(-24 -14)')}</g>
      <g style="mix-blend-mode:multiply" mask="url(#inkB)">${g.text('fill="#0a78d1"', 'translate(24 14)')}</g>
      <g opacity=".35" style="mix-blend-mode:screen"><clipPath id="hc">${g.text('', 'translate(24 14)')}</clipPath><rect width="1024" height="1024" fill="url(#half)" clip-path="url(#hc)"/></g>`,
    over: `<rect width="1024" height="1024" filter="url(#fibre)" opacity=".6"/>`
  })
}

// Enamel pin: hard enamel inside a raised gold cloison, glossy, pinned to green felt.
async function enamelPin() {
  const g = await G({ size: 700, cx: 512, cy: 500 })
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
  const g = await G({ size: 520, cx: 512, cy: 508 })
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
  const g = await G({ size: 640, cx: 470, cy: 470 })
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

// Wax seal: a g pressed into a pool of red sealing wax on parchment.
async function waxSeal() {
  const g = await G({ font: SERIF, weight: 700, size: 440, cx: 512, cy: 500 })
  const rnd = rng(17)
  const pts = []
  for (let a = 0; a < 360; a += 6) {
    const r = 312 + (rnd() - 0.5) * 34 + (a % 48 === 0 ? 22 : 0)
    pts.push([512 + r * Math.cos(rad(a)), 520 + r * Math.sin(rad(a))])
  }
  const mid = (a, b) => `${f((a[0] + b[0]) / 2)} ${f((a[1] + b[1]) / 2)}`
  const blob = `M${mid(pts[pts.length - 1], pts[0])}` + pts.map((p, i) => ` Q${f(p[0])} ${f(p[1])} ${mid(p, pts[(i + 1) % pts.length])}`).join('') + 'Z'
  return shell({
    base: '#e8d9b8',
    defs: `<radialGradient id="parch" cx=".45" cy=".4" r=".85"><stop offset="0" stop-color="#f6ecd2"/><stop offset=".75" stop-color="#e3cfa4"/><stop offset="1" stop-color="#b99a62"/></radialGradient>
      ${GRAIN('grain', 0.25, 0.7, 9)}
      <radialGradient id="wax" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#d42a36"/><stop offset=".7" stop-color="#9d0f1c"/><stop offset="1" stop-color="#6e0712"/></radialGradient>
      <filter id="waxlight" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur in="SourceAlpha" stdDeviation="22" result="a"/>
        <feSpecularLighting in="a" surfaceScale="14" specularConstant=".9" specularExponent="18" lighting-color="#ffd9d9" result="s"><feDistantLight azimuth="225" elevation="40"/></feSpecularLighting>
        <feComposite in="s" in2="SourceAlpha" operator="in" result="sc"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="sc"/></feMerge></filter>
      <filter id="press" x="-10%" y="-10%" width="120%" height="120%">
        <feFlood flood-color="#2a0005" flood-opacity=".9" result="c"/><feComposite in="c" in2="SourceAlpha" operator="out" result="inv"/>
        <feGaussianBlur in="inv" stdDeviation="9" result="bl"/><feOffset in="bl" dx="9" dy="12" result="of"/>
        <feComposite in="of" in2="SourceAlpha" operator="in" result="sh"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="sh"/></feMerge></filter>
      ${blur('lip', 2)}
      <filter id="sit" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="12" flood-color="#3b2208" flood-opacity=".45"/></filter>`,
    bg: `<rect width="1024" height="1024" fill="url(#parch)"/><rect width="1024" height="1024" filter="url(#grain)"/>`,
    inner: `<g filter="url(#sit)"><path d="${blob}" fill="url(#wax)" filter="url(#waxlight)"/></g>
      <circle cx="512" cy="520" r="232" fill="#8e0d19" filter="url(#press)"/>
      <circle cx="512" cy="520" r="232" fill="none" stroke="#ff8a8a" stroke-opacity=".35" stroke-width="3" transform="translate(-3 -4)"/>
      ${g.text('fill="#ff9d9d" opacity=".35" filter="url(#lip)"', 'translate(-4 -5)')}
      ${g.text('fill="#7a0a15" filter="url(#press)"')}`
  })
}

// Constellation: the monoline g traced as a star pattern on a deep night sky.
async function constellation() {
  const stars = [...[-90, -30, 30, 90, 150, 210].map(onRing), [MSX, MC.y + MR / 2 + 20], [MSX, MC.y + MR + 70], bezier(0.55), [hookTip.x, hookTip.y]]
  const sky = rng(23)
  let dust = ''
  for (let i = 0; i < 140; i++) dust += `<circle cx="${f(100 + sky() * 824)}" cy="${f(100 + sky() * 824)}" r="${f(0.5 + sky() * 1.7)}" fill="#fff" opacity="${f(0.2 + sky() * 0.55)}"/>`
  const star = ([x, y], big) => `<circle cx="${f(x)}" cy="${f(y)}" r="${big ? 44 : 30}" fill="url(#glow)"/>
    <path d="M${f(x)} ${f(y - (big ? 30 : 20))}L${f(x + 4)} ${f(y - 4)}L${f(x + (big ? 30 : 20))} ${f(y)}L${f(x + 4)} ${f(y + 4)}L${f(x)} ${f(y + (big ? 30 : 20))}L${f(x - 4)} ${f(y + 4)}L${f(x - (big ? 30 : 20))} ${f(y)}L${f(x - 4)} ${f(y - 4)}Z" fill="#fff"/>
    <circle cx="${f(x)}" cy="${f(y)}" r="${big ? 9 : 6.5}" fill="#fff"/>`
  return shell({
    base: '#060a1f',
    defs: `<radialGradient id="night" cx=".6" cy=".3" r="1"><stop offset="0" stop-color="#1e2a6b"/><stop offset=".55" stop-color="#0b1236"/><stop offset="1" stop-color="#03051a"/></radialGradient>
      <radialGradient id="glow"><stop offset="0" stop-color="#bcd4ff" stop-opacity=".9"/><stop offset=".3" stop-color="#7aa2ff" stop-opacity=".35"/><stop offset="1" stop-color="#7aa2ff" stop-opacity="0"/></radialGradient>
      ${blur('neb', 60)}`,
    bg: `<rect width="1024" height="1024" fill="url(#night)"/>
      <g filter="url(#neb)" opacity=".5"><ellipse cx="300" cy="760" rx="300" ry="120" fill="#7b3fe4" transform="rotate(-28 300 760)"/><ellipse cx="760" cy="260" rx="260" ry="90" fill="#1f8fff" transform="rotate(-28 760 260)"/></g>${dust}`,
    inner: `<g transform="${FRAME}">
      <g fill="none" stroke="#cfe0ff" stroke-opacity=".55" stroke-width="4" stroke-linecap="round">
        <circle cx="${MC.x}" cy="${MC.y}" r="${MR}" stroke-dasharray="2 14"/>
        <path d="${'M' + stars.slice(0, 6).concat([stars[0]]).map((p) => `${f(p[0])} ${f(p[1])}`).join(' L')}"/>
        <path d="M${MSX} ${MC.y - MR} L${stars.slice(6).map((p) => `${f(p[0])} ${f(p[1])}`).join(' L')}"/>
      </g>
      ${stars.map((p, i) => star(p, i === 0 || i === stars.length - 1)).join('')}
    </g>`
  })
}

// Clay: a soft, puffy modelling-clay g in pastel mint, sitting on a lilac tabletop.
async function clay() {
  const g = await G({ size: 760, cx: 512, cy: 495, rot: -5 })
  return shell({
    base: '#d9c8ff',
    defs: `<linearGradient id="table" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1e6ff"/><stop offset="1" stop-color="#c3aef5"/></linearGradient>
      ${GRAIN('grain', 0.12, 1.1, 3)}
      <filter id="puffy" x="-15%" y="-15%" width="130%" height="130%">
        <feMorphology in="SourceAlpha" operator="dilate" radius="14" result="fat"/><feGaussianBlur in="fat" stdDeviation="14" result="soft"/>
        <feComponentTransfer in="soft" result="shape"><feFuncA type="linear" slope="3" intercept="-1"/></feComponentTransfer>
        <feGaussianBlur in="shape" stdDeviation="16" result="h"/>
        <feDiffuseLighting in="h" surfaceScale="22" diffuseConstant="1.1" lighting-color="#fff" result="d"><feDistantLight azimuth="235" elevation="52"/></feDiffuseLighting>
        <feSpecularLighting in="h" surfaceScale="22" specularConstant=".55" specularExponent="16" lighting-color="#fff" result="s"><feDistantLight azimuth="235" elevation="52"/></feSpecularLighting>
        <feFlood flood-color="#5fe0bd" result="col"/><feComposite in="col" in2="d" operator="arithmetic" k1="1.12" result="lit"/>
        <feComposite in="s" in2="lit" operator="arithmetic" k2="1" k3="1" result="all"/><feComposite in="all" in2="shape" operator="in"/></filter>
      <filter id="rest" x="-20%" y="-20%" width="140%" height="140%"><feMorphology in="SourceAlpha" operator="dilate" radius="14"/><feGaussianBlur stdDeviation="20"/><feOffset dx="14" dy="30"/><feColorMatrix type="matrix" values="0 0 0 0 .32  0 0 0 0 .18  0 0 0 0 .55  0 0 0 .45 0"/></filter>`,
    bg: `<rect width="1024" height="1024" fill="url(#table)"/><rect width="1024" height="1024" filter="url(#grain)"/>`,
    inner: `${g.text('fill="#000" filter="url(#rest)"')}${g.text('fill="#000" filter="url(#puffy)"')}`,
    over: `<rect width="1024" height="1024" filter="url(#grain)" opacity=".5"/>`
  })
}

const concepts = [
  ['neon', neon], ['sticker', sticker], ['commit-graph', commitGraph], ['riso-twins', risoTwins], ['enamel-pin', enamelPin],
  ['patch', patch], ['extruded', extruded], ['wax-seal', waxSeal], ['constellation', constellation], ['clay', clay]
]

async function main(renderSvg) {
  mkdirSync(OUT, { recursive: true })
  for (const [id, draw] of concepts) {
    writeFileSync(join(OUT, `${id}.png`), await renderSvg(await draw()))
    console.log(`  ✓ ${id}.png`)
  }
}

if (process.versions.electron) {
  const { app, BrowserWindow } = require('electron')
  let win
  app.whenReady().then(async () => {
    win = new BrowserWindow({ width: 1024, height: 1024, useContentSize: true, show: false, transparent: true, frame: false, webPreferences: { offscreen: true, backgroundThrottling: false } })
    await win.loadURL('about:blank')
    page = { evaluate: (fn, arg) => win.webContents.executeJavaScript(`(${fn.toString()})(${JSON.stringify(arg)})`) }
    await main(async (svg) => {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<style>html,body{margin:0;background:transparent;overflow:hidden}</style>${svg}`)}`)
      await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
      const image = await win.webContents.capturePage()
      return (image.getSize().width === 1024 ? image : image.resize({ width: 1024, height: 1024, quality: 'best' })).toPNG()
    })
    app.quit()
  }).catch((error) => { console.error(error); app.exit(1) })
} else {
  const { chromium } = require('playwright')
  ;(async () => {
    const browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 1024, height: 1024 } })
    await main(async (svg) => {
      await page.setContent(`<style>html,body{margin:0;background:transparent;overflow:hidden}</style>${svg}`)
      await page.evaluate(() => document.fonts.ready)
      return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: 1024, height: 1024 } })
    })
    await browser.close()
  })().catch((error) => { console.error(error); process.exit(1) })
}
