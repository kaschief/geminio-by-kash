// The bug hunter. Drives the real built app through random sequences that mix
// what a person does in Geminio with what a terminal or an agent does to the
// same repository at the same time — and checks, after every step, the rules
// the app promises to keep (INVARIANTS below). Most bugs found by hand were in
// exactly those mixes; scripted checks only cover the paths someone thought of.
//
//   npm run build && npm run hunt                    # 20 sequences, random seeds
//   npm run hunt -- --runs 100 --steps 40           # longer hunt
//   npm run hunt -- --seed 1234                      # one sequence, reproducibly
//   npm run hunt -- --only app-click-away            # just one kind of action
//   npm run hunt -- --replay examples/bughunt/found/<file>.json
//
// A failure is written to examples/bughunt/found/ as the exact steps taken, so
// it replays without the random generator. Turn a confirmed one into a
// permanent verify-*.cjs check once fixed.
//
// Everything runs in throwaway repos and a throwaway profile, on a hidden
// window: never the user's repositories, settings or keychain.
const { _electron } = require('playwright')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const { execFileSync } = require('node:child_process')
const { join, resolve } = require('node:path')
const ROOT = resolve(__dirname, '../..')
const FOUND = join(__dirname, 'found')

// ─── Arguments ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : fallback
}
const RUNS = Number(arg('runs', 20))
const STEPS = Number(arg('steps', 40))
const SEED = arg('seed', null)
const REPLAY = arg('replay', null)
const VERBOSE = argv.includes('--verbose')
// `--only app-click-away,app-undo`: hunt with just these actions (focus on one area).
const ONLY = arg('only', null)?.split(',') ?? null

// ─── Seeded randomness, so a failing sequence can be regenerated ────────────
function rng(seed) {
  let s = seed >>> 0 || 1
  const next = () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
  return { next, pick: (list) => list[Math.floor(next() * list.length)], chance: (p) => next() < p }
}

const TYPES = ['feat', 'fix', 'docs', 'chore', 'refactor', 'test']
const WORDS = ['ring', 'profile', 'outline', 'label', 'session', 'history', 'forecast', 'zone']
const FILES = ['a.pine', 'b.pine', 'c.pine', 'docs/notes.md', 'lib/util.ts']

// ─── What can happen ────────────────────────────────────────────────────────
// Each action is pure data ({ kind, ...args }), generated from the seed and
// the current repository state, so a recorded sequence replays exactly.
// `app` actions go through Geminio; `outside` actions are a terminal/agent.
const ACTIONS = {
  // Outside the app — what an agent or a terminal does.
  'edit': { side: 'outside', weight: 7, gen: (r) => ({ file: r.pick(FILES), text: `${r.pick(WORDS)} ${Math.floor(r.next() * 1e6)}\n` }) },
  'git-add': { side: 'outside', weight: 4, gen: () => ({}) },
  'git-commit': { side: 'outside', weight: 4, gen: (r) => ({ message: message(r) }) },
  'git-amend': { side: 'outside', weight: 1, gen: (r) => ({ message: message(r) }) },
  'git-reset': { side: 'outside', weight: 3, gen: (r) => ({ mode: r.pick(['soft', 'mixed', 'hard']), style: r.pick(['HEAD~1', 'sha', 'gitkraken']) }) },
  'git-stash': { side: 'outside', weight: 1, gen: () => ({}) },
  'git-stash-pop': { side: 'outside', weight: 1, gen: () => ({}) },
  // Inside the app — what the person does.
  'app-stage-all': { side: 'app', weight: 4, gen: () => ({}) },
  'app-commit': { side: 'app', weight: 4, gen: (r) => ({ message: message(r) }) },
  'app-undo': { side: 'app', weight: 4, gen: () => ({}) },
  'app-redo': { side: 'app', weight: 3, gen: () => ({}) },
  'app-open-wip-file': { side: 'app', weight: 3, gen: (r) => ({ pick: r.next() }) },
  'app-open-head-file': { side: 'app', weight: 2, gen: (r) => ({ pick: r.next() }) },
  'app-close-file': { side: 'app', weight: 1, gen: () => ({}) },
  'app-select-wip': { side: 'app', weight: 2, gen: () => ({}) },
  'app-select-head': { side: 'app', weight: 2, gen: () => ({}) },
  'app-type-draft': { side: 'app', weight: 1, gen: (r) => ({ text: `my words ${Math.floor(r.next() * 1e4)}` }) },
  'app-clear-draft': { side: 'app', weight: 1, gen: () => ({}) },
  // Open a popover, then really click something outside it.
  'app-click-away': { side: 'app', weight: 3, gen: (r) => ({ popover: r.pick(POPOVERS.map((p) => p.name)) }) }
}

