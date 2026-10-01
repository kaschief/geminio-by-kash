import { app, BrowserWindow, ipcMain, nativeImage } from 'electron'
import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { githubAvatarUrl } from '../shared/appIcons'

export function githubAppIconPath(raw?: string): string | null {
  const url = githubAvatarUrl(raw)
  return url ? join(app.getPath('userData'), 'app-icons', `github-${createHash('sha256').update(url).digest('hex').slice(0, 24)}.png`) : null
}

/** Cache the connected user's public avatar locally; no credentials leave the
 * app and subsequent launches can use the photo while offline. */
export async function prepareGithubAppIcon(raw: string): Promise<string> {
  const url = githubAvatarUrl(raw)
  const path = githubAppIconPath(raw)
  if (!url || !path) throw new Error('Unsupported GitHub avatar URL')
  if (existsSync(path)) return url
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000) })
  if (!response.ok || !response.body) throw new Error('GitHub avatar unavailable')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new Error('GitHub avatar too large') }
    chunks.push(value)
  }
  const photo = nativeImage.createFromBuffer(Buffer.concat(chunks))
  if (photo.isEmpty()) throw new Error('Invalid GitHub avatar image')
  const src = photo.resize({ width: 512, height: 512, quality: 'best' }).toDataURL()
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs><clipPath id="tile"><rect x="50" y="50" width="412" height="412" rx="96"/></clipPath></defs><image href="${src}" x="50" y="50" width="412" height="412" clip-path="url(#tile)"/><rect x="51" y="51" width="410" height="410" rx="95" fill="none" stroke="white" stroke-opacity=".24" stroke-width="2"/></svg>`
  const win = new BrowserWindow({ width: 512, height: 512, useContentSize: true, show: false, transparent: true, frame: false, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<style>html,body{margin:0;background:transparent;overflow:hidden}</style>${svg}`)}`)
    await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    const icon = await win.webContents.capturePage()
    await mkdir(join(app.getPath('userData'), 'app-icons'), { recursive: true })
    await writeFile(path, icon.toPNG())
  } finally { if (!win.isDestroyed()) win.destroy() }
  return url
}

export function registerAppIconHandlers(): void {
  ipcMain.handle('appIcon:prepareGithub', (_event, url: string) => prepareGithubAppIcon(url))
}
