// The notifications bell, in the real app, against real git: a shared origin,
// the app's clone, and a teammate's clone. Run after npm run build:
// node examples/screenshots/verify-notifications.cjs
//
// The bell keeps what you would act on and could have missed — not every toast:
//  1. a background fetch with nothing new says nothing at all
//  2. commits from a teammate arriving in the background: news (a dot, no red)
//  3. a background fetch failing three times: one row "× 3", red 1, Dock 1, a
//     system notification ("Errors only")
//  4. the next fetch that works resolves it: the red count goes
//  5. a fetch you start and watch: a toast, nothing kept
//  6. a push that fails while you watch: kept quietly, no badge
//  7. a click outside the list only closes it; GitHub items stop lighting the
//     bell once seen; the list survives a restart without credentials
const { _electron } = require('playwright')
const fs = require('node:fs/promises')
const { execFileSync } = require('node:child_process')
const { join, resolve } = require('node:path')
const assert = require('node:assert/strict')
const ROOT = resolve(__dirname, '../..')
;(async () => {
  const tmp = await fs.mkdtemp('/tmp/geminio-notices-')
  const origin = join(tmp, 'origin.git')
  const repo = join(tmp, 'repo')
  const mate = join(tmp, 'teammate')
  const userData = join(tmp, 'settings')
  await fs.mkdir(userData)
  const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, '-c', 'user.name=D', '-c', 'user.email=d@example.invalid', ...a], { encoding: 'utf8' }).trim()
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin])
  execFileSync('git', ['clone', '-q', origin, repo])
  git(repo, 'commit', '-q', '--allow-empty', '-m', 'chore: start'); git(repo, 'push', '-q', '-u', 'origin', 'main')
  execFileSync('git', ['clone', '-q', origin, mate])
  await fs.writeFile(join(userData, 'gitcito-settings.json'), JSON.stringify({ onboardingCompleted: true, autoFetchMinutes: 0, systemNotifications: 'errors', profiles: [{ id: 'default', name: 'Demo', ai: { enabled: false } }], activeProfileId: 'default', tabs: [{ id: 'repo', kind: 'repo', name: 'Demo', repos: [{ path: repo, name: 'Demo' }], activeRepoPath: repo }], activeTabId: 'repo' }))
  await fs.writeFile(join(userData, 'gitcito-keychain.json'), JSON.stringify({ consent: 'declined', explained: true }))
  const launch = async () => {
    const app = await _electron.launch({ args: [join(ROOT, 'out/main/index.js'), '--shot', '--background-test', `--user-data-dir=${userData}`], cwd: ROOT })
    const page = await app.firstWindow()
    page.on('pageerror', (err) => console.log('PAGEERROR', err.message))
    await page.waitForFunction(() => window.__shot?.ready)
    await page.evaluate((p) => window.__shot.waitForRepo(p), repo)
    return { app, page }
  }
  let app
  try {
    let page
    ;({ app, page } = await launch())
    // Record system notifications and toasts instead of showing them; each step
    // says whether the person is looking.
    await page.evaluate(() => {
      window.__sent = []
      window.Notification = class { constructor(title, opts) { window.__sent.push({ title, body: opts.body }) } }
      window.__looking = true
      document.hasFocus = () => window.__looking
      window.__toasts = []
      window.__shot.ui.subscribe((s) => s.toasts.forEach((t) => window.__toasts.some((x) => x.id === t.id) || window.__toasts.push(t)))
    })
    const looking = (v) => page.evaluate((v) => { window.__looking = v }, v)
    const state = () => page.evaluate(() => ({
      notices: window.__shot.ui.getState().notices.map((n) => ({ kind: n.kind, message: n.message, count: n.count ?? 1, resolved: !!n.resolved, quiet: !!n.quiet })),
      toasts: window.__toasts.splice(0).map((t) => t.kind),
      sent: window.__sent.length
    }))
    const backgroundFetch = () => page.evaluate((p) => window.__shot.repoActions.fetchAll(p, { skipEmpty: true, background: true }), repo)
    const dock = () => app.evaluate(({ app }) => app.dock?.getBadge() ?? '')
    const bell = async () => ({
      dot: await page.locator('.notif-dot').count(),
      red: (await page.locator('.notif-badge').count()) ? await page.locator('.notif-badge').innerText() : ''
    })

    // 1. Nothing new: nothing at all.
    await backgroundFetch()
    let s = await state()
    assert.deepEqual(s.notices, [], 'a quiet background fetch keeps nothing')
    assert.deepEqual(s.toasts, [], 'and shows no toast')

    // 2. A teammate pushes; the background fetch brings it — news, a dot.
    git(mate, 'commit', '-q', '--allow-empty', '-m', 'feat: theirs 1'); git(mate, 'commit', '-q', '--allow-empty', '-m', 'feat: theirs 2'); git(mate, 'push', '-q')
    await backgroundFetch()
    s = await state()
    assert.equal(s.notices.length, 1, JSON.stringify(s.notices))
    assert.match(s.notices[0].message, /2 commits you do not have — main is behind/)
    assert.deepEqual(await bell(), { dot: 1, red: '' }, 'news is a dot, never red')
    assert.equal(await dock(), '')

    // 3. The remote goes away; three background fetches fail: one row, × 3.
    git(repo, 'remote', 'set-url', 'origin', join(tmp, 'gone.git'))
    await looking(false)
    for (let i = 0; i < 3; i++) await backgroundFetch()
    s = await state()
    const failures = s.notices.filter((n) => n.kind === 'error')
    assert.equal(failures.length, 1, 'repeats collapse into one row')
    assert.equal(failures[0].count, 3)
    assert.deepEqual(s.toasts, [], 'background failures do not toast')
    assert.equal((await bell()).red, '1', 'one failure, counted once')
    assert.equal(await dock(), '1')
    assert.ok(s.sent >= 1, 'a system notification for the error')

    // 4. The remote is back: the next fetch that works resolves the failure.
    git(repo, 'remote', 'set-url', 'origin', origin)
    await backgroundFetch()
    s = await state()
    assert.equal(s.notices.find((n) => n.kind === 'error').resolved, true)
    assert.equal((await bell()).red, '', 'a fixed failure no longer counts')
    for (let i = 0; i < 20 && (await dock()) !== ''; i++) await page.waitForTimeout(50)
    assert.equal(await dock(), '')

    // 5. A fetch you start and watch: feedback only.
    await looking(true)
    const kept = (await state()).notices.length
    await page.evaluate((p) => window.__shot.repoActions.fetchAll(p), repo)
    s = await state()
    assert.equal(s.notices.length, kept, 'nothing kept for a fetch you watched')
    assert.deepEqual(s.toasts, ['success'])

    // 6. A push that fails while you watch: kept quietly, no badge.
    // Up to date first, so the push is a plain push (not the diverged prompt)
    // that then fails on the unreachable remote.
    git(repo, 'pull', '-q', '--ff-only')
    await fs.writeFile(join(repo, 'mine.txt'), 'mine\n'); git(repo, 'add', 'mine.txt'); git(repo, 'commit', '-q', '-m', 'feat: mine')
    git(repo, 'remote', 'set-url', 'origin', join(tmp, 'gone.git'))
    await page.evaluate((p) => window.__shot.repo.getState().refresh(p), repo)
    const before = await bell()
    await page.evaluate((p) => window.__shot.repoActions.push(p).catch(() => undefined), repo)
    await page.waitForTimeout(300)
    if (await page.evaluate(() => !!window.__shot.ui.getState().modal)) await page.evaluate(() => window.__shot.ui.getState().closeModal())
    s = await state()
    const pushFailed = s.notices.filter((n) => n.kind === 'error' && !n.resolved)
    assert.equal(pushFailed.length, 1, `the failed push is kept: ${JSON.stringify(s.notices)}`)
    assert.equal(pushFailed[0].quiet, true, 'a failure you watched is kept quietly')
    assert.ok(s.toasts.includes('error'), 'you saw it as a toast')
    assert.deepEqual(await bell(), before, 'and it does not add to the badge')
    git(repo, 'remote', 'set-url', 'origin', origin)

    // 7a. The list: open it, then a click outside only closes it.
    await page.locator('.notif-bell').click()
    await page.locator('.notice-panel').waitFor()
    await page.locator('.notice-resolved').first().waitFor()
    const plus = await page.locator('.tab-add').boundingBox()
    await page.mouse.click(plus.x + plus.width / 2, plus.y + plus.height / 2)
    await page.waitForTimeout(250)
    assert.equal(await page.locator('.notice-panel').count(), 0)
    assert.equal(await page.evaluate(() => !!window.__shot.ui.getState().contextMenu), false)

    // 7b. GitHub items light the dot until you look. With no GitHub account in
    //     this profile the app's poll resets the count; hold it against that.
    await page.evaluate(() => {
      const real = window.__shot.ui.getState().setGithubUnread
      window.__shot.ui.setState({ setGithubUnread: (n) => real(window.__gh ?? n) })
    })
    await page.evaluate(() => { window.__gh = 3; window.__shot.ui.getState().setGithubUnread(3) })
    await page.locator('.notif-dot').waitFor()
    await page.locator('.notif-bell').click()
    await page.locator('.notice-github-count', { hasText: '3' }).waitFor()
    await page.keyboard.press('Escape')
    assert.equal(await page.locator('.notif-dot, .notif-badge').count(), 0, 'seen GitHub items no longer light the bell')

    // 7c. A credential in a message never reaches the disk; the list survives a restart.
    await page.evaluate((p) => window.__shot.ui.getState().notify('error', 'fatal: unable to access https://kash:ghp_secret@github.com/a/b.git', { repoPath: p }), repo)
    const count = (await state()).notices.length
    await app.close(); app = null
    ;({ app, page } = await launch())
    const after = await page.evaluate(() => window.__shot.ui.getState().notices.map((n) => n.message))
    assert.equal(after.length, count)
    assert.ok(after.includes('fatal: unable to access https://github.com/a/b.git'))
    const raw = await page.evaluate(() => localStorage.getItem('geminio-notices-v1'))
    assert.ok(!raw.includes('ghp_secret'), 'no credential on disk')

    console.log('PASS quiet fetch keeps nothing; teammate commits are a dot; repeated failures collapse and count once (Dock, system notification); a fix resolves them; watched fetches only toast; a watched rejection is quiet; click-away only closes; GitHub seen; history survives a restart without credentials')
  } finally {
    await app?.close()
    await fs.rm(tmp, { recursive: true, force: true })
  }
})().catch((e) => { console.error(e); process.exitCode = 1 })
