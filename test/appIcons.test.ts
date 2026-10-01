import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { APP_ICON_COLORS, APP_ICON_STYLES, normalizeAppIcon, githubAvatarUrl } from '../src/shared/appIcons'

describe('app icon assets', () => {
  it('falls back safely for missing or imported unknown preferences', () => {
    expect(normalizeAppIcon()).toEqual({ style: 'classic', color: 'violet' })
    expect(normalizeAppIcon({ style: '../../elsewhere', color: 'unknown' } as never)).toEqual({ style: 'classic', color: 'violet' })
  })
  it('allows only public GitHub avatar URLs and normalizes their size', () => {
    expect(githubAvatarUrl('https://avatars.githubusercontent.com/u/123?v=4')).toBe('https://avatars.githubusercontent.com/u/123?v=4&s=512')
    expect(githubAvatarUrl('http://avatars.githubusercontent.com/u/123')).toBeNull()
    expect(githubAvatarUrl('https://avatars.githubusercontent.com.evil.test/u/123')).toBeNull()
    expect(githubAvatarUrl('https://localhost/a.png')).toBeNull()
    expect(githubAvatarUrl('https://user:pass@avatars.githubusercontent.com/u/123')).toBeNull()
  })
  it('ships a native PNG for every selectable custom style and color', () => {
    const assets = new Set<string>()
    for (const style of APP_ICON_STYLES.filter((style) => style !== 'classic' && style !== 'github')) {
      for (const color of APP_ICON_COLORS) {
        const bytes = readFileSync(`resources/app-icons/${style}-${color}.png`)
        expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
        expect(bytes.readUInt32BE(16)).toBeGreaterThanOrEqual(512)
        assets.add(bytes.toString('base64'))
      }
    }
    expect(assets.size).toBe(18)
  })
})
