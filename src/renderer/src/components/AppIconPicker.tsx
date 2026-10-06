import { APP_ICONS, normalizeAppIcon, type AppIconId } from '../../../shared/appIcons'
import { useSettingsStore } from '../stores/settings'
import { useT } from '../i18n'

// Bundler-resolved URLs for the same artwork the main process puts in the Dock.
const ARTWORK = import.meta.glob<string>('../../../../resources/app-icons/*.png', { eager: true, query: '?url', import: 'default' })
const artworkUrl = (id: AppIconId): string | undefined => ARTWORK[`../../../../resources/app-icons/${id}.png`]

export function AppIconPicker(): React.JSX.Element | null {
  const preference = useSettingsStore((s) => s.settings.appIcon)
  const update = useSettingsStore((s) => s.update)
  const t = useT()
  if (window.api.platform !== 'darwin') return null
  const { icon: current } = normalizeAppIcon(preference)
  return (
    <section className="app-icon-picker">
      <h4>{t('appIcon.title')}</h4>
      <p className="settings-hint">{t('appIcon.hint')}</p>
      <div className="app-icon-styles" role="group" aria-label={t('appIcon.title')}>
        {APP_ICONS.map((icon) => (
          <button key={icon} type="button" aria-pressed={current === icon}
            className={`app-icon-choice${current === icon ? ' selected' : ''}`}
            onClick={() => update((s) => ({ ...s, appIcon: { icon } }))}>
            {/* The tile carries the ring, sized to the squircle inside the artwork. */}
            <span className="app-icon-tile">
              <img src={artworkUrl(icon)} alt="" />
            </span>
            <span className="app-icon-label">{t(`appIcon.icon.${icon}`)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
