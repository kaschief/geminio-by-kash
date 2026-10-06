// "Needs attention" end to end, in the real app. Run after npm run build:
// node examples/screenshots/verify-tab-attention.cjs
//  - with the order held, a file edited from outside in a repository that is not
//    the active tab moves that tab up promptly when the window comes back
//  - fresh edits outrank a commit left unpushed for a month
const { _electron } = require('playwright')
const fs = require('node:fs/promises')
const { execFileSync } = require('node:child_process')
const { join, resolve } = require('node:path')
const assert = require('node:assert/strict')
const ROOT = resolve(__dirname, '../..')
;(async () => {
  const tmp = await fs.mkdtemp('/tmp/geminio-attention-')
  const userData = join(tmp, 'settings')
  await fs.mkdir(userData)
  const origin = join(tmp, 'origin.git')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin])
  const make = async (name) => {
    const dir = join(tmp, name)
    execFileSync('git', ['clone', '-q', origin, dir])
    return dir
  }
  const git = (cwd, env, ...a) => execFileSync('git', ['-C', cwd, '-c', 'user.name=D', '-c', 'user.email=d@example.invalid', ...a], { encoding: 'utf8', env: { ...process.env, ...env } }).trim()
  // Seed origin once, then three clones.
  const seed = await make('seed')
  await fs.writeFile(join(seed, 'a.txt'), 'a\n'); git(seed, {}, 'add', '-A'); git(seed, {}, 'commit', '-qm', 'chore: start'); git(seed, {}, 'push', '-q', 'origin', 'main')
  const clean = await make('clean')
  const stale = await make('stale')
  const fresh = await make('fresh')
  // A commit left unpushed for a month.
  const month = new Date(Date.now() - 30 * 86400000).toISOString()
  await fs.writeFile(join(stale, 'old.txt'), 'old\n'); git(stale, {}, 'add', '-A')
  git(stale, { GIT_AUTHOR_DATE: month, GIT_COMMITTER_DATE: month }, 'commit', '-qm', 'feat: forgotten')
  const tabs = [clean, stale, fresh].map((p) => ({ id: p.split('/').pop(), kind: 'repo', name: p.split('/').pop(), repos: [{ path: p, name: p.split('/').pop() }], activeRepoPath: p }))
  await fs.writeFile(join(userData, 'gitcito-settings.json'), JSON.stringify({ onboardingCompleted: true, autoFetchMinutes: 0, tabSort: 'attention', profiles: [{ id: 'default', name: 'Demo', ai: { enabled: false } }], activeProfileId: 'default', tabs, activeTabId: 'fresh' }))
  await fs.writeFile(join(userData, 'gitcito-keychain.json'), JSON.stringify({ consent: 'declined', explained: true }))
  let app
  try {
    app = await _electron.launch({ args: [join(ROOT, 'out/main/index.js'), '--shot', '--background-test', `--user-data-dir=${userData}`], cwd: ROOT })
    const page = await app.firstWindow()
    page.on('pageerror', (err) => console.log('PAGEERROR', err.message))
    await page.waitForFunction(() => window.__shot?.ready)
    for (const p of [clean, stale, fresh]) await page.evaluate((p) => window.__shot.repo.getState().ensure(p), p)
    const order = () => page.evaluate(() => window.__shot.settings.getState().settings.tabs.map((t) => t.id))
    const until = async (check, what) => {
      for (let i = 0; i < 100; i++) { if (await check()) return; await page.waitForTimeout(100) }
      assert.fail(`timed out waiting for: ${what} — order ${JSON.stringify(await order())}`)
    }
    // Settled: the month-old unpushed commit is the only thing waiting.
    await until(async () => (await order())[0] === 'stale', 'the stale repo first while nothing else waits')

    // A file changes in "fresh" — NOT the active tab, so nothing watches it —
    // from an editor while the window is in the background. Nothing refreshes
    // it by hand: coming back to the window must be enough, and promptly.
    await page.evaluate(() => window.__shot.settings.getState().setActiveTab('clean'))
    await page.waitForTimeout(500)
    await fs.writeFile(join(fresh, 'a.txt'), 'edited just now\n')
    await page.waitForTimeout(300)
    const back = Date.now()
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await until(async () => (await order())[0] === 'fresh', 'the freshly edited repo first after coming back')
    const took = Date.now() - back
    assert.ok(took < 3000, `the strip caught up in ${took} ms — promptly, not "eventually"`)
    assert.deepEqual(await order(), ['fresh', 'stale', 'clean'])
    console.log(`  caught up ${took} ms after coming back`)

    console.log('PASS held Needs attention: a background edit moves its tab first on return, above a month-old unpushed commit')
  } finally {
    await app?.close()
    await fs.rm(tmp, { recursive: true, force: true })
  }
})().catch((e) => { console.error(e); process.exitCode = 1 })
