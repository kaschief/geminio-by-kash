import { Strikethrough } from 'lucide-react'

// Unified and Split drawn so each says what it does: Unified stacks a removed
// line over an added one (− over +), Split is two panes side by side. Stock
// "rows" and "columns" glyphs looked alike at 13px and said nothing about
// diffs. Inline keeps lucide's strikethrough, which already reads as itself.

type GlyphProps = { size: number }

function Glyph({ size, children }: GlyphProps & { children: React.ReactNode }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/** A − line above a + line. */
export function UnifiedGlyph({ size }: GlyphProps): React.JSX.Element {
  return (
    <Glyph size={size}>
      <path d="M3 7.5h4" />
      <path d="M10 7.5h11" />
      <path d="M3 16.5h4M5 14.5v4" />
      <path d="M10 16.5h11" />
    </Glyph>
  )
}

/** Two panes, each with its own lines. */
export function SplitGlyph({ size }: GlyphProps): React.JSX.Element {
  return (
    <Glyph size={size}>
      <rect x="2.5" y="4" width="19" height="16" rx="2.5" />
      <path d="M12 4v16" />
      <path d="M5.5 9h3.5M5.5 13h2.5M15 9h3.5M15 13h3" />
    </Glyph>
  )
}

/** Lucide's strikethrough, at the same size contract as the two above. */
export function InlineGlyph({ size }: GlyphProps): React.JSX.Element {
  return <Strikethrough size={size} strokeWidth={1.9} aria-hidden="true" />
}
