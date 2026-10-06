// Every discard can be undone, in the real app. Run after npm run build:
// node examples/screenshots/verify-discard-undo.cjs
//  - Discard on a file (staged and unstaged parts) asks in a popover beside the
//    row, with no backdrop; Esc cancels; the toast's Undo puts both parts back
//  - Discard all (a modified file, a staged new file, an untracked file) then
//    the toolbar's Undo: everything is back as it was
//  - a hunk's Discard asks twice in place: the first click only arms it
//  - in a merge with conflicts nothing can be saved for Undo, and the popover
//    says so
const { _electron } = require('playwright')
const fs = require('node:fs/promises')
const { execFileSync } = require('node:child_process')
const { join, resolve } = require('node:path')
const assert = require('node:assert/strict')
const ROOT = resolve(__dirname, '../..')
;(async () => {
  const tmp = await fs.mkdtemp('/tmp/geminio-discard-undo-')
  const repo = join(tmp, 'repo')
  const userData = join(tmp, 'settings')
  await fs.mkdir(userData)
  execFileSync('git', ['init', '-q', '-b', 'main', repo])
  const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=D', '-c', 'user.email=d@example.invalid', ...a], { encoding: 'utf8' })
  await fs.writeFile(join(repo, 'a.txt'), 'one\n'); await fs.writeFile(join(repo, 'b.txt'), 'bee\n')
  git('add', '-A'); git('commit', '-qm', 'chore: start')
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
    const state = () => git('status', '--porcelain') + '\n' + git('diff', '--cached') + '\n' + git('diff')
    const until = async (test, what) => {
      for (let i = 0; i < 200; i++) { if (await test()) return; await page.waitForTimeout(50) }
      assert.fail(`timed out: ${what}\n${git('status', '--porcelain')}`)
    }
    const fileMenu = async (name) => {
      await page.locator('.file-item.wip', { hasText: name }).first().click({ button: 'right' })
      await page.locator('.context-menu').first().waitFor()
    }

    console.log('  step 1')
    // 1. One file with a staged and an unstaged part.
    await fs.writeFile(join(repo, 'a.txt'), 'one\nstaged\n'); git('add', 'a.txt')
    await fs.writeFile(join(repo, 'a.txt'), 'one\nstaged\nunstaged\n'); await refresh()
    await page.evaluate((p) => window.__shot.repo.getState().select(p, { type: 'wip' }), repo)
    // Looking at the file when it is discarded: Undo must bring the view back.
    await page.evaluate((p) => window.__shot.ui.getState().setFileView({ repoPath: p, file: 'a.txt', source: { type: 'wip', staged: false, untracked: false }, mode: 'diff' }), repo)
    await page.locator('.diff-viewer').waitFor()
    const before1 = state()
    await fileMenu('a.txt')
    const pop = page.locator('.confirm-popover')
    const confirmDiscard = async (shot) => {
      await pop.waitFor()
      assert.equal(await page.locator('.modal, .modal-backdrop').count(), 0, 'no dialog, no backdrop')
      assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Cancel', 'Cancel has the focus')
      if (shot && process.env.SHOT_DIR) await page.screenshot({ path: join(process.env.SHOT_DIR, shot) })
      await pop.locator('.btn.danger').click()
    }
    // Esc cancels first, and nothing changes.
    await page.locator('.context-menu .menu-item', { hasText: 'Discard changes to a.txt' }).click()
    await pop.waitFor()
    await page.keyboard.press('Escape')
    await pop.waitFor({ state: 'detached' })
    assert.equal(state(), before1, 'Esc discarded nothing')
    await fileMenu('a.txt')
    await page.locator('.context-menu .menu-item', { hasText: 'Discard changes to a.txt' }).click()
    await confirmDiscard('discard-file-popover.png')
    await until(async () => !(await fs.readFile(join(repo, 'a.txt'), 'utf8')).includes('unstaged'), 'the file is discarded')
    if (process.env.SHOT_DIR) await page.screenshot({ path: join(process.env.SHOT_DIR, 'discard-toast.png') })
    // Only the staged part is left, so the view moves to the staged side.
    const openView = () => page.evaluate(() => { const v = window.__shot.ui.getState().fileView; return v ? `${v.file}:${v.source.staged ? 'staged' : 'unstaged'}` : null })
    await until(async () => (await openView()) === 'a.txt:staged', 'the view followed to what is left')
    await page.locator('.toast-action', { hasText: 'Undo' }).click()
    await until(async () => state() === before1, 'Undo restores staged and unstaged parts exactly')
    await until(async () => (await openView()) === 'a.txt:unstaged', 'Undo brings back the exact view that was open')
    assert.ok(await page.evaluate(() => window.__shot.ui.getState().toasts.some((t) => t.message === 'Restored a.txt')), 'the undo says what came back')
    assert.equal(await page.locator('.toast-action').count(), 0, 'and the discard toast, its Undo now spent, is gone')
    await page.evaluate(() => window.__shot.ui.getState().setFileView(null))

    console.log('  step 2')
    // 2. Discard all, then the toolbar Undo.
    await fs.writeFile(join(repo, 'b.txt'), 'bee changed\n')
    await fs.writeFile(join(repo, 'added.txt'), 'new and staged\n'); git('add', 'added.txt')
    await fs.writeFile(join(repo, 'loose.txt'), 'untracked\n'); await refresh()
    const before2 = state()
    const loose = await fs.readFile(join(repo, 'loose.txt'), 'utf8')
    await page.locator('.composer .panel-toolbar button').first().click()
    await confirmDiscard()
    await until(async () => git('status', '--porcelain').trim() === '', 'Discard all leaves nothing behind, new files included')
    // From the graph, Details closed, nothing open: Undo brings back the context.
    await page.evaluate((p) => { window.__shot.repo.getState().select(p, null); window.__shot.ui.getState().setFileView(null) }, repo)
    await page.evaluate((p) => window.__shot.repo.getState().undo(p), repo)
    await until(async () => state() === before2, 'Undo brings every change back as it was')
    await until(async () => (await page.evaluate((p) => window.__shot.repo.getState().repos[p].selected?.type, repo)) === 'wip', 'Details opens on the restored changes')
    assert.equal(await fs.readFile(join(repo, 'loose.txt'), 'utf8'), loose)

    console.log('  step 2b')
    // 2b. Two changes open in turn; discard the one on screen: the view moves on
    //     to the other change, not back to the graph. Undo returns to it.
    await page.evaluate((p) => window.__shot.ui.getState().setFileView({ repoPath: p, file: 'loose.txt', source: { type: 'wip', staged: false, untracked: true }, mode: 'diff' }), repo)
    await fileMenu('loose.txt')
    await page.locator('.context-menu .menu-item', { hasText: 'Discard changes to loose.txt' }).click()
    await confirmDiscard()
    await until(async () => { const v = await openView(); return v !== null && !v.startsWith('loose.txt') }, 'the view moved on to the next change')
    await page.evaluate((p) => window.__shot.repo.getState().undo(p), repo)
    await until(async () => (await openView()) === 'loose.txt:unstaged', 'Undo brings back the discarded file')

    // Only b.txt changed from here on.
    git('reset', '-q', '--hard'); git('clean', '-fdq'); await refresh()

    console.log('  step 3')
    // 3. A hunk's Discard asks twice in place.
    await fs.writeFile(join(repo, 'b.txt'), 'bee hunk\n'); await refresh()
    await page.evaluate((p) => window.__shot.ui.getState().setFileView({ repoPath: p, file: 'b.txt', source: { type: 'wip', staged: false, untracked: false }, mode: 'diff' }), repo)
    const hunkDiscard = page.locator('.diff-stage-hunk.intent-backward').first()
    await hunkDiscard.waitFor()
    await hunkDiscard.click()
    assert.equal((await hunkDiscard.innerText()).trim(), 'Discard hunk?', 'the first click arms it')
    assert.equal(await fs.readFile(join(repo, 'b.txt'), 'utf8'), 'bee hunk\n', 'and changes nothing')
    if (process.env.SHOT_DIR) await page.screenshot({ path: join(process.env.SHOT_DIR, 'discard-hunk-armed.png') })
    await hunkDiscard.click()
    // Off from the click until the diff catches up: no double press on stale lines.
    assert.equal(await page.locator('.diff-stage-hunk').evaluateAll((bs) => bs.every((b) => b.disabled)), true, 'every hunk button is off at once')
    await until(async () => (await fs.readFile(join(repo, 'b.txt'), 'utf8')) === 'bee\n', 'the second click discards the hunk')
    // Its only change is gone, and HEAD did not move: the view closes. It must
    // not jump to the last commit that touched b.txt (an old change), and
    // Details must not open on it either.
    await until(async () => (await openView()) === null, 'discarding the last change closes the file')
    assert.notEqual(await page.evaluate((p) => window.__shot.repo.getState().repos[p].selected?.type ?? null, repo), 'commit', 'Details did not jump to a commit')
    await page.locator('.toast-action', { hasText: 'Undo' }).last().click()
    await until(async () => (await fs.readFile(join(repo, 'b.txt'), 'utf8')) === 'bee hunk\n', 'Undo brings the hunk back')
    // …into view: the file reopens (discarding its only hunk had closed it) and
    // the diff shows the lines again.
    await until(async () => (await openView()) === 'b.txt:unstaged', 'Undo reopens the file the hunk was discarded from')
    await page.locator('.diff-line.add', { hasText: 'bee hunk' }).waitFor({ timeout: 10_000 })
    await page.evaluate(() => window.__shot.ui.getState().setFileView(null))
    git('checkout', '--', 'b.txt')

    console.log('  step 4')
    // 4. A merge with conflicts: nothing to save, so the popover says it is final.
    git('stash', '-u', '-q')
    git('checkout', '-qb', 'other'); await fs.writeFile(join(repo, 'b.txt'), 'theirs\n'); git('commit', '-qam', 'feat: theirs')
    git('checkout', '-q', 'main'); await fs.writeFile(join(repo, 'b.txt'), 'ours\n'); git('commit', '-qam', 'feat: ours')
    try { git('merge', 'other') } catch { /* conflict expected */ }
    await fs.writeFile(join(repo, 'c.txt'), 'side edit\n'); await refresh()
    const at = { left: 300, top: 200, width: 200, height: 24 }
    await page.evaluate(({ p, at }) => window.__shot.repoActions.discardChanges(p, [{ path: 'c.txt', untracked: true }], { what: 'c.txt', anchor: at }), { p: repo, at })
    await pop.waitFor()
    assert.match(await page.locator('.confirm-popover-detail').innerText(), /cannot be undone/)
    await pop.locator('.btn.danger').click()
    await until(async () => !(await fs.stat(join(repo, 'c.txt')).catch(() => null)), 'Discard in the bar removes it')

    console.log('PASS every discard asks beside what was chosen (no backdrop, Cancel focused, Esc cancels); hunk Discard asks twice in place; the toast and toolbar Undo restore exactly, staged parts and new files included; with nothing to save it says it is final')
  } finally {
    await app?.close()
    await fs.rm(tmp, { recursive: true, force: true })
  }
})().catch((e) => { console.error(e); process.exitCode = 1 })
