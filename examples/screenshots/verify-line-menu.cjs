// Right-click in a diff and in the file list, in the real app. Run after npm run build:
// node examples/screenshots/verify-line-menu.cjs
//  - a changed line's menu stages just that line (git agrees), and discards one
//    after the confirm; its hunk rows and Copy line are there too
//  - a right-click near the bottom of the window opens the menu above the
//    pointer: the menu never covers the row that was clicked
//  - the file row menu is short: copy paths and ignore choices sit in submenus
const { _electron } = require('playwright')
const fs = require('node:fs/promises')
const { execFileSync } = require('node:child_process')
const { join, resolve } = require('node:path')
const assert = require('node:assert/strict')
const ROOT = resolve(__dirname, '../..')
;(async () => {
  const tmp = await fs.mkdtemp('/tmp/geminio-line-menu-')
  const repo = join(tmp, 'repo')
  const userData = join(tmp, 'settings')
  await fs.mkdir(userData)
  execFileSync('git', ['init', '-q', '-b', 'main', repo])
  const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=D', '-c', 'user.email=d@example.invalid', ...a], { encoding: 'utf8' })
  const base = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`)
  await fs.writeFile(join(repo, 'a.txt'), base.join('\n') + '\n')
  git('add', '-A'); git('commit', '-qm', 'chore: start')
  // Two separate changes in one hunk-less-friendly spread: line 3 and line 5.
  const edited = [...base]; edited[2] = 'line 3 CHANGED'; edited[4] = 'line 5 CHANGED'
  await fs.writeFile(join(repo, 'a.txt'), edited.join('\n') + '\n')
  await fs.writeFile(join(userData, 'gitcito-settings.json'), JSON.stringify({ onboardingCompleted: true, autoFetchMinutes: 0, profiles: [{ id: 'default', name: 'Demo', ai: { enabled: false } }], activeProfileId: 'default', tabs: [{ id: 'repo', kind: 'repo', name: 'Demo', repos: [{ path: repo, name: 'Demo' }], activeRepoPath: repo }], activeTabId: 'repo' }))
  await fs.writeFile(join(userData, 'gitcito-keychain.json'), JSON.stringify({ consent: 'declined', explained: true }))
  let app
  try {
    app = await _electron.launch({ args: [join(ROOT, 'out/main/index.js'), '--shot', '--background-test', `--user-data-dir=${userData}`], cwd: ROOT })
    const page = await app.firstWindow()
    page.on('pageerror', (err) => console.log('PAGEERROR', err.message))
    await page.waitForFunction(() => window.__shot?.ready)
    await page.evaluate((p) => window.__shot.waitForRepo(p), repo)
    await page.evaluate((p) => window.__shot.repo.getState().select(p, { type: 'wip' }), repo)
    await page.evaluate((p) => window.__shot.ui.getState().setFileView({ repoPath: p, file: 'a.txt', source: { type: 'wip', staged: false, untracked: false }, mode: 'diff' }), repo)
    // Unified layout, so each − and + is its own row.
    await page.evaluate(() => localStorage.setItem('gitcito-diff-layout', 'unified'))
    await page.locator('.diff-viewer').waitFor()
    const unifiedBtn = page.locator('[role="radio"]').nth(0)
    if (await unifiedBtn.count()) await unifiedBtn.click()
    const menu = page.locator('.context-menu').first()
    const labels = () => menu.locator('.menu-item').allInnerTexts().then((a) => a.map((s) => s.trim()))
    const notCovering = async (x, y) => {
      const b = await menu.boundingBox()
      assert.ok(!(x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height), `menu ${JSON.stringify(b)} covers the click at ${x},${y}`)
    }

    // 1. Right-click the added "line 3 CHANGED": stage just that line.
    const added3 = page.locator('.diff-line.add', { hasText: 'line 3 CHANGED' })
    await added3.waitFor()
    let box = await added3.boundingBox()
    await page.mouse.click(box.x + 200, box.y + box.height / 2, { button: 'right' })
    await menu.waitFor()
    await notCovering(box.x + 200, box.y + box.height / 2)
    if (process.env.SHOT_DIR) await page.screenshot({ path: join(process.env.SHOT_DIR, 'line-menu.png') })
    const l1 = await labels()
    for (const want of ['Stage this line', 'Discard this line', 'Stage hunk', 'Discard hunk', 'Copy line']) assert.ok(l1.some((l) => l.startsWith(want)), `${want} in ${JSON.stringify(l1)}`)
    await menu.locator('.menu-item', { hasText: 'Stage this line' }).click()
    for (let i = 0; i < 100 && !git('diff', '--cached').includes('+line 3 CHANGED'); i++) await page.waitForTimeout(50)
    const cached = git('diff', '--cached')
    assert.ok(cached.includes('+line 3 CHANGED'), cached)
    assert.ok(!cached.includes('line 5 CHANGED'), 'only the one line was staged')
    assert.ok(!cached.includes('-line 3\n'), 'the removed half was not staged with it')

    // 2. Discard "line 5 CHANGED" via its menu, after the confirm.
    const added5 = page.locator('.diff-line.add', { hasText: 'line 5 CHANGED' })
    await added5.waitFor()
    // The diff has caught up with the staging once its buttons are back on.
    await page.waitForFunction(() => [...document.querySelectorAll('.diff-stage-hunk')].every((b) => !b.disabled))
    box = await added5.boundingBox()
    await page.mouse.click(box.x + 200, box.y + box.height / 2, { button: 'right' })
    await menu.waitFor()
    await menu.locator('.menu-item', { hasText: 'Discard this line' }).click()
    // It asks beside the line, without a dialog over the window.
    const pop = page.locator('.confirm-popover')
    await pop.waitFor()
    assert.equal(await page.locator('.modal, .modal-backdrop').count(), 0, 'no dialog, no backdrop')
    const pb = await pop.boundingBox()
    const lb = await added5.boundingBox()
    assert.ok(pb.y >= lb.y + lb.height || pb.y + pb.height <= lb.y, 'the popover does not cover the line it asks about')
    if (process.env.SHOT_DIR) await page.screenshot({ path: join(process.env.SHOT_DIR, 'discard-line-popover.png') })
    await pop.locator('.btn.danger').click()
    const read = () => fs.readFile(join(repo, 'a.txt'), 'utf8')
    const untilFile = async (test, what) => {
      for (let i = 0; i < 100; i++) { if (test(await read())) return; await page.waitForTimeout(50) }
      assert.fail(what)
    }
    await untilFile((f) => !f.includes('line 5 CHANGED'), 'the added line went away')
    await page.locator('.toast-action', { hasText: 'Undo' }).click()
    await untilFile((f) => f.includes('line 5 CHANGED'), 'Undo in the toast brought the line back')

    // 3. Near the bottom of the window the menu opens above the pointer.
    const vh = await page.evaluate(() => window.innerHeight)
    const y = vh - 60
    const x = 200
    await page.evaluate(({ x, y }) => window.__shot.ui.getState().openContextMenu(x, y, Array.from({ length: 12 }, (_, i) => ({ label: `Row ${i}`, onClick: () => {} }))), { x, y })
    await menu.waitFor()
    await notCovering(x, y)
    const b = await menu.boundingBox()
    assert.ok(b.y + b.height <= y, 'opens upward, ending at the pointer')
    await page.keyboard.press('Escape')

    // 4. The file row menu: short, with submenus.
    await fs.writeFile(join(repo, 'b.txt'), 'x\n'); git('add', 'b.txt'); git('commit', '-qm', 'chore: b'); await fs.writeFile(join(repo, 'b.txt'), 'y\n')
    await page.evaluate((p) => window.__shot.repo.getState().refresh(p), repo)
    const fileRow = page.locator('.file-item.wip', { hasText: 'b.txt' }).first()
    await fileRow.waitFor()
    const fb = await fileRow.boundingBox()
    await fileRow.click({ button: 'right' })
    await menu.waitFor()
    await notCovering(fb.x + fb.width / 2, fb.y + fb.height / 2)
    if (process.env.SHOT_DIR) await page.screenshot({ path: join(process.env.SHOT_DIR, 'file-menu.png') })
    const l4 = await labels()
    console.log('  file menu:', JSON.stringify(l4))
    assert.ok(l4.length <= 11, `file menu has ${l4.length} rows`)
    assert.ok(l4.some((l) => l.startsWith('Copy path')) && l4.some((l) => l.startsWith('Ignore')))
    assert.ok(!l4.some((l) => /history/i.test(l)), 'no history rewrite on a working-change row')

    console.log('PASS right-click stages or discards one line; the menu never covers the clicked row; the file menu is short')
  } finally {
    await app?.close()
    await fs.rm(tmp, { recursive: true, force: true })
  }
})().catch((e) => { console.error(e); process.exitCode = 1 })
