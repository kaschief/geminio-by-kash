// An open working-change file follows the file when something outside the app
// (a terminal, an agent) stages, commits or discards it. Run after npm run build:
// node examples/screenshots/verify-wip-follow.cjs
const { _electron } = require('playwright')
const fs = require('node:fs/promises')
const { execFileSync } = require('node:child_process')
const { join, resolve } = require('node:path')
const assert = require('node:assert/strict')
const ROOT = resolve(__dirname, '../..')
;(async () => {
  const tmp = await fs.mkdtemp('/tmp/geminio-wip-follow-')
  const repo = join(tmp, 'repo')
  const userData = join(tmp, 'settings')
  await fs.cp(join(ROOT, 'examples/playground/line-staging'), repo, { recursive: true })
  await fs.mkdir(userData)
  const git = (...args) => execFileSync('git', ['-C', repo, '-c', 'user.name=Demo', '-c', 'user.email=demo@example.com', ...args], { encoding: 'utf8' })
  git('add', '-A'); git('commit', '--allow-empty', '-qm', 'Clean baseline')
  await fs.writeFile(join(repo, 'followed.txt'), 'one\ntwo\n'); await fs.writeFile(join(repo, 'dropped.txt'), 'keep\n')
  git('add', '-A'); git('commit', '-qm', 'Add fixture files')
  await fs.writeFile(join(userData, 'gitcito-settings.json'), JSON.stringify({ onboardingCompleted: true, autoFetchMinutes: 0, profiles: [{ id: 'default', name: 'Demo', ai: { enabled: false } }], activeProfileId: 'default', tabs: [{ id: 'repo', kind: 'repo', name: 'Demo', repos: [{ path: repo, name: 'Demo' }], activeRepoPath: repo }], activeTabId: 'repo' }))
  await fs.writeFile(join(userData, 'gitcito-keychain.json'), JSON.stringify({ consent: 'declined', explained: true }))
  let app
  try {
    app = await _electron.launch({ args: [join(ROOT, 'out/main/index.js'), '--shot', '--background-test', `--user-data-dir=${userData}`], cwd: ROOT })
    const page = await app.firstWindow()
    page.on('pageerror', (err) => console.log('PAGEERROR', err.message))
    await page.waitForFunction(() => window.__shot?.ready)
    await page.evaluate((p) => window.__shot.waitForRepo(p), repo)
    const refresh = () => page.evaluate((p) => window.__shot.repo.getState().refresh(p), repo)
    const source = () => page.evaluate(() => window.__shot.ui.getState().fileView?.source ?? null)
    const until = async (check, what) => {
      // 10 s: a machine still busy after a build can take longer than 5.
      for (let i = 0; i < 200; i++) { if (await check()) return; await page.waitForTimeout(50) }
      assert.fail(`timed out waiting for: ${what} (source now ${JSON.stringify(await source())})`)
    }
    const open = (file) => page.evaluate(({ p, file }) => window.__shot.ui.getState().setFileView({ repoPath: p, file, source: { type: 'wip', staged: false, untracked: false }, mode: 'diff' }), { p: repo, file })

    // 1. Open an unstaged change, as clicking it in the composer does.
    await fs.writeFile(join(repo, 'followed.txt'), 'one\ntwo\nthree\n'); await refresh()
    await page.evaluate((p) => window.__shot.repo.getState().select(p, { type: 'wip' }), repo)
    await open('followed.txt')
    await page.locator('.fv-chip.unstaged').waitFor()
    await page.locator('.diff-viewer').waitFor()

    // 2. Staged outside the app: the view moves to the staged side and still shows the change.
    git('add', 'followed.txt'); await refresh()
    await until(async () => (await source())?.staged === true, 'view flips to staged')
    await page.locator('.fv-chip.staged').waitFor()
    assert.equal(await page.locator('.diff-empty').count(), 0, 'the staged side has a diff to show')

    // 3. Committed outside the app: the view follows the file into the new commit instead of going blank.
    git('commit', '-qm', 'Commit from outside'); const head = git('rev-parse', 'HEAD').trim(); await refresh()
    await until(async () => (await source())?.type === 'commit', 'view follows into the commit')
    assert.deepEqual(await source(), { type: 'commit', hash: head })
    await page.locator('.diff-viewer').waitFor()
    assert.equal(await page.locator('.diff-empty').count(), 0, 'the commit diff is shown')
    // Details was on the working changes, so it moves to the same commit rather than closing.
    const selected = () => page.evaluate((p) => window.__shot.repo.getState().repos[p].selected, repo)
    await until(async () => (await selected())?.type === 'commit', 'details follows into the commit')
    assert.deepEqual(await selected(), { type: 'commit', hash: head })
    await page.locator('.right-panel').waitFor()

    // 3a. The commit is undone (the app's own undo is a soft reset): the view
    // and Details go back to the staged change instead of an orphaned commit.
    git('reset', '--soft', 'HEAD~1'); await refresh()
    await until(async () => (await source())?.type === 'wip', 'view returns to the working change')
    assert.deepEqual(await source(), { type: 'wip', staged: true, untracked: false })
    await page.locator('.fv-chip.staged').waitFor()
    assert.equal((await selected())?.type, 'wip', 'Details returns to the working changes')

    // 3a'. Committed again, then amended: the view moves on to the rewritten HEAD.
    git('commit', '-qm', 'Commit again'); await refresh()
    await until(async () => (await source())?.type === 'commit', 'view follows into the recommit')
    git('commit', '--amend', '-qm', 'Reworded'); const amended = git('rev-parse', 'HEAD').trim(); await refresh()
    await until(async () => (await source())?.hash === amended, 'view follows the amend')
    assert.deepEqual(await selected(), { type: 'commit', hash: amended }, 'Details follows the amend')

    // 3b. A Details panel the user closed stays closed when the next commit lands.
    await fs.writeFile(join(repo, 'followed.txt'), 'one\ntwo\nthree\nfour\n'); await refresh()
    await page.evaluate((p) => window.__shot.repo.getState().select(p, { type: 'wip' }), repo)
    await open('followed.txt'); await page.locator('.fv-chip.unstaged').waitFor()
    await page.evaluate((p) => window.__shot.repo.getState().closeDetails(p), repo)
    git('commit', '-qam', 'Second commit from outside'); await refresh()
    await until(async () => (await source())?.type === 'commit', 'view follows into the second commit')
    await page.waitForTimeout(300)
    assert.equal(await selected(), null, 'a closed Details panel is not reopened')

    // 3c. The commit being read is undone and its changes thrown away (a hard
    //     reset): nothing on screen exists any more, so the view closes and
    //     Details moves to the commit underneath.
    await fs.writeFile(join(repo, 'followed.txt'), 'one\ntwo\nthree\nfour\nfive\n'); git('commit', '-qam', 'To be thrown away'); await refresh()
    const doomed = git('rev-parse', 'HEAD').trim()
    const parent = git('rev-parse', 'HEAD~1').trim()
    await page.evaluate(({ p, sha }) => {
      window.__shot.repo.getState().select(p, { type: 'commit', hash: sha })
      window.__shot.ui.getState().setFileView({ repoPath: p, file: 'followed.txt', source: { type: 'commit', hash: sha }, mode: 'diff' })
    }, { p: repo, sha: doomed })
    await page.locator('.diff-viewer').waitFor()
    git('reset', '--hard', 'HEAD~1'); await refresh()
    await until(async () => (await source()) === null, 'view closes after a hard reset of its commit')
    assert.deepEqual(await selected(), { type: 'commit', hash: parent }, 'Details on the commit underneath')

    // 4. Discarded outside the app: nothing is left to show, so the view closes.
    await fs.writeFile(join(repo, 'dropped.txt'), 'changed\n'); await refresh()
    await open('dropped.txt'); await page.locator('.fv-chip.unstaged').waitFor()
    git('checkout', '--', 'dropped.txt'); await refresh()
    await until(async () => (await source()) === null, 'view closes after a discard')

    console.log('PASS staged elsewhere flips the view; committed elsewhere follows into the commit with Details; undo returns it to staged; amend follows HEAD; a closed Details stays closed; a commit undone with its changes thrown away closes the file; discarded elsewhere closes')
  } finally {
    await app?.close()
    await fs.rm(tmp, { recursive: true, force: true })
  }
})().catch((e) => { console.error(e); process.exitCode = 1 })
