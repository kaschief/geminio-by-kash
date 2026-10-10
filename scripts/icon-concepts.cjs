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

// Stained glass: the g leaded from jewel-coloured panes, sunlight pouring through it in a dark stone wall.
async function stainedGlass() {
  const g = await G({ size: 760, cx: 512, cy: 500 })
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
  }, [cell, SANS])
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
  ['patch', patch], ['extruded', extruded], ['stained-glass', stainedGlass], ['toy-bricks', toyBricks], ['clay', clay]
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
