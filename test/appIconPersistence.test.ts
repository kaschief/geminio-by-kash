import { describe, it, expect } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { persistMacAppIcon } from '../src/main/persistentAppIcon'

const exec = promisify(execFile)

describe.skipIf(process.platform !== 'darwin')('persistent macOS application icons', () => {
  it('keeps a selected icon after the writer exits, replaces it, and restores Classic without changing signed resources', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'geminio-icon-test-'))
    const bundle = join(dir, "Kash's Test.app")
    try {
      await mkdir(join(bundle, 'Contents/MacOS'), { recursive: true })
      await mkdir(join(bundle, 'Contents/Resources'), { recursive: true })
      const plist = join(bundle, 'Contents/Info.plist')
      const metadata = '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>test.geminio.icon</string><key>CFBundleExecutable</key><string>test</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleIconFile</key><string>icon.icns</string></dict></plist>'
      await writeFile(plist, metadata)
      await writeFile(join(bundle, 'Contents/MacOS/test'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
      const icon = join(bundle, 'Contents/Resources/icon.icns')
      await copyFile(resolve('build/icon.icns'), icon)
      const original = await readFile(icon)
      await exec('/usr/bin/codesign', ['--force', '--sign', '-', bundle])
      const customIcon = async (): Promise<string> => (await exec('/usr/bin/xattr', ['-px', 'com.apple.ResourceFork', join(bundle, 'Icon\r')], { maxBuffer: 8 * 1024 * 1024 })).stdout
      await persistMacAppIcon(bundle, await readFile(resolve('resources/app-icons/orbit-ocean.png')))
      const first = await customIcon() // fresh process, after the native writer has exited
      expect(first.length).toBeGreaterThan(100)
      await persistMacAppIcon(bundle, await readFile(resolve('resources/app-icons/branch-rose.png')))
      expect(await customIcon()).not.toBe(first)
      // Finder custom-icon metadata is outside sealed resources; normal signature validation remains intact.
      await exec('/usr/bin/codesign', ['--verify', '--deep', bundle])
      expect(await readFile(plist, 'utf8')).toBe(metadata)
      expect(await readFile(icon)).toEqual(original)
      await persistMacAppIcon(bundle, null)
      const info = await exec('/usr/bin/xattr', ['-px', 'com.apple.FinderInfo', bundle]).then(r => Buffer.from(r.stdout.replace(/\s/g, ''), 'hex'), () => Buffer.alloc(32))
      expect(info.readUInt16BE(8) & 0x0400).toBe(0)
      await exec('/usr/bin/codesign', ['--verify', '--deep', bundle])
    } finally { await rm(dir, { recursive: true, force: true }) }
  }, 30000)
})
