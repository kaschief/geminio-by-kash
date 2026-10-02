import { app, nativeImage } from 'electron'
import { join, dirname, resolve } from 'path'
import { githubAppIconPath } from './githubAppIcon'
import defaultIcon from '../../resources/icon.png?asset'
import { normalizeAppIcon, type AppIconPreference } from '../shared/appIcons'
import { persistMacAppIcon } from './persistentAppIcon'

let dockApplied = ''
let persisted = ''
const pending = new Set<Promise<void>>()
let queue: Promise<void> = Promise.resolve()

function track(operation: Promise<void>): Promise<void> {
  const tracked = operation.finally(() => pending.delete(tracked))
  pending.add(tracked)
  return tracked
}
export function hasPendingAppIcon(): boolean { return pending.size > 0 }
export async function finishAppIconUpdates(): Promise<void> { await Promise.allSettled([...pending]) }

/** Register before the settings write starts, so quitting cannot race its disk flush. */
export function saveWithAppIcon(preference: AppIconPreference | undefined, save: () => Promise<void>): Promise<void> {
  return track(save().then(() => applyAppIcon(preference)))
}

export function applyAppIcon(preference?: AppIconPreference): Promise<void> {
  if (process.platform !== 'darwin') return Promise.resolve()
  const { style, color, githubAvatarUrl } = normalizeAppIcon(preference)
  const id = style === 'github' ? `github:${githubAvatarUrl}` : style === 'classic' ? style : `${style}-${color}`
  if (id === dockApplied && (!app.isPackaged || (id === persisted && pending.size === 0))) return Promise.resolve()
  const path = style === 'github' ? githubAppIconPath(githubAvatarUrl) : style === 'classic' ? defaultIcon : join(dirname(defaultIcon), 'app-icons', `${id}.png`)
  const image = nativeImage.createFromPath(path ?? defaultIcon)
  if (image.isEmpty()) return Promise.resolve()
  if (id !== dockApplied) {
    app.dock?.setIcon(image)
    dockApplied = id
  }
  // The development runtime is shared Electron.app; never customize that bundle.
  if (!app.isPackaged) return Promise.resolve()
  const bundle = resolve(dirname(app.getPath('exe')), '..', '..')
  // Serialize changes so a slow previous choice cannot overwrite a newer one.
  const png = style === 'classic' ? null : image.toPNG()
  const operation = queue.then(async () => {
    if (id === persisted) return
    await persistMacAppIcon(bundle, png)
    persisted = id
  })
  queue = operation.catch(() => {})
  return track(operation)
}
