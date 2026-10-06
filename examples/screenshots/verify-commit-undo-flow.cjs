// Commit, undo and redo with a file open, in the real app. Run after npm run build:
// node examples/screenshots/verify-commit-undo-flow.cjs
//  - committing never closes Details: it moves straight to the new commit
//  - Undo hands the message back to the composer; Redo takes it out again
//  - a commit taken off outside the app is offered on Redo, named, not on Undo
const { _electron } = require('playwright')
const fs = require('node:fs/promises')
const { execFileSync } = require('node:child_process')
const { join, resolve } = require('node:path')
const assert = require('node:assert/strict')
const ROOT = resolve(__dirname, '../..')
;(async () => {
  const tmp = await fs.mkdtemp('/tmp/geminio-commit-flow-')
  const repo = join(tmp, 'repo')
  const userData = join(tmp, 'settings')
  await fs.mkdir(repo); await fs.mkdir(userData)
  const git = (...args) => execFileSync('git', ['-C', repo, '-c', 'user.name=Demo', '-c', 'user.email=demo@example.com', ...args], { encoding: 'utf8' }).trim()
  git('init', '-q', '-b', 'main')
  await fs.writeFile(join(repo, 'ring.txt'), 'one\n')
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
    const state = () => page.evaluate((p) => {
      const r = window.__shot.repo.getState()
      return { selected: r.repos[p].selected, draft: r.drafts[p] ?? '', source: window.__shot.ui.getState().fileView?.source ?? null }
    }, repo)
    const until = async (check, what) => {
      for (let i = 0; i < 100; i++) { if (await check(await state())) return; await page.waitForTimeout(50) }
      assert.fail(`timed out waiting for: ${what} — ${JSON.stringify(await state())}`)
    }

    // A staged change, its file open, Details on the working changes.
    await fs.writeFile(join(repo, 'ring.txt'), 'one\ntwo\n'); git('add', 'ring.txt'); await refresh()
    await page.evaluate((p) => {
      window.__shot.repo.getState().select(p, { type: 'wip' })
      window.__shot.ui.getState().setFileView({ repoPath: p, file: 'ring.txt', source: { type: 'wip', staged: true, untracked: false }, mode: 'diff' })
    }, repo)
    await page.locator('.right-panel').waitFor()

    // 1. Commit from the app: Details must never pass through "nothing selected".
    await page.evaluate((p) => {
      window.__closedDuringCommit = false
      window.__unsub = window.__shot.repo.subscribe((s) => { if (s.repos[p] && !s.repos[p].selected) window.__closedDuringCommit = true })
    }, repo)
    await page.evaluate((p) => window.__shot.repoActions.commit(p, 'feat: add ring\n\nDraws the outline.'), repo)
    const head = git('rev-parse', 'HEAD')
    // Your own commit: the file closes and the result is what you see.
    await until((s) => s.selected?.hash === head, 'Details moves to the new commit')
    assert.equal((await state()).source, null, 'the file closed — the commit, with all its files, is shown')
    await page.locator('.right-panel').getByText('ring.txt').first().waitFor()
    assert.equal(await page.evaluate(() => { window.__unsub(); return window.__closedDuringCommit }), false, 'Details never closed during the commit')
    assert.equal(await page.locator('.right-panel').count(), 1)

    // 2. Undo: the commit comes off, the change is staged, the message is back in the composer.
    await page.evaluate((p) => window.__shot.repo.getState().undo(p), repo)
    await until((s) => s.selected?.type === 'wip' && s.draft === 'feat: add ring', 'undo restores the message')
    assert.equal(git('rev-parse', 'HEAD') !== head, true)
    assert.equal(await page.locator('textarea.commit-description').inputValue(), 'Draws the outline.')

    // 3. Redo: the commit is back and the composer is empty again.
    await page.evaluate((p) => window.__shot.repo.getState().redo(p), repo)
    await until((s) => s.selected?.type === 'commit' && s.draft === '', 'redo recommits and clears the composer')

    // 4. A commit taken off outside the app is offered on Redo, by name.
    // The reflog counts whole seconds, and a move inside a second the app was
    // writing in counts as the app's own — so let the clock tick past the redo.
    await page.waitForTimeout(1500)
    git('reset', '--soft', 'HEAD~1'); await refresh()
    await page.waitForFunction((p) => window.__shot.repo.getState().repos[p].externalUndo?.kind === 'uncommit', repo, { timeout: 8000 }).catch(async () => {
      const moves = await page.evaluate((p) => window.api.git('recentRefMoves', p), repo)
      assert.fail(`no uncommit plan — store: ${JSON.stringify(await page.evaluate((p) => window.__shot.repo.getState().repos[p].externalUndo, repo))}; reflog: ${JSON.stringify(moves.head.slice(0, 4).map((m) => [m.message, m.date, m.byApp]))}; now ${Math.floor(Date.now() / 1000)}`)
    })
    const redoButton = page.locator('.bar-item button', { hasText: 'Redo' }).first()
    assert.equal(await redoButton.isDisabled(), false, 'Redo is offered')
    const tip = (await redoButton.getAttribute('title')) ?? (await redoButton.getAttribute('data-tip')) ?? ''
    assert.match(tip, /Redo commit “feat: add ring”/)
    await page.evaluate((p) => window.__shot.repo.getState().redo(p), repo)
    await page.locator('button.btn.primary', { hasText: 'Redo' }).click()
    await until(() => git('rev-parse', 'HEAD') !== '' && git('status', '--porcelain') === '', 'the commit is back')
    assert.equal(git('log', '-1', '--format=%s'), 'feat: add ring')

    // 5. The flow from the bug report: commit, close the file, read the commit
    //    in Details, Undo. Details goes to the working changes — never "Commit
    //    not found" — and the message is back in the composer.
    await page.evaluate((p) => window.__shot.ui.getState().setFileView(null, p), repo)
    const commitAndShow = async (file, text, message) => {
      await fs.writeFile(join(repo, file), text); git('add', file); await refresh()
      await page.evaluate(({ p, message }) => window.__shot.repoActions.commit(p, message), { p: repo, message })
      const sha = git('rev-parse', 'HEAD')
      await page.evaluate(({ p, sha }) => window.__shot.repo.getState().select(p, { type: 'commit', hash: sha }), { p: repo, sha })
      await until((s) => s.selected?.hash === sha, 'Details shows the new commit')
      return sha
    }
    await page.waitForTimeout(1100) // past the outside reset's second, as before
    await commitAndShow('ring.txt', 'one\ntwo\nthree\n', 'fix: tidy ring')
    await page.evaluate((p) => window.__shot.repo.getState().undo(p), repo)
    await until((s) => s.selected?.type === 'wip' && s.draft === 'fix: tidy ring', 'Details moves to the working changes')
    assert.equal(await page.getByText('Commit not found').count(), 0)
    await page.locator('.right-panel').getByText('ring.txt').first().waitFor()
    // Commit it again so the next steps start from a clean tree.
    // Committing with no file open moves Details to the new commit too.
    await page.evaluate((p) => window.__shot.repoActions.commit(p, 'fix: tidy ring'), repo)
    await until((s) => s.selected?.type === 'commit' && s.selected.hash === git('rev-parse', 'HEAD'), 'Details moves to the new commit')
    // The composer clears its own draft on commit; the store action used here does not.
    await page.evaluate((p) => window.__shot.repo.getState().setDraft(p, ''), repo)

    // 6. Several undos in a row: Details stays on the working changes while the
    //    files gather in Staged, and the composer shows the last undone message.
    await page.waitForTimeout(1100)
    await commitAndShow('a.txt', 'a\n', 'feat: add a')
    await commitAndShow('b.txt', 'b\n', 'feat: add b')
    await page.evaluate((p) => window.__shot.repo.getState().undo(p), repo)
    await until((s) => s.selected?.type === 'wip' && s.draft === 'feat: add b', 'first undo')
    await page.evaluate((p) => window.__shot.repo.getState().undo(p), repo)
    await until((s) => s.draft === 'feat: add a', 'second undo')
    assert.equal((await state()).selected?.type, 'wip')
    assert.deepEqual(git('diff', '--cached', '--name-only').split('\n').sort(), ['a.txt', 'b.txt'])

    // 7. Text the user typed is never overwritten by an undo.
    await page.evaluate((p) => window.__shot.repoActions.commit(p, 'feat: add a and b'), repo)
    await until(() => git('status', '--porcelain') === '', 'committed')
    await page.evaluate((p) => window.__shot.repo.getState().setDraft(p, ''), repo)
    await page.waitForTimeout(1100)
    await commitAndShow('c.txt', 'c\n', 'feat: add c')
    await page.evaluate((p) => window.__shot.repo.getState().setDraft(p, 'my own words'), repo)
    await page.evaluate((p) => window.__shot.repo.getState().undo(p), repo)
    await until((s) => s.selected?.type === 'wip', 'undo with typed text')
    await page.waitForTimeout(300)
    assert.equal((await state()).draft, 'my own words', 'typed text survives the undo')

    // 8. Undo in the app, then new work lands from outside: Redo is withdrawn,
    //    and pressing it anyway says why instead of "try again".
    await page.evaluate((p) => window.__shot.repo.getState().setDraft(p, ''), repo)
    await page.evaluate((p) => window.__shot.repoActions.commit(p, 'feat: add c'), repo)
    await until(() => git('status', '--porcelain') === '', 'recommitted c')
    await page.evaluate((p) => window.__shot.repo.getState().undo(p), repo)
    await until((s) => s.selected?.type === 'wip', 'undone c')
    const redo = page.locator('.bar-item button', { hasText: 'Redo' }).first()
    assert.equal(await redo.isDisabled(), false, 'Redo offered right after the undo')
    await page.waitForTimeout(1100)
    git('commit', '-qm', 'feat: outside work'); await refresh()
    await page.waitForFunction(() => document.querySelector('.bar-item button[disabled]')?.textContent?.includes('Redo') ?? false, null, { timeout: 5000 })
      .catch(async () => assert.equal(await redo.isDisabled(), true, 'Redo withdrawn after outside work'))
    // Toasts are read from the store: an info toast leaves the screen after 3.5s.
    const toastsDuring = await page.evaluate(async (p) => {
      const seen = []
      const unsub = window.__shot.ui.subscribe((s) => s.toasts.forEach((t) => seen.includes(t.message) || seen.push(t.message)))
      await window.__shot.repo.getState().redo(p)
      unsub()
      return seen
    }, repo)
    assert.ok(toastsDuring.includes('Nothing to redo — the repository has moved on since the undo.'), JSON.stringify(toastsDuring))
    assert.equal(git('log', '-1', '--format=%s'), 'feat: outside work', 'nothing was changed')

    // 9. A commit made outside the app, undone with Geminio's Undo (from the
    //    reflog): its title and description come back to the composer.
    const description = () => page.locator('textarea.commit-description').inputValue()
    await page.evaluate((p) => window.__shot.repo.getState().setDraft(p, ''), repo)
    await page.waitForTimeout(1100)
    await fs.writeFile(join(repo, 'agent.txt'), 'agent\n'); git('add', 'agent.txt')
    git('commit', '-qm', 'feat: agent work', '-m', 'Written by an agent.'); await refresh()
    const agentHead = git('rev-parse', 'HEAD')
    await page.evaluate(({ p, sha }) => window.__shot.repo.getState().select(p, { type: 'commit', hash: sha }), { p: repo, sha: agentHead })
    await page.evaluate((p) => window.__shot.repo.getState().undo(p), repo)
    await page.locator('button.btn.primary', { hasText: 'Undo' }).click()
    await until((s) => s.selected?.type === 'wip' && s.draft === 'feat: agent work', 'outside commit undone in the app restores the title')
    assert.equal(await description(), 'Written by an agent.')

    // 10. The agent undoes its own commit: the message still reaches the composer.
    await page.evaluate((p) => window.__shot.repo.getState().setDraft(p, ''), repo)
    await page.evaluate((p) => window.__shot.repoActions.commit(p, 'chore: clear'), repo)
    await until(() => git('status', '--porcelain') === '', 'clean')
    await page.evaluate((p) => window.__shot.repo.getState().setDraft(p, ''), repo)
    await page.waitForTimeout(1100)
    await fs.writeFile(join(repo, 'agent2.txt'), 'agent\n'); git('add', 'agent2.txt')
    git('commit', '-qm', 'fix: agent retry', '-m', 'Second pass.'); await refresh()
    await page.evaluate(({ p, sha }) => window.__shot.repo.getState().select(p, { type: 'commit', hash: sha }), { p: repo, sha: git('rev-parse', 'HEAD') })
    await page.waitForTimeout(1100)
    // Worded as GitKraken words it — tools differ, the app must not care.
    git('update-ref', '-m', 'undo: commit: fix: agent retry', 'HEAD', 'HEAD~1'); await refresh()
    await until((s) => s.selected?.type === 'wip' && s.draft === 'fix: agent retry', 'GitKraken-style uncommit restores the title')
    assert.equal(await description(), 'Second pass.')

    // 11. …and as another Geminio window words it: a reset to a full sha.
    await page.evaluate((p) => window.__shot.repo.getState().setDraft(p, ''), repo)
    await page.evaluate((p) => window.__shot.repoActions.commit(p, 'chore: clear again'), repo)
    await until(() => git('status', '--porcelain') === '', 'clean again')
    await page.evaluate((p) => window.__shot.repo.getState().setDraft(p, ''), repo)
    await page.waitForTimeout(1100)
    await fs.writeFile(join(repo, 'agent3.txt'), 'agent\n'); git('add', 'agent3.txt')
    git('commit', '-qm', 'feat: third pass', '-m', 'From the other window.'); await refresh()
    await page.evaluate(({ p, sha }) => window.__shot.repo.getState().select(p, { type: 'commit', hash: sha }), { p: repo, sha: git('rev-parse', 'HEAD') })
    await page.waitForTimeout(1100)
    git('reset', '--soft', git('rev-parse', 'HEAD~1')); await refresh()
    await until((s) => s.selected?.type === 'wip' && s.draft === 'feat: third pass', 'sha-style uncommit restores the title')
    assert.equal(await description(), 'From the other window.')

    console.log('PASS your commit closes the file and shows the commit without closing Details; undo restores the message; redo clears it; an outside uncommit is a named Redo; undo with Details on the commit moves to working changes; repeated undos gather there; typed text is kept; Redo is withdrawn once outside work lands; outside commits keep their message when undone either way')
  } finally {
    await app?.close()
    await fs.rm(tmp, { recursive: true, force: true })
  }
})().catch((e) => { console.error(e); process.exitCode = 1 })
