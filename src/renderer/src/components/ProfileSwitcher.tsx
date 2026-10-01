import { useSettingsStore } from '../stores/settings'
import { useRepoStore } from '../stores/repo'
import { useT, interp } from '../i18n'
import { repoMood } from '../lib/repoMood'
import { Avatar } from './Avatar'

/** Account identity in the title bar; account configuration lives in Settings. */
export function ProfileSwitcher(): React.JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const activeRepo = useSettingsStore((s) => s.activeRepo)
  const t = useT()
  const active = settings.profiles.find((p) => p.id === settings.activeProfileId) ?? settings.profiles[0]
  const repo = activeRepo()
  const status = useRepoStore((s) => (repo ? s.repos[repo.path]?.status ?? null : null))
  const mergeState = useRepoStore((s) => (repo ? s.repos[repo.path]?.mergeState ?? null : null))
  const stashCount = useRepoStore((s) => (repo ? s.repos[repo.path]?.stashes.length ?? 0 : 0))
  const newestCommitAt = useRepoStore((s) => (repo ? s.repos[repo.path]?.commits[0]?.date ?? null : null))
  const hint = repoMood({ status, mergeState, stashCount, newestCommitAt, now: Date.now() })
  const moodText = hint.key ? interp(t(hint.key), hint.vars ?? {}) : null

  if (!active) return <></>
  return (
    <div className="profile-switcher profile-identity" title={moodText ? interp(t('profile.moodTitle'), { name: active.name, mood: moodText }) : active.name}>
      <Avatar ownAccount profileId={active.id} email={active.gitEmail} name={active.name} size={26} mood={hint.mood} animate={settings.avatarMotion ?? true} />
      <span className="profile-switcher-name">{active.name}</span>
    </div>
  )
}
