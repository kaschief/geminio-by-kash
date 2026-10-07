import { useEffect, useMemo, useState } from 'react'
import type { AppThemeColors } from '../../../shared/types'
import { useSettingsStore } from '../stores/settings'
import { findAppTheme } from './themes'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** The active app theme's colours, following macOS live when the mode is Auto. */
export function useThemeColors(): AppThemeColors {
  const themeId = useSettingsStore((s) => s.settings.appThemeId)
  const custom = useSettingsStore((s) => s.settings.customAppThemes)
  const mode = useSettingsStore((s) => s.settings.themeMode)
  const [osDark, setOsDark] = useState(() => window.matchMedia(DARK_QUERY).matches)

  useEffect(() => {
    if (mode !== 'auto') return undefined
    const mq = window.matchMedia(DARK_QUERY)
    const onChange = (): void => setOsDark(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  return useMemo(() => {
    const theme = findAppTheme(themeId, custom ?? [])
    const dark = mode === 'auto' ? osDark : mode === 'dark'
    return dark ? theme.dark : theme.light
  }, [themeId, custom, mode, osDark])
}
