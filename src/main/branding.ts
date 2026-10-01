import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'

/** Copy the old app's saved data once; never overwrite either installation. */
export function migrateBrandData(target: string, sources: string[]): void {
  if (existsSync(join(target, 'gitcito-settings.json'))) return
  const source = sources.find((path) => existsSync(join(path, 'gitcito-settings.json')))
  if (!source) return
  mkdirSync(target, { recursive: true })
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const destination = join(target, entry.name)
    if (existsSync(destination)) continue
    if (entry.isFile() && (/\.(json|enc)$/.test(entry.name) || ['Preferences', 'Local State'].includes(entry.name))) {
      copyFileSync(join(source, entry.name), destination)
    } else if (entry.isDirectory() && ['Local Storage', 'Session Storage', 'IndexedDB'].includes(entry.name)) {
      cpSync(join(source, entry.name), destination, { recursive: true, errorOnExist: true, force: false })
    }
  }
}