// Popovers that close on an outside press. Each: how to open it, and what
// marks it as open. The click lands on the title bar's + button, which opens
// a menu — so a click that leaks through the dismissal is visible.
const POPOVERS = [
  { name: 'repo-picker', open: (page) => page.locator('.repo-pill').first().click(), openSel: '.branch-picker-popover' },
  { name: 'branch-picker', open: (page) => page.locator('.repo-pill').nth(1).click(), openSel: '.branch-picker-popover' },
  {
    name: 'context-menu',
    open: (page) => page.evaluate(() => window.__shot.ui.getState().openContextMenu(400, 300, [{ label: 'Hunter item', onClick: () => undefined }])),
    openSel: '.context-menu'
  }
]

function message(r) {
  const subject = `${r.pick(TYPES)}: ${r.pick(['add', 'tidy', 'fix', 'drop'])} ${r.pick(WORDS)} ${Math.floor(r.next() * 1e4)}`
  return r.chance(0.6) ? `${subject}\n\n${r.pick(WORDS)} body line ${Math.floor(r.next() * 1e4)}` : subject
}

function generate(r, count) {
  const table = Object.entries(ACTIONS)
    .filter(([kind]) => !ONLY || ONLY.includes(kind))
    .flatMap(([kind, a]) => Array(a.weight).fill(kind))
  return Array.from({ length: count }, () => {
    const kind = r.pick(table)
    return { kind, ...ACTIONS[kind].gen(r) }
  })
}

