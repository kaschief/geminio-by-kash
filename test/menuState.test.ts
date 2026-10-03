import { describe, it, expect } from 'vitest'
import { submenuSummary } from '../src/renderer/src/lib/menuState'

const radio = (label: string, checked: boolean) => ({ label, radio: true, checked })

describe('submenuSummary', () => {
  it('shows a non-default choice as the parent value', () => {
    expect(submenuSummary([radio('Manual', false), { separator: true }, radio('Needs attention', true)])).toEqual({
      kind: 'value',
      label: 'Needs attention'
    })
  })

  it('stays quiet when the first (default) option is chosen', () => {
    expect(submenuSummary([radio('Manual', true), radio('Name', false)])).toBeNull()
  })

  it('marks a toggle that is on, however deep it is', () => {
    const deep = [{ label: 'More', submenu: [{ label: 'Inner', submenu: [{ label: 'Wrap', checked: true }] }] }]
    expect(submenuSummary(deep)).toEqual({ kind: 'on' })
  })

  it('ignores plain actions and toggles that are off', () => {
    expect(submenuSummary([{ label: 'Copy' }, { label: 'Wrap', checked: false }])).toBeNull()
  })
})
