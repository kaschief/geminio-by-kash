// Rebuild the original vector alternatives as PNGs for Electron's Dock API.
// Run with: node_modules/.bin/electron scripts/generate-app-icons.cjs
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')
const ts = require('typescript')
const root = join(__dirname, '..')
const compiled = ts.transpileModule(readFileSync(join(root, 'src/shared/appIcons.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const mod = { exports: {} }
new Function('exports', 'module', compiled)(mod.exports, mod)
const { APP_ICON_STYLES, APP_ICON_COLORS, appIconSvg } = mod.exports
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, useContentSize: true, show: false, transparent: true, frame: false, webPreferences: { offscreen: true, backgroundThrottling: false } })
  const dir = join(root, 'resources/app-icons')
  mkdirSync(dir, { recursive: true })
  for (const style of APP_ICON_STYLES.filter((s) => s !== 'classic' && s !== 'github')) {
    for (const color of APP_ICON_COLORS) {
      const svg = appIconSvg(style, color)
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<style>html,body{margin:0;background:transparent;overflow:hidden}</style>${svg}`)}`)
      await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
      writeFileSync(join(dir, `${style}-${color}.png`), (await win.webContents.capturePage()).toPNG())
    }
  }
  win.destroy()
  app.quit()
}).catch((error) => { console.error(error); app.exit(1) })
