import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { APP_ICONS, DEFAULT_APP_ICON, normalizeAppIcon } from '../src/shared/appIcons'

describe('app icon preference', () => {
  it('defaults to Monoline when nothing is saved', () => {
    expect(DEFAULT_APP_ICON).toBe('monoline')
    expect(normalizeAppIcon()).toEqual({ icon: 'monoline' })
    expect(normalizeAppIcon(null)).toEqual({ icon: 'monoline' })
  })
  it('keeps every known icon', () => {
    for (const icon of APP_ICONS) expect(normalizeAppIcon({ icon })).toEqual({ icon })
  })
  it('falls back for unknown values and for the style-and-colour shape saved by earlier versions', () => {
    expect(normalizeAppIcon({ icon: '../../elsewhere' } as never)).toEqual({ icon: 'monoline' })
    expect(normalizeAppIcon({ style: 'orbit', color: 'ocean' } as never)).toEqual({ icon: 'monoline' })
    expect(normalizeAppIcon({ style: 'github', githubAvatarUrl: 'https://avatars.githubusercontent.com/u/1' } as never)).toEqual({ icon: 'monoline' })
  })
})

describe('app icon assets', () => {
  const png = (id: string): Buffer => readFileSync(`resources/app-icons/${id}.png`)

  it('ships a native PNG of at least 512px for every selectable icon, all different', () => {
    const seen = new Set<string>()
    for (const id of APP_ICONS) {
      const bytes = png(id)
      expect(bytes.subarray(0, 8).toString('hex'), id).toBe('89504e470d0a1a0a')
      expect(bytes.readUInt32BE(16), id).toBeGreaterThanOrEqual(512)
      seen.add(bytes.toString('base64'))
    }
    expect(seen.size).toBe(APP_ICONS.length)
  })
  it('has no artwork on disk that the picker cannot offer, so nothing stale ships', () => {
    expect(readdirSync('resources/app-icons').sort()).toEqual(APP_ICONS.map((id) => `${id}.png`).sort())
  })
  it('uses the default icon for the app bundle, installer and favicon', () => {
    const def = png(DEFAULT_APP_ICON)
    for (const path of ['resources/icon.png', 'build/icon.png', 'src/renderer/src/assets/logo.png']) {
      expect(readFileSync(path).equals(def), path).toBe(true)
    }
  })
})
