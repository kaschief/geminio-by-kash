import { useGitHubAccountStore } from '../stores/githubAccount'
import { useEffect, useMemo, useState } from 'react'
import { Blobatar } from 'blobatar/react'
import { happy, idle, mad, sad, scared, sick, sleepy, thinking, unsure } from 'blobatar/expression'
import { useSettingsStore } from '../stores/settings'
import { accountAvatar, generatedAvatar, gravatarUrl } from '../lib/avatar'
import type { Mood } from '../lib/repoMood'

interface AvatarProps {
  ownAccount?: boolean
  profileId?: string
  email?: string
  name?: string
  size?: number
  className?: string
  title?: string
  /**
   * Which pose the generated fallback holds. Omitted everywhere but the
   * title-bar profile avatar: a pose costs inline SVG instead of a cached
   * `<img>`, and a commit author from three years ago has no opinion about
   * today's working tree.
   */
  mood?: Mood
  /** Idle motion. Only honoured alongside `mood`, for the same reason. */
  animate?: boolean
}

// Poses are values rather than names so the ones nobody imports stay out of the
// bundle — blobatar's core carries no pose code at all.
const POSES = { idle, happy, sad, mad, thinking, scared, unsure, sick, sleepy }

/**
 * A person avatar. When photo lookup is enabled, prefers GitHub then Gravatar,
 * otherwise a deterministic generated avatar derived from the email/name.
 */
export function Avatar({
  email,
  ownAccount = false,
  profileId,
  name,
  size = 24,
  className,
  title,
  mood,
  animate
}: AvatarProps): React.JSX.Element {
  const enabled = useSettingsStore((s) => s.settings.commitAvatars ?? true)
  const profile = useSettingsStore((s) => s.settings.profiles.find((p) => p.id === profileId) ?? s.activeProfile())
  const entry = useGitHubAccountStore((s) => s.entries[profile.id])
  const account = entry?.token === profile.githubToken ? entry.account : null
  const githubPhoto = enabled ? (ownAccount ? account?.avatarUrl ?? null : accountAvatar(account, email)) : null
  const seed = (email || name || '?').toLowerCase()
  const gen = useMemo(() => generatedAvatar(seed), [seed])
  const [photo, setPhoto] = useState<string | null>(null)
  const [failedGithubPhoto, setFailedGithubPhoto] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setPhoto(null)
    if (!enabled) return
    if (githubPhoto && githubPhoto !== failedGithubPhoto) {
      setPhoto(githubPhoto)
      return
    }
    if (!email) return
    void gravatarUrl(email, Math.round(size * 2)).then((u) => {
      if (alive) setPhoto(u)
    })
    return () => {
      alive = false
    }
  }, [email, size, enabled, githubPhoto, failedGithubPhoto])

  // An expressive blob is inline SVG, which a photo cannot be — so a Gravatar
  // still wins, and the pose is what you get when there is none.
  const expressive = mood && !photo

  return (
    <span
      className={`ava${className ? ` ${className}` : ''}`}
      title={title ?? email ?? name}
      // The background is the static blob; with a pose the SVG paints itself.
      style={{ width: size, height: size, backgroundImage: expressive ? undefined : `url("${gen}")` }}
    >
      {expressive && (
        <Blobatar
          name={seed}
          background="circle"
          expression={POSES[mood]}
          // `animate` has to be absent, not false: the prop union switches
          // rendering mode on its presence.
          {...(animate ? ({ animate: 'always' } as const) : {})}
        />
      )}
      {photo && (
        <img src={photo} alt="" loading="lazy" draggable={false} onError={() => {
          if (photo === githubPhoto) setFailedGithubPhoto(photo)
          setPhoto(null)
        }} />
      )}
    </span>
  )
}
