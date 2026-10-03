// The lit dot that marks the one chosen option of a group, shared by menus and
// in-page pickers so "chosen" looks the same everywhere. Deliberately not a
// tick. An on/off needs no mark of its own: its row's icon lights up instead
// (see `.menu-item.toggle`). Decorative — the owning control carries
// aria-checked / aria-selected.

export function ChoiceDot({ on }: { on: boolean }): React.JSX.Element {
  return (
    <span className="state-choice" aria-hidden="true">
      <span className={`state-dot ${on ? 'on' : ''}`} />
    </span>
  )
}
