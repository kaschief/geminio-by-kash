import { Code, Hammer } from 'lucide-react'
import type { EditorId } from '../../../shared/editors'

// Each editor's mark redrawn as a hollow outline at the menu's stroke weight,
// so "Open in VS Code" sits in the menu like every other row instead of
// dropping a full-colour app icon into a monochrome list. Simplified on
// purpose: recognisable at 15px, not a reproduction of the logo.

const SIZE = 15
const STROKE = 1.75

function Glyph({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const GLYPHS: Partial<Record<EditorId, () => React.JSX.Element>> = {
  // The ribbon: a tall right panel, and two strokes crossing into a chevron.
  vscode: () => (
    <Glyph>
      <path d="M16.5 3 21 5.2v13.6L16.5 21Z" />
      <path d="M16.5 3 6.6 12.3 3 9.6" />
      <path d="M16.5 21 6.6 11.7 3 14.4" />
    </Glyph>
  ),
  // The isometric cube.
  cursor: () => (
    <Glyph>
      <path d="M12 2.5 20.5 7.25v9.5L12 21.5l-8.5-4.75v-9.5Z" />
      <path d="M3.5 7.25 12 12l8.5-4.75" />
      <path d="M12 12v9.5" />
    </Glyph>
  ),
  // Two rolling waves.
  windsurf: () => (
    <Glyph>
      <path d="M3 9c2.2-2.4 4.4-2.4 6 0s4.4 2.4 6 0 4.2-2.4 6 0" />
      <path d="M3 15c2.2-2.4 4.4-2.4 6 0s4.4 2.4 6 0 4.2-2.4 6 0" />
    </Glyph>
  ),
  // A Z in a rounded square.
  zed: () => (
    <Glyph>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M8.5 8.5h7l-7 7h7" />
    </Glyph>
  ),
  // The stacked, slanted bands of the S.
  sublime: () => (
    <Glyph>
      <path d="M5 8 19 3.5V8L5 12.5Z" />
      <path d="M5 12.5 19 17" />
      <path d="M5 16 19 11.5V16L5 20.5Z" />
    </Glyph>
  ),
  // The square with its underscore.
  jetbrains: () => (
    <Glyph>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
      <path d="M7.5 16.5h5" />
    </Glyph>
  ),
  xcode: () => <Hammer size={SIZE} strokeWidth={STROKE} />
}

/** The editor's outline mark, or the generic code glyph for a custom editor. */
export function editorGlyph(id: EditorId): React.JSX.Element {
  return GLYPHS[id]?.() ?? <Code size={SIZE} strokeWidth={STROKE} />
}
