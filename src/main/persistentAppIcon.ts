import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)
// NSWorkspace stores a Finder custom icon, which also survives a Dock app quitting.
// Arguments are passed separately, never interpolated into executable script text.
const SET_ICON = `ObjC.import('AppKit');
function run(args) {
  const image = args[1] === '-' ? $() : $.NSImage.alloc.initWithContentsOfFile(args[1]);
  if (args[1] !== '-' && !image) throw new Error('App icon image could not be loaded');
  if (!$.NSWorkspace.sharedWorkspace.setIconForFileOptions(image, args[0], 0)) {
    throw new Error('App icon could not be saved');
  }
}`

/** Pass null to restore the original bundle icon. Never modifies signed resources. */
export async function persistMacAppIcon(bundle: string, png: Buffer | null): Promise<void> {
  if (process.platform !== 'darwin') return
  if (!bundle.endsWith('.app')) throw new Error('Expected a macOS application bundle')
  const temp = await mkdtemp(join(tmpdir(), 'geminio-icon-'))
  try {
    const image = png ? join(temp, 'icon.png') : '-'
    if (png) await writeFile(image, png)
    await exec('/usr/bin/osascript', ['-l', 'JavaScript', '-e', SET_ICON, bundle, image], { timeout: 10000 })
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
}