// ─── One sequence against a fresh app and repository ────────────────────────
async function runSequence(label, steps) {
  const tmp = await fsp.mkdtemp('/tmp/geminio-hunt-')
  const repo = join(tmp, 'repo')
  const userData = join(tmp, 'settings')
  await fsp.mkdir(join(repo, 'docs'), { recursive: true })
  await fsp.mkdir(join(repo, 'lib'), { recursive: true })
  await fsp.mkdir(userData)
  const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=Agent', '-c', 'user.email=agent@example.invalid', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const gitOk = (...a) => { try { return git(...a) } catch { return null } }
  git('init', '-q', '-b', 'main')
  for (const f of FILES) fs.writeFileSync(join(repo, f), 'start\n')
  git('add', '-A'); git('commit', '-qm', 'chore: start')
  fs.writeFileSync(join(userData, 'gitcito-settings.json'), JSON.stringify({ onboardingCompleted: true, autoFetchMinutes: 0, profiles: [{ id: 'default', name: 'Hunter', ai: { enabled: false } }], activeProfileId: 'default', tabs: [{ id: 'repo', kind: 'repo', name: 'Hunt', repos: [{ path: repo, name: 'Hunt' }], activeRepoPath: repo }], activeTabId: 'repo' }))
  fs.writeFileSync(join(userData, 'gitcito-keychain.json'), JSON.stringify({ consent: 'declined', explained: true }))

  const app = await _electron.launch({ args: [join(ROOT, 'out/main/index.js'), '--shot', '--background-test', `--user-data-dir=${userData}`], cwd: ROOT })
  const failures = []
  const pageErrors = []
  const done = []
  // What the hunter itself typed into the composer; null when it has not.
  let typed = null
  // The last moment the app wrote to git. Outside actions wait past it: the
  // reflog counts whole seconds, and a move in the same second as an app write
  // is (documented, unavoidable) attributed to the app.
  let lastAppWrite = 0
  try {
    const page = await app.firstWindow()
    page.on('pageerror', (e) => pageErrors.push(e.message))
    if (process.env.HUNT_CONSOLE) page.on('console', (m) => m.text().startsWith(process.env.HUNT_CONSOLE) && console.log('   console:', m.text()))
    await page.waitForFunction(() => window.__shot?.ready)
    await page.evaluate((p) => window.__shot.waitForRepo(p), repo)
    // With --verbose, every change the store goes through during a step, so a
    // finding shows the sequence of states that led to it, not just the end.
    await page.evaluate((p) => {
      window.__huntTrace = []
      window.__shot.repo.subscribe((s) => {
        const r = s.repos[p]
        if (!r) return
        const head = r.commits.find((c) => c.refs.some((x) => x === 'HEAD' || x.startsWith('HEAD ->')))?.hash.slice(0, 7)
        const fv = window.__shot.ui.getState().fileView
        const row = [head, r.status ? `staged:${r.status.staged.length} unstaged:${r.status.unstaged.length}` : 'status:null', r.selected ? `sel:${r.selected.type}${r.selected.hash ? ':' + r.selected.hash.slice(0, 7) : ''}` : 'sel:none', fv ? `file:${fv.source.type}${fv.source.hash ? ':' + fv.source.hash.slice(0, 7) : fv.source.staged ? ':staged' : ':unstaged'}` : 'file:none'].join(' ')
        if (window.__huntTrace[window.__huntTrace.length - 1] !== row) window.__huntTrace.push(row)
      })
    }, repo)
    // Every toast, kept: they vanish from the screen in seconds.
    await page.evaluate(() => {
      window.__huntToasts = []
      window.__shot.ui.subscribe((s) => s.toasts.forEach((t) => {
        if (!window.__huntToasts.some((x) => x.id === t.id)) window.__huntToasts.push({ id: t.id, kind: t.kind, message: t.message })
      }))
    })

    const S = () => page.evaluate((p) => {
      const r = window.__shot.repo.getState().repos[p]
      const ui = window.__shot.ui.getState()
      return {
        selected: r.selected,
        fileView: ui.fileView,
        modal: ui.modal?.kind ?? null,
        draft: window.__shot.repo.getState().drafts[p] ?? '',
        commits: r.commits.map((c) => ({ hash: c.hash, refs: c.refs })),
        status: r.status && { staged: r.status.staged.map((f) => f.path), unstaged: r.status.unstaged.map((f) => f.path) },
        externalUndo: r.externalUndo && { kind: r.externalUndo.kind, byApp: r.externalUndo.move.byApp },
        redoStack: r.redoStack.length,
        redoHead: r.redoHead,
        repoPath: p,
        // A message handed to the composer while it is closed waits here.
        pendingMessage: ui.composerIntent?.path === p ? ui.composerIntent.summary : null
      }
    }, repo)
    const refresh = async () => {
      await page.evaluate((p) => window.__shot.repo.getState().refresh(p), repo)
      await page.waitForTimeout(250)
    }
    const confirmModal = async () => {
      if ((await S()).modal !== 'confirm') return
      await page.locator('button.btn.primary').last().click()
      await page.waitForTimeout(400)
    }
    const appWrote = () => { lastAppWrite = Date.now() }
    const waitPastAppWrite = async () => {
      const gap = 1100 - (Date.now() - lastAppWrite)
      if (gap > 0) await page.waitForTimeout(gap)
    }
    const head = () => gitOk('rev-parse', 'HEAD')
    const commitCount = () => Number(gitOk('rev-list', '--count', 'HEAD') ?? 0)

    for (const [i, step] of steps.entries()) {
      await page.evaluate(() => { window.__huntTrace = [] })
      const before = await S()
      const dirtyBefore = (gitOk('status', '--porcelain') ?? '') !== ''
      const draftBefore = before.draft
      let applied = true
      const kind = step.kind
      try {
        if (ACTIONS[kind].side === 'outside') await waitPastAppWrite()
        switch (kind) {
          case 'edit': fs.writeFileSync(join(repo, step.file), step.text); break
          case 'git-add': gitOk('add', '-A'); break
          case 'git-commit': {
            if (!git('diff', '--cached', '--name-only')) { applied = false; break }
            const [subject, ...rest] = step.message.split('\n\n')
            git('commit', '-qm', subject, ...(rest.length ? ['-m', rest.join('\n\n')] : []))
            break
          }
          case 'git-amend': git('commit', '--amend', '-qm', step.message.split('\n\n')[0]); break
          case 'git-reset': {
            if (commitCount() < 2) { applied = false; break }
            const parent = git('rev-parse', 'HEAD~1')
            if (step.style === 'gitkraken') {
              // GitKraken's undo: a ref update worded its own way. Only soft makes sense for it.
              const subject = git('log', '-1', '--format=%s')
              git('update-ref', '-m', `undo: commit: ${subject}`, 'HEAD', parent)
            } else {
              git('reset', `--${step.mode}`, step.style === 'sha' ? parent : 'HEAD~1')
            }
            break
          }
          case 'git-stash': if (gitOk('stash', 'push', '-q') === null) applied = false; break
          case 'git-stash-pop': if (gitOk('stash', 'pop', '-q') === null) applied = false; break
          case 'app-stage-all': {
            const files = before.status?.unstaged ?? []
            if (!files.length) { applied = false; break }
            await page.evaluate(({ p, f }) => window.__shot.repoActions.stage(p, f), { p: repo, f: files }); appWrote()
            break
          }
          case 'app-commit': {
            if (!(before.status?.staged.length)) { applied = false; break }
            await page.evaluate(({ p, m }) => window.__shot.repoActions.commit(p, m), { p: repo, m: step.message }); appWrote()
            // The composer clears its own draft on a commit; the store action does not.
            await page.evaluate((p) => window.__shot.repo.getState().setDraft(p, ''), repo)
            typed = null
            break
          }
          case 'app-undo': await page.evaluate((p) => window.__shot.repo.getState().undo(p), repo); await confirmModal(); appWrote(); break
          case 'app-redo': await page.evaluate((p) => window.__shot.repo.getState().redo(p), repo); await confirmModal(); appWrote(); break
          case 'app-open-wip-file': {
            const all = [...(before.status?.staged ?? []).map((f) => [f, true]), ...(before.status?.unstaged ?? []).map((f) => [f, false])]
            if (!all.length) { applied = false; break }
            const [file, staged] = all[Math.floor(step.pick * all.length)]
            await page.evaluate(({ p, file, staged }) => window.__shot.ui.getState().setFileView({ repoPath: p, file, source: { type: 'wip', staged, untracked: false }, mode: 'diff' }), { p: repo, file, staged })
            break
          }
          case 'app-open-head-file': {
            const h = head()
            const files = (gitOk('show', '--name-only', '--format=', h) ?? '').split('\n').filter(Boolean)
            if (!files.length) { applied = false; break }
            const file = files[Math.floor(step.pick * files.length)]
            await page.evaluate(({ p, file, h }) => window.__shot.ui.getState().setFileView({ repoPath: p, file, source: { type: 'commit', hash: h }, mode: 'diff' }), { p: repo, file, h })
            break
          }
          case 'app-close-file': await page.evaluate((p) => window.__shot.ui.getState().setFileView(null, p), repo); break
          case 'app-select-wip': await page.evaluate((p) => window.__shot.repo.getState().select(p, { type: 'wip' }), repo); break
          case 'app-select-head': await page.evaluate(({ p, h }) => window.__shot.repo.getState().select(p, { type: 'commit', hash: h }), { p: repo, h: head() }); break
          case 'app-type-draft': await page.evaluate(({ p, t }) => window.__shot.repo.getState().setDraft(p, t), { p: repo, t: step.text }); typed = step.text; break
          case 'app-clear-draft': await page.evaluate((p) => window.__shot.repo.getState().setDraft(p, ''), repo); typed = null; break
          case 'app-click-away': {
            const pop = POPOVERS.find((x) => x.name === step.popover)
            await page.evaluate(() => window.__shot.ui.getState().closeContextMenu())
            await pop.open(page)
            await page.locator(pop.openSel).first().waitFor({ timeout: 3000 })
            const box = await page.locator('.tab-add').boundingBox()
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
            await page.waitForTimeout(250)
            // Recorded for the rule below: did anything other than the dismissal happen?
            step.after = await page.evaluate((sel) => ({
              stillOpen: !!document.querySelector(sel),
              contextMenu: !!window.__shot.ui.getState().contextMenu,
              modal: window.__shot.ui.getState().modal?.kind ?? null
            }), pop.openSel)
            // Leave the app as it was for the next step.
            await page.evaluate(() => { const ui = window.__shot.ui.getState(); ui.closeContextMenu(); if (ui.modal) ui.closeModal() })
            break
          }
        }
      } catch (e) {
        // A git command refusing (nothing to stash, conflicts on pop) is the
        // repository saying no, not the app misbehaving.
        applied = false
        if (VERBOSE) console.log(`   (step ${i} ${kind} refused: ${String(e.message).split('\n')[0]})`)
      }
      await refresh()
      done.push({ ...step, applied })
      if (VERBOSE) console.log(`   ${String(i).padStart(2)} ${applied ? '·' : '×'} ${kind} ${JSON.stringify(step).slice(0, 90)}`)
      if (!applied) continue

      const after = await S()
      const problems = await checkInvariants({ page, repo, git, gitOk, before, after, kind, step, typed, draftBefore, dirtyBefore })
      if (pageErrors.length) problems.push(`uncaught error in the renderer: ${pageErrors.splice(0).join(' | ')}`)
      if (problems.length) {
        // Enough context to diagnose without re-running: what the app thought,
        // and what git actually did.
        failures.push({
          step: i,
          kind,
          problems,
          app: { selected: after.selected, fileView: after.fileView, draft: after.draft, pendingMessage: after.pendingMessage, status: after.status, externalUndo: after.externalUndo, redoStack: after.redoStack },
          reflog: (gitOk('reflog', '-10', '--format=%h %gs') ?? '').split('\n'),
          gitStatus: gitOk('status', '--porcelain'),
          trace: await page.evaluate(() => window.__huntTrace)
        })
        break
      }
    }
  } finally {
    await app.close().catch(() => undefined)
    await fsp.rm(tmp, { recursive: true, force: true }).catch(() => undefined)
  }
  return { label, failures, steps: done }
}

