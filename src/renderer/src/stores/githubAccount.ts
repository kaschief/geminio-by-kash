import { useEffect } from 'react'
import { create } from 'zustand'
import type { ConnectedAccount, Profile } from '../../../shared/types'
import { hostingApi, isShotMode } from '../infrastructure/api'

interface AccountEntry {
  token: string
  account: ConnectedAccount | null
}

/** Provider identity is session state, never a replacement for Git author config. */
export const useGitHubAccountStore = create<{ entries: Record<string, AccountEntry> }>(() => ({ entries: {} }))
const pending = new Map<string, { token: string; promise: Promise<void> }>()

export function setGitHubAccount(profile: Pick<Profile, 'id' | 'githubToken'>, account: ConnectedAccount | null): void {
  useGitHubAccountStore.setState((s) => ({
    entries: { ...s.entries, [profile.id]: { token: profile.githubToken, account } }
  }))
}

export function refreshGitHubAccount(profile: Pick<Profile, 'id' | 'githubToken'>): Promise<void> {
  const current = pending.get(profile.id)
  if (current?.token === profile.githubToken) return current.promise
  const request = { token: profile.githubToken, promise: Promise.resolve() }
  request.promise = hostingApi.whoAmI('github', profile.githubToken)
    .then((account) => {
      if (pending.get(profile.id) === request) setGitHubAccount(profile, account)
    })
    .catch(() => {
      if (pending.get(profile.id) === request) setGitHubAccount(profile, null)
    })
    .finally(() => {
      if (pending.get(profile.id) === request) pending.delete(profile.id)
    })
  pending.set(profile.id, request)
  return request.promise
}

/** One refresh loop in App; every avatar reads the shared result. */
export function useGitHubConnection(profile: Profile, loaded: boolean): void {
  useEffect(() => {
    if (!loaded || isShotMode()) return
    void refreshGitHubAccount(profile)
    const timer = window.setInterval(() => void refreshGitHubAccount(profile), 5 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [loaded, profile.id, profile.githubToken])
}
