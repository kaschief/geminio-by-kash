import { ArrowUpFromLine, CircleDot, PaintBucket, PanelLeft, RotateCcw } from 'lucide-react'
import {
  defaultGraphStyle,
  type GraphRowAccent,
  type GraphRowStyle,
  type GraphUnpushedMark,
  type StatusDotColors
} from '../../../shared/types'
import { normalizeRowAccent, ROW_COLOR_THEME } from '../graph/style'
import { GRAPH_COLORS } from '../graph/layout'
import { useSettingsStore } from '../stores/settings'
import { useT, type TranslationKey } from '../i18n'

const ROW_STYLES: { id: GraphRowStyle; labelKey: TranslationKey }[] = [
  { id: 'off', labelKey: 'settings.graphRowOff' },
  { id: 'ring', labelKey: 'settings.graphRowRing' },
  { id: 'ring-bar', labelKey: 'settings.graphRowRingBar' },
  { id: 'full', labelKey: 'settings.graphRowFull' }
]

const UNPUSHED: { id: GraphUnpushedMark; labelKey: TranslationKey }[] = [
  { id: 'off', labelKey: 'settings.graphRowOff' },
  { id: 'dashed', labelKey: 'settings.graphUnpushedDashed' },
  { id: 'dashed-arrow', labelKey: 'settings.graphUnpushedArrow' }
]

/** The theme's own dot colours, offered as the starting point of a custom pick. */
const DOT_DEFAULTS = { changes: '#8b8fa3', conflict: '#e5a23d', push: GRAPH_COLORS[0] } as const satisfies Record<keyof StatusDotColors, string>

function Switch<T extends string>({
  options,
  value,
  onChange,
  label
}: {
  options: { id: T; labelKey: TranslationKey }[]
  value: T
  onChange: (next: T) => void
  label: string
}): React.JSX.Element {
  const t = useT()
  return (
    <div className="theme-mode-switch" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          className={`theme-mode-btn ${value === o.id ? 'active' : ''}`}
          onClick={() => onChange(o.id)}
        >
          <span>{t(o.labelKey)}</span>
        </button>
      ))}
    </div>
  )
}

/** Ring / haze / bar, their colour, and how unpushed commits stand out. */
export function GraphRowAccentControls(): React.JSX.Element {
  const t = useT()
  const update = useSettingsStore((s) => s.update)
  const raw = useSettingsStore((s) => s.settings.graphStyle?.rowAccent)
  const accent = normalizeRowAccent(raw)
  const customColor = accent.color && accent.color !== ROW_COLOR_THEME ? accent.color : null
  const rowColorChoice = accent.color === ROW_COLOR_THEME ? 'theme' : customColor ? 'custom' : 'lane'
  const set = (patch: Partial<GraphRowAccent>): void =>
    update((s) => {
      const style = s.graphStyle ?? defaultGraphStyle()
      return { ...s, graphStyle: { ...style, rowAccent: { ...normalizeRowAccent(style.rowAccent), ...patch } } }
    })

  return (
    <>
      <h4 style={{ marginTop: 18 }}><PanelLeft size={14} /> {t('settings.graphRows')}</h4>
      <Switch options={ROW_STYLES} value={accent.style} onChange={(style) => set({ style })} label={t('settings.graphRows')} />

      <h4 style={{ marginTop: 18 }}><PaintBucket size={14} /> {t('settings.graphRowColor')}</h4>
      <div className="swatch-line">
        <Switch
          options={[
            { id: 'lane', labelKey: 'settings.graphRowColorLane' },
            { id: 'theme', labelKey: 'settings.graphRowColorTheme' },
            { id: 'custom', labelKey: 'settings.graphRowColorCustom' }
          ]}
          value={rowColorChoice}
          onChange={(v) =>
            set({ color: v === 'lane' ? null : v === 'theme' ? ROW_COLOR_THEME : customColor ?? GRAPH_COLORS[0] })
          }
          label={t('settings.graphRowColor')}
        />
        {customColor && (
          <input
            type="color"
            className="swatch-input"
            value={customColor}
            aria-label={t('settings.graphRowColorCustom')}
            onChange={(e) => set({ color: e.target.value })}
          />
        )}
      </div>

      <h4 style={{ marginTop: 18 }}><ArrowUpFromLine size={14} /> {t('settings.graphUnpushed')}</h4>
      <Switch options={UNPUSHED} value={accent.unpushed} onChange={(unpushed) => set({ unpushed })} label={t('settings.graphUnpushed')} />
      {accent.unpushed !== 'off' && (
        <label className="settings-toggle-card swatch-toggle">
          <input type="checkbox" checked={accent.unpushedRow} onChange={(e) => set({ unpushedRow: e.target.checked })} />
          <span className="settings-toggle-control" aria-hidden="true">
            <span className="settings-toggle-thumb" />
          </span>
          <span className="settings-toggle-copy">
            <strong>{t('settings.graphUnpushedRow')}</strong>
          </span>
        </label>
      )}
    </>
  )
}

/** Repository-tab status dots — Settings → Themes → Theme. */
export function StatusDotControls(): React.JSX.Element {
  const t = useT()
  const update = useSettingsStore((s) => s.update)
  const dots = useSettingsStore((s) => s.settings.statusDotColors) ?? { changes: null, conflict: null }
  const set = (key: keyof StatusDotColors, value: string | null): void =>
    update((s) => ({ ...s, statusDotColors: { ...(s.statusDotColors ?? { changes: null, conflict: null }), [key]: value } }))

  const dot = (key: keyof StatusDotColors, labelKey: TranslationKey): React.JSX.Element => (
    <span className="swatch-field">
      <input
        type="color"
        className="swatch-input"
        value={dots[key] ?? DOT_DEFAULTS[key]}
        aria-label={t(labelKey)}
        onChange={(e) => set(key, e.target.value)}
      />
      <span>{t(labelKey)}</span>
      {dots[key] && (
        <button
          type="button"
          className="theme-icon-btn"
          title={t('settings.colorThemeDefault')}
          aria-label={t('settings.colorThemeDefault')}
          onClick={() => set(key, null)}
        >
          <RotateCcw size={12} />
        </button>
      )}
    </span>
  )

  return (
    <section className="status-dot-settings">
      <h4><CircleDot size={14} /> {t('settings.statusDots')}</h4>
      <p className="settings-hint">{t('settings.statusDotsHint')}</p>
      <div className="swatch-line">
        {dot('changes', 'settings.statusDotChanges')}
        {dot('conflict', 'settings.statusDotConflict')}
        {dot('push', 'settings.statusDotPush')}
      </div>
    </section>
  )
}
