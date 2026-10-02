import { useState } from 'react'
import { FolderSearch } from 'lucide-react'
import { shellApi, gitApi, reposApi } from '../infrastructure/api'
import { useReposStore } from '../stores/repos'
import { useRepoStore } from '../stores/repo'
import { useSettingsStore } from '../stores/settings'
import { useT, interp } from '../i18n'

export function MissingRepository({ path }: { path: string }): React.JSX.Element {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const locate = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const chosen = await shellApi.selectDirectory(interp(t('repos.locateTitle'), { name: path.split('/').pop() ?? path }))
      if (!chosen) return
      // A restored tab may predate the repository registry. Validate the
      // selected folder and ensure the new path is indexed in that case too.
      await gitApi.open(chosen)
      await useReposStore.getState().locate(path, chosen)
      if (!useReposStore.getState().entries.some((r) => r.path === chosen)) await reposApi.remember(chosen)
      useSettingsStore.getState().repathRepo(path, chosen)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setBusy(false) }
  }
  return (
    <div className="welcome missing-repository">
      <div className="welcome-card">
        <FolderSearch size={28} aria-hidden="true" />
        <h1>{t('repos.missingTitle')}</h1>
        <p>{t('repos.missingBody')}</p>
        <code className="missing-repository-path">{path}</code>
        {error && <p role="alert">{error}</p>}
        <div className="missing-repository-actions">
          <button className="btn primary" disabled={busy} onClick={() => void locate()}>{t('repos.locate')}</button>
          <button className="btn" disabled={busy} onClick={() => void useRepoStore.getState().refresh(path)}>{t('modal.retry')}</button>
        </div>
      </div>
    </div>
  )
}
