import { app, nativeImage } from 'electron'
import { join, dirname } from 'path'
import { githubAppIconPath } from './githubAppIcon'
import defaultIcon from '../../resources/icon.png?asset'
import { normalizeAppIcon, type AppIconPreference } from '../shared/appIcons'

let applied = ''
export function applyAppIcon(preference?: AppIconPreference): void {
  if (process.platform !== 'darwin') return
  const { style, color, githubAvatarUrl } = normalizeAppIcon(preference)
  const id = style === 'github' ? `github:${githubAvatarUrl}` : style === 'classic' ? style : `${style}-${color}`
  if (id === applied) return
  const path = style === 'github' ? githubAppIconPath(githubAvatarUrl) : style === 'classic' ? defaultIcon : join(dirname(defaultIcon), 'app-icons', `${id}.png`)
  const image = nativeImage.createFromPath(path ?? defaultIcon)
  if (image.isEmpty()) return
  app.dock?.setIcon(image)
  applied = id
}
