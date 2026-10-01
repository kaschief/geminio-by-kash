import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { APP_ICON_STYLES, APP_ICON_COLORS, normalizeAppIcon, appIconSvg, appIconColor, githubAvatarUrl, type AppIconStyle } from '../../../shared/appIcons'
import classicIcon from '../../../../resources/icon.png'
import { useSettingsStore } from '../stores/settings'
import { useGitHubAccountStore } from '../stores/githubAccount'
import { useUIStore } from '../stores/ui'
import { useT } from '../i18n'

export function AppIconPicker(): React.JSX.Element | null {
  const preference = useSettingsStore((s) => s.settings.appIcon)
  const update = useSettingsStore((s) => s.update)
  const t = useT()
  const profile = useSettingsStore((s) => s.activeProfile())
  const entry = useGitHubAccountStore((s) => s.entries[profile.id])
  const account = entry?.token === profile.githubToken ? entry.account : null
  const photo = githubAvatarUrl(account?.avatarUrl ?? preference?.githubAvatarUrl)
  const [photoBusy, setPhotoBusy] = useState(false)
  const choose = async (style: AppIconStyle): Promise<void> => {
    if (style !== 'github') { update((s) => ({ ...s, appIcon: { ...current, style } })); return }
    if (!photo) return
    setPhotoBusy(true)
    try {
      const url = await window.api.appIcon.prepareGithub(photo)
      update((s) => ({ ...s, appIcon: { ...current, style: 'github', githubAvatarUrl: url } }))
    } catch { useUIStore.getState().toast('error', t('appIcon.photoFailed')) }
    finally { setPhotoBusy(false) }
  }
  if (window.api.platform !== 'darwin') return null
  const current = normalizeAppIcon(preference)
  return (
    <section className="app-icon-picker">
      <h4>{t('appIcon.title')}</h4>
      <p className="settings-hint">{t('appIcon.hint')}</p>
      <div className="app-icon-styles" role="group" aria-label={t('appIcon.title')}>
        {APP_ICON_STYLES.map((style) => (
          <button key={style} type="button" aria-pressed={current.style === style}
            className={`app-icon-choice${current.style === style ? ' selected' : ''}${style === 'github' ? ' github-photo' : ''}`}
            disabled={photoBusy || (style === 'github' && !photo)}
            title={style === 'github' && !photo ? t('appIcon.photoHint') : undefined}
            onClick={() => void choose(style)}>
            <img src={style === 'classic' ? classicIcon : style === 'github' ? photo ?? classicIcon : `data:image/svg+xml,${encodeURIComponent(appIconSvg(style, current.color))}`} alt="" />
            <span>{t(`appIcon.style.${style}`)}</span>
            {style === 'github' && photoBusy && <Loader2 size={14} className="app-icon-check spin" />}
            {current.style === style && <Check size={13} className="app-icon-check" />}
          </button>
        ))}
      </div>
      <div className="app-icon-colors" role="group" aria-label={t('appIcon.color')}>
        {APP_ICON_COLORS.map((color) => (
          <button key={color} type="button" title={t(`appIcon.color.${color}`)} aria-label={t(`appIcon.color.${color}`)}
            aria-pressed={current.color === color} disabled={current.style === 'classic' || current.style === 'github' || photoBusy}
            style={{ background: appIconColor(color) }}
            onClick={() => update((s) => ({ ...s, appIcon: { ...current, color } }))}>
            {current.color === color && <Check size={14} />}
          </button>
        ))}
      </div>
    </section>
  )
}
