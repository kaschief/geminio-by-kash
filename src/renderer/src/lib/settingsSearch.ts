import index from './settingsSearch.generated.json'
import type { TranslationKey } from '../i18n/en'

const aliases: Record<string, string> = {
  general: 'VS Code vscode Visual Studio Code Cursor Windsurf Sublime external editor default app terminal language zoom fetch refresh',
  themes: 'appearance app icon dock github photo picture colour color light dark theme',
  files: 'elastic scroll scrolling pull gesture threshold speed fast quick deliberate diff minimap',
  layout: 'panels sidebar columns sizing position',
  security: 'password credentials keychain SSH signing GPG',
  integrations: 'GitHub GitLab Bitbucket Azure account login authentication token',
  workspaces: 'workspace groups repositories tabs'
}
export interface SettingsSearchResult { page: string; tab?: string; score: number }
export function searchSettings(query: string, translate: (key: TranslationKey) => string): SettingsSearchResult[] {
  const q = query.trim().toLocaleLowerCase()
  if (!q) return []
  return index.map((entry) => {
    const copy = entry.keys.map(key => translate(key as TranslationKey).toLocaleLowerCase())
    const count = copy.filter(text => text.includes(q)).length
    const exact = copy.some(text => text === q) ? 10 : 0
    const alias = !entry.tab || entry.tab === 'theme' ? (aliases[entry.page] ?? '').toLocaleLowerCase().includes(q) : false
    return { page: entry.page, tab: 'tab' in entry ? entry.tab : undefined, score: count + exact + (alias ? 1 : 0) }
  }).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score)
}
