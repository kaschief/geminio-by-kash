import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The credential helper is mocked here, not run for real: the behaviour under
 * test is how often Geminio *asks* git, and a real osxkeychain would raise the
 * very dialog this suite exists to keep quiet.
 */
type ExecCallback = (err: (Error & { killed?: boolean }) | null, stdout: string) => void
interface Spawn {
  args: string[]
  input: string
  answer: ExecCallback
}

const spawns: Spawn[] = []

vi.mock('child_process', () => ({
  execFile: (_cmd: string, args: string[], _opts: unknown, cb: ExecCallback) => {
    const spawn: Spawn = { args, input: '', answer: cb }
    spawns.push(spawn)
    return { stdin: { end: (input: string) => (spawn.input = input) } }
  }
}))

const { credentialFor, clearCredentialCache } = await import('../src/main/credentials')

const URL = 'https://github.com/acme/widgets.git'
const FIVE_MINUTES = 5 * 60 * 1000

const fills = (): Spawn[] => spawns.filter((s) => s.args.includes('fill'))
const answerOk = (s: Spawn): void => s.answer(null, 'protocol=https\nhost=github.com\nusername=me\npassword=tok\n')
const answerTimeout = (s: Spawn): void => s.answer(Object.assign(new Error('timed out'), { killed: true }), '')
const answerFailed = (s: Spawn): void => s.answer(Object.assign(new Error('exit 1'), { killed: false }), '')

/** Let the promise chain between `credentialFor` and the spawn settle. */
const flush = (): Promise<void> => new Promise((r) => setImmediate(r))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  spawns.length = 0
  clearCredentialCache()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('credentialFor — background polling', () => {
  it('shares one git process between concurrent background callers', async () => {
    const calls = [credentialFor(URL), credentialFor(URL), credentialFor(URL), credentialFor(URL)]
    await flush()
    expect(fills()).toHaveLength(1)

    answerOk(fills()[0])
    const results = await Promise.all(calls)
    expect(results.every((c) => c?.password === 'tok')).toBe(true)
    expect(fills()).toHaveLength(1)
  })

  it('does not retry a timed-out background lookup, even after the cache expires', async () => {
    const first = credentialFor(URL)
    await flush()
    answerTimeout(fills()[0])
    expect(await first).toBeNull()

    vi.setSystemTime(Date.now() + FIVE_MINUTES + 1)
    expect(await credentialFor(URL)).toBeNull()
    await flush()
    expect(fills()).toHaveLength(1)
  })

  it('still runs an interactive lookup for a blocked key, and a success lifts the block', async () => {
    const background = credentialFor(URL)
    await flush()
    answerTimeout(fills()[0])
    await background

    const interactive = credentialFor(URL, { interactive: true })
    await flush()
    expect(fills()).toHaveLength(2)
    expect(fills()[1].args).not.toContain('credential.interactive=false')
    answerOk(fills()[1])
    expect((await interactive)?.password).toBe('tok')

    // Unblocked: once the fresh credential expires, background polling asks again.
    vi.setSystemTime(Date.now() + FIVE_MINUTES + 1)
    const later = credentialFor(URL)
    await flush()
    expect(fills()).toHaveLength(3)
    answerOk(fills()[2])
    expect((await later)?.password).toBe('tok')
  })

  it('retries a plain failure once the cache expires', async () => {
    const first = credentialFor(URL)
    await flush()
    answerFailed(fills()[0])
    expect(await first).toBeNull()

    // Inside the TTL the cached miss is honoured.
    expect(await credentialFor(URL)).toBeNull()
    expect(fills()).toHaveLength(1)

    vi.setSystemTime(Date.now() + FIVE_MINUTES + 1)
    const retry = credentialFor(URL)
    await flush()
    expect(fills()).toHaveLength(2)
    answerOk(fills()[1])
    expect((await retry)?.password).toBe('tok')
  })

  it('drops in-flight lookups on clearCredentialCache', async () => {
    const stale = credentialFor(URL)
    await flush()
    clearCredentialCache()

    const fresh = credentialFor(URL)
    await flush()
    expect(fills()).toHaveLength(2)

    // The stale lookup timing out must not block the key for the fresh one.
    answerTimeout(fills()[0])
    await stale
    answerOk(fills()[1])
    expect((await fresh)?.password).toBe('tok')
    expect(await credentialFor(URL)).not.toBeNull()
  })
})

describe('GitHub CLI account reuse', () => {
  it('keeps an explicitly configured token authoritative', async () => {
    const { apiToken } = await import('../src/main/credentials')
    expect(await apiToken(URL, ' explicit ')).toEqual({ token: 'explicit' })
    expect(spawns).toHaveLength(0)
  })

  it('shares the CLI lookup, keeps its token out of Git helpers, and refreshes on reconnect', async () => {
    const { apiToken } = await import('../src/main/credentials')
    const first = apiToken(URL, '')
    const second = apiToken(URL, '')
    await flush()
    expect(spawns).toHaveLength(1)
    expect(spawns[0].args).toEqual(['auth', 'token', '--hostname', 'github.com'])
    spawns[0].answer(null, 'cli-token\n')
    expect(await first).toEqual({ token: 'cli-token' })
    expect(await second).toEqual({ token: 'cli-token' })
    expect(fills()).toHaveLength(0)
    const reconnect = apiToken(URL, '', { interactive: true })
    await flush()
    spawns[1].answer(null, 'new-token\n')
    expect(await reconnect).toEqual({ token: 'new-token' })
  })

  it('falls back to Git when the CLI is missing or signed out', async () => {
    const { apiToken } = await import('../src/main/credentials')
    const result = apiToken(URL, '')
    await flush()
    answerFailed(spawns[0])
    await flush()
    answerOk(fills()[0])
    expect(await result).toEqual({ token: 'tok', cred: { username: 'me', password: 'tok' } })
  })

  it('never borrows a GitHub token for another host', async () => {
    const { apiToken } = await import('../src/main/credentials')
    const result = apiToken('https://github.com.example.org/acme/repo', '')
    await flush()
    expect(spawns.every((s) => !s.args.includes('token'))).toBe(true)
    answerFailed(fills()[0])
    expect(await result).toBeNull()
  })
})


describe('GitHub CLI credentials for SSH remotes', () => {
  it.each(['git@github.com:acme/widgets.git', 'ssh://git@github.com/acme/widgets.git'])(
    'reuses the hosting login for %s without changing SSH transport', async (url) => {
      const { apiToken } = await import('../src/main/credentials')
      const result = apiToken(url, '')
      await flush()
      expect(spawns[0].args).toEqual(['auth', 'token', '--hostname', 'github.com'])
      spawns[0].answer(null, 'cli-token')
      expect(await result).toEqual({ token: 'cli-token' })
      expect(fills()).toHaveLength(0)
    }
  )
})
