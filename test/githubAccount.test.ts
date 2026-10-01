import { beforeEach, describe, expect, it, vi } from 'vitest'

const whoAmI = vi.fn()
vi.mock('../src/renderer/src/infrastructure/api', () => ({ hostingApi: { whoAmI }, isShotMode: () => false }))
const { refreshGitHubAccount, useGitHubAccountStore } = await import('../src/renderer/src/stores/githubAccount')

beforeEach(() => {
  whoAmI.mockReset()
  useGitHubAccountStore.setState({ entries: {} })
})

describe('GitHub account session', () => {
  it('shares one lookup across callers and keeps profiles separate', async () => {
    let finish!: (value: { login: string }) => void
    whoAmI.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const profile = { id: 'one', githubToken: '' }
    const a = refreshGitHubAccount(profile)
    const b = refreshGitHubAccount(profile)
    expect(whoAmI).toHaveBeenCalledTimes(1)
    finish({ login: 'alice' })
    await Promise.all([a, b])
    whoAmI.mockResolvedValueOnce({ login: 'bob' })
    await refreshGitHubAccount({ id: 'two', githubToken: 'other' })
    expect(useGitHubAccountStore.getState().entries.one.account?.login).toBe('alice')
    expect(useGitHubAccountStore.getState().entries.two.account?.login).toBe('bob')
  })

  it('ignores an old token response arriving after a profile changes credentials', async () => {
    let finish!: (value: { login: string }) => void
    whoAmI.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const stale = refreshGitHubAccount({ id: 'one', githubToken: 'old' })
    whoAmI.mockResolvedValueOnce({ login: 'new-user' })
    await refreshGitHubAccount({ id: 'one', githubToken: 'new' })
    finish({ login: 'old-user' })
    await stale
    expect(useGitHubAccountStore.getState().entries.one.account?.login).toBe('new-user')
  })

  it('clears the cached identity after sign-out or an authentication failure', async () => {
    whoAmI.mockResolvedValueOnce({ login: 'alice' })
    const profile = { id: 'one', githubToken: '' }
    await refreshGitHubAccount(profile)
    whoAmI.mockRejectedValueOnce(new Error('signed out'))
    await refreshGitHubAccount(profile)
    expect(useGitHubAccountStore.getState().entries.one.account).toBeNull()
  })
})
