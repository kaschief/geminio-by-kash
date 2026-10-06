// The notifications bell, in the real app. Run after npm run build:
// node examples/screenshots/verify-notifications.cjs
//  - unseen successes show a dot; an unseen error a red count
//  - opening the list clears the badge; new rows keep their dot while it is open
//  - unseen errors count on the Dock icon, and clear when the list is opened
//  - with "Errors only", an error raised in the background makes a system notification
//  - the list survives a restart, without the credential a git error echoed
//  - a click outside the list only closes it
const { _electron } = require('playwright')
const fs = require('node:fs/promises')
const { execFileSync } = require('node:child_process')
const { join, resolve } = require('node:path')
const assert = require('node:assert/strict')
const ROOT = resolve(__dirname, '../..')
;(async () => {
  const tmp = await fs.mkdtemp('/tmp/geminio-notices-')
  const repo = join(tmp, 'repo')
  const userData = join(tmp, 'settings')
  await fs.mkdir(repo); await fs.mkdir(userData)
  execFileSync('git', ['-C', repo, 'init', '-q', '-b', 'main'])
  execFileSync('git', ['-C', repo, '-c', 'user.name=D', '-c', 'user.email=d@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'chore: start'])
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
    // Record system notifications instead of showing them, and let the app
    // believe it is in the background (Playwright reports even a hidden test
    // window as focused).
    await page.evaluate(() => {
      document.hasFocus = () => false
      window.__sent = []
      window.Notification = class { constructor(title, opts) { window.__sent.push({ title, body: opts.body }) } }
    })
    const toast = (kind, message) => page.evaluate(({ kind, message, p }) => window.__shot.ui.getState().toast(kind, message, { repoPath: p }), { kind, message, p: repo })
    const dock = () => app.evaluate(({ app }) => app.dock?.getBadge() ?? '')

    // 1. Successes: a dot, no number, nothing on the Dock.
    await toast('success', 'Pushed main to origin')
    await page.locator('.notif-dot').waitFor()
    assert.equal(await page.locator('.notif-badge').count(), 0)
    assert.equal(await dock(), '')

    // 2. An error: a red count, the Dock counts it, a system notification is sent
    //    (the test window is in the background, and the setting is "Errors only").
    await toast('error', 'fatal: unable to access https://kash:ghp_secret@github.com/a/b.git')
    await page.locator('.notif-badge').waitFor()
    assert.equal(await page.locator('.notif-badge').innerText(), '2')
    assert.equal(await dock(), '1')
    const sent = await page.evaluate(() => window.__sent)
    assert.equal(sent.length, 1, 'only the error was announced')
    assert.equal(sent[0].title, 'Demo', 'titled with the name the repository has in the app')

    // 3. Opening the list clears the badge and the Dock; the new rows keep their dot.
    await page.evaluate(() => { document.hasFocus = () => true })
    await page.locator('.notif-bell').click()
    await page.locator('.notice-panel').waitFor()
    assert.equal(await page.locator('.notif-badge, .notif-dot').count(), 0)
    assert.equal(await page.locator('.notice-row.unseen').count(), 2)
    for (let i = 0; i < 20 && (await dock()) !== ''; i++) await page.waitForTimeout(50)
    assert.equal(await dock(), '')

    // 4. A click outside only closes the list — the + button underneath stays unpressed.
    const plus = await page.locator('.tab-add').boundingBox()
    await page.mouse.click(plus.x + plus.width / 2, plus.y + plus.height / 2)
    await page.waitForTimeout(250)
    assert.equal(await page.locator('.notice-panel').count(), 0)
    assert.equal(await page.evaluate(() => !!window.__shot.ui.getState().contextMenu), false)

    // 5. The list survives a restart, without the credential.
    await app.close(); app = null
    ;({ app, page } = await launch())
    const kept = await page.evaluate(() => window.__shot.ui.getState().notices.map((n) => n.message))
    assert.deepEqual(kept, ['Pushed main to origin', 'fatal: unable to access https://github.com/a/b.git'])
    const raw = await page.evaluate(() => localStorage.getItem('geminio-notices-v1'))
    assert.ok(!raw.includes('ghp_secret'), 'no credential on disk')
    // Seen stays seen across the restart.
    assert.equal(await page.locator('.notif-badge, .notif-dot').count(), 0)

    console.log('PASS dot for successes, red count for errors; list clears the badge and the Dock; background error notified; click-away only closes; history survives a restart without credentials')
  } finally {
    await app?.close()
    await fs.rm(tmp, { recursive: true, force: true })
  }
})().catch((e) => { console.error(e); process.exitCode = 1 })