// ─── The rules ──────────────────────────────────────────────────────────────
// Each is a promise the app makes. A broken one is a bug, whatever the path.
async function checkInvariants({ page, git, gitOk, after, kind, step, typed, draftBefore, dirtyBefore }) {
  const out = []
  const headSha = gitOk('rev-parse', 'HEAD')
  const reachable = (sha) => sha === headSha || gitOk('merge-base', '--is-ancestor', sha, 'HEAD') !== null

  // 1. The open file's chip tells the truth about where the file is.
  const fv = after.fileView
  if (fv?.source.type === 'wip') {
    const list = fv.source.staged ? after.status?.staged : after.status?.unstaged
    if (!list?.includes(fv.file)) out.push(`file view says ${fv.source.staged ? 'Staged' : 'Unstaged'} for ${fv.file}, but git disagrees (staged: ${after.status?.staged}, unstaged: ${after.status?.unstaged})`)
  }
  // 2. No file stays open on a commit that has left history.
  if (fv?.source.type === 'commit' && !reachable(fv.source.hash)) out.push(`file view is on ${fv.source.hash.slice(0, 7)}, which is no longer in history`)

  // 3. Details never shows "Commit not found" for a commit it was following.
  if (after.selected?.type === 'commit' && !after.commits.some((c) => c.hash === after.selected.hash)) out.push(`Details is on ${after.selected.hash.slice(0, 7)}: "Commit not found"`)
  // 4. Details on the working changes means there are some.
  if (after.selected?.type === 'wip' && !(after.status?.staged.length || after.status?.unstaged.length)) out.push('Details shows working changes, but the working tree is clean')

  // 5. Text the person typed is never replaced.
  if (typed !== null && after.draft !== typed) out.push(`composer text was "${typed}", now "${after.draft}" — typed text was overwritten`)

  // 6. Redo is only offered when it would work.
  const redoOffered = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.bar-item button')].find((x) => x.textContent?.includes('Redo'))
    return b ? !b.disabled : null
  })
  if (redoOffered && after.redoStack > 0 && after.redoHead && after.redoHead !== headSha && after.externalUndo?.kind !== 'uncommit') out.push(`Redo is offered, but HEAD moved since the undo (redoHead ${after.redoHead.slice(0, 7)}, HEAD ${headSha?.slice(0, 7)})`)

  // 7. No "changed since" / internal error toasts after an app action.
  const toasts = await page.evaluate(() => window.__huntToasts.splice(0))
  for (const t of toasts) {
    if (t.kind !== 'error') continue
    if (/changed since|undefined|TypeError|Cannot read|is not a function/i.test(t.message)) out.push(`error toast: "${t.message}"`)
  }

  // 10. A click outside a popover only closes it — it never also presses what
  //     is underneath (here the + button, which would open a menu).
  if (kind === 'app-click-away' && step.after) {
    if (step.after.stillOpen) out.push(`clicking outside the ${step.popover} did not close it`)
    if (step.after.contextMenu || step.after.modal) out.push(`clicking outside the ${step.popover} also pressed the + button underneath (a ${step.after.modal ?? 'menu'} opened)`)
  }

  // 8. An outside change is never mistaken for the app's own.
  if (kind.startsWith('git-') && after.externalUndo?.byApp) out.push(`outside ${kind} was attributed to the app — it would not be offered for undo`)

  // 9. An outside uncommit hands its message back, into an empty composer.
  if (kind === 'git-reset' && step.mode !== 'hard' && draftBefore === '' && typed === null) {
    const dropped = gitOk('rev-parse', 'HEAD@{1}')
    const subject = dropped && gitOk('log', '-1', '--format=%s', dropped)
    // Restored means: in the composer, or waiting for it to open (when Details
    // is on something else, the composer is not on screen to receive it).
    const restored = (s) => s.draft === subject || s.pendingMessage === subject
    if (subject && !restored(after)) {
      await page.waitForTimeout(600) // the message is read from git asynchronously
      const later = await page.evaluate((p) => {
        const ui = window.__shot.ui.getState()
        return { draft: window.__shot.repo.getState().drafts[p] ?? '', pendingMessage: ui.composerIntent?.path === p ? ui.composerIntent.summary : null }
      }, after.repoPath)
      if (!restored(later)) out.push(`outside uncommit (${step.style}, --${step.mode}) did not restore "${subject}" to the composer (it shows "${later.draft}")`)
    }
  }
  void dirtyBefore
  return out
}

