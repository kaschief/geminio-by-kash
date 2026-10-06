import { describe, it, expect } from 'vitest'
import { findSinkViolations } from '../scripts/i18n-sinks.mjs'
import { isHumanCopy } from '../scripts/check-i18n.mjs'

type Hit = { line: number; kind: string; text: string }
const scan = (src: string, file = 'x.ts'): Hit[] => findSinkViolations(src, file, isHumanCopy)

describe('i18n sink rule', () => {
  it('catches copy reaching setBusy through a const ternary, across lines', () => {
    // The original sync-all busy label in stores/repo.ts.
    const hits = scan(`
      async function batch(paths: string[], op: 'fetch' | 'pull') {
        const verb = op === 'fetch' ? 'Fetching' : 'Pulling'
        for (const path of paths) {
          ui.setBusy(
            \`\${verb} \${path} (\${1}/\${paths.length})\`,
            op
          )
        }
      }`)
    expect(hits.map((h) => [h.text, h.kind])).toEqual([
      ['Fetching', 'setBusy via verb'],
      ['Pulling', 'setBusy via verb']
    ])
  })

  it('catches a template whose own words are copy, and a literal in the message argument', () => {
    const hits = scan(`
      toast('success', \`Saved \${name}\`)
      toast('error', err instanceof Error ? err.message : 'Generation failed.')
      const msg = 'Settings saved'
      useUIStore.getState().notify('info', msg)`)
    expect(hits.map((h) => h.text)).toEqual(['`Saved ${name}`', 'Generation failed.', 'Settings saved'])
  })

  it('follows a chain of consts', () => {
    const hits = scan(`
      const a = 'Copied to clipboard'
      const b = a
      toast('info', b)`)
    expect(hits).toHaveLength(1)
    expect(hits[0].kind).toBe('toast via b → a')
  })

  it('accepts translated copy and identifiers', () => {
    expect(
      scan(`
        const key = op === 'fetch' ? 'busy.syncFetching' : 'busy.syncPulling'
        ui.setBusy(interp(t(key), { name, n, total }), 'fetch')
        toast('success', t('act.done'))
        const verb = t('busy.rebasing')
        ui.setBusy(verb)
        setBusy(true)
        toast(kind, readableGitError(e))`)
    ).toEqual([])
  })

  it('ignores option objects and non-literal sources', () => {
    expect(
      scan(`
        ui.notify('error', msg, { key: \`fetch:\${path}\`, remote: true })
        let label = 'Working on it'
        label = t('x.y')
        ui.setBusy(label)
        ui.setBusy(props.label)`)
    ).toEqual([])
  })

  it('respects shadowing — an inner parameter is not the outer const', () => {
    expect(
      scan(`
        const label = 'Hardcoded words'
        function show(label: string) { toast('info', label) }`)
    ).toEqual([])
  })

  it('does not parse files that never call a sink', () => {
    expect(scan(`const greeting = 'Hello there'`)).toEqual([])
  })
})
