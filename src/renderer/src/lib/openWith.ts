import type { AppSettings } from '../../../shared/types'
import { isEditorApp, type EditorSetting } from '../../../shared/editors'
import type { MenuItem } from '../stores/ui'
import { shellApi } from '../infrastructure/api'
import { editorMenuItems } from './editorOpen'
import { mi } from '../components/menuIcons'

export type DefaultOpenApp = AppSettings['defaultOpenApp']

/** Builds the "Open in <Editor>" + "Open with <App>" + "Open With…" menu items
 *  shared by the file tree, repo tabs and status bar. `path` may be a file or a
 *  folder — the editor, `shellApi.openWithApp` and the native picker all accept
 *  either. */
export function openWithMenuItems(
  path: string,
  defaultApp: DefaultOpenApp,
  labels: { openWithDefault: (name: string) => string; openWith: string },
  editor?: EditorSetting,
  opts?: { isDir?: boolean; repo?: string }
): MenuItem[] {
  const items: MenuItem[] = editorMenuItems(editor, { path, isDir: opts?.isDir, repo: opts?.repo })
  if (defaultApp?.path && !isEditorApp(editor, defaultApp.path)) {
    items.push({
      label: labels.openWithDefault(defaultApp.name),
      icon: mi.openExternal(),
      onClick: () => void shellApi.openWithApp(path, defaultApp.path)
    })
  }
  items.push({ label: labels.openWith, icon: mi.openExternal(), onClick: () => void shellApi.openWithPicker(path) })
  return items
}

/** Full folder-scope menu: Open Folder, Open with <App> (if set), Open With…,
 *  Copy folder path. Used by repo tabs, the group-repo menu, the Files header
 *  and the status bar. */
export function folderOpenMenuItems(
  path: string,
  defaultApp: DefaultOpenApp,
  labels: {
    openFolder: string
    openWithDefault: (name: string) => string
    openWith: string
    copyPath: string
  },
  editor?: EditorSetting
): MenuItem[] {
  return [
    { label: labels.openFolder, icon: mi.reveal(), onClick: () => void shellApi.openPath(path) },
    ...openWithMenuItems(path, defaultApp, labels, editor, { isDir: true }),
    { separator: true },
    { label: labels.copyPath, icon: mi.copyPath(), onClick: () => void navigator.clipboard.writeText(path) }
  ]
}
