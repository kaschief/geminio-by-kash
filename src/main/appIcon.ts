import { app, nativeImage } from 'electron'
import { join, dirname, resolve } from 'path'
import defaultIcon from '../../resources/icon.png?asset'
import { normalizeAppIcon, DEFAULT_APP_ICON, type AppIconPreference } from '../shared/appIcons'
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
  const { icon } = normalizeAppIcon(preference)
  if (icon === dockApplied && (!app.isPackaged || (icon === persisted && pending.size === 0))) return Promise.resolve()
  const path = icon === DEFAULT_APP_ICON ? defaultIcon : join(dirname(defaultIcon), 'app-icons', `${icon}.png`)
  const image = nativeImage.createFromPath(path)
  if (image.isEmpty()) return Promise.resolve()
  if (icon !== dockApplied) {
    app.dock?.setIcon(image)
    dockApplied = icon
  }
  // The development runtime is shared Electron.app; never customize that bundle.
  if (!app.isPackaged) return Promise.resolve()
  const bundle = resolve(dirname(app.getPath('exe')), '..', '..')
  // The bundle already carries the default icon, so choosing it just clears any custom one.
  const png = icon === DEFAULT_APP_ICON ? null : image.toPNG()
  // Serialize changes so a slow previous choice cannot overwrite a newer one.
  const operation = queue.then(async () => {
    if (icon === persisted) return
    await persistMacAppIcon(bundle, png)
    persisted = icon
  })
  queue = operation.catch(() => {})
  return track(operation)
}