// ─── Running and reporting ──────────────────────────────────────────────────
;(async () => {
  if (!fs.existsSync(join(ROOT, 'out/main/index.js'))) {
    console.error('No build found — run `npm run build` first.')
    process.exit(2)
  }
  fs.mkdirSync(FOUND, { recursive: true })
  const plans = REPLAY
    ? [{ label: `replay ${REPLAY}`, steps: JSON.parse(fs.readFileSync(REPLAY, 'utf8')).steps }]
    : (SEED ? [Number(SEED)] : Array.from({ length: RUNS }, () => Math.floor(Math.random() * 1e9))).map((seed) => ({
        label: `seed ${seed}`,
        seed,
        steps: generate(rng(seed), STEPS)
      }))

  let failed = 0
  for (const plan of plans) {
    const result = await runSequence(plan.label, plan.steps)
    if (!result.failures.length) {
      console.log(`✓ ${plan.label} — ${result.steps.filter((s) => s.applied).length} steps, every rule held`)
      continue
    }
    failed++
    const f = result.failures[0]
    const file = join(FOUND, `${new Date().toISOString().replace(/[:.]/g, '-')}-${plan.seed ?? 'replay'}.json`)
    fs.writeFileSync(file, JSON.stringify({ seed: plan.seed ?? null, failure: f, steps: result.steps }, null, 2))
    console.log(`✗ ${plan.label} — broke at step ${f.step} (${f.kind}):`)
    for (const p of f.problems) console.log(`    • ${p}`)
    if (VERBOSE) console.log(JSON.stringify({ app: f.app, reflog: f.reflog, gitStatus: f.gitStatus, trace: f.trace }, null, 2))
    console.log(`    steps: ${result.steps.map((s) => (s.applied ? s.kind : `(${s.kind})`)).join(' → ')}`)
    console.log(`    replay: npm run hunt -- --replay ${file}`)
  }
  console.log(`\n${plans.length - failed}/${plans.length} sequences held every rule.`)
  process.exitCode = failed ? 1 : 0
})().catch((e) => { console.error(e); process.exitCode = 1 })
