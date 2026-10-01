/**
 * The headless half of the `geminio` command.
 *
 * `resources/cli/geminio` sends a verb here — `doctor`, `status`, `repos`,
 * `commit-check`, `config`, `editor`, `completions` — when the answer belongs
 * in the terminal rather than in a window. The shim runs this file through the
 * app binary with `ELECTRON_RUN_AS_NODE`, i.e. as plain Node: **nothing
 * imported from here may touch electron**, or the command turns into a second
 * app instance that the single-instance lock immediately kills.
 *
 * The contract with a caller is git's contract: text on stdout, diagnostics on
 * stderr, and an exit code that means something. `geminio doctor` in a CI job
 * is the whole point — the guard rails a repository declares in `.geminio.json`
 * are worth little if only the person with the GUI open ever sees them.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve, isAbsolute } from 'node:path'
import { homedir } from 'node:os'
import { REPO_CONFIG_FILE, isRepoConfigEmpty, parseRepoConfig, serializeRepoConfig } from '../shared/repoConfig'
import { knownRepos, matchesRepo, resolveRepo } from '../shared/cliRepos'
import { readRepoConfig, runRepoDoctor, applyDoctorFix, suggestRepoConfig } from './repoConfig'
import { checkCommitMessage, type CommitCheckIssue } from '../shared/commitCheck'
import type { DoctorCheck, RepoConfig } from '../shared/types'

const pexecFile = promisify(execFile)

// ─── Terminal output ────────────────────────────────────────────────────────

// Colour only when someone is actually looking. Piped into a file, a log
// collector or `grep`, escape codes are noise at best and corruption at worst.
const tty = process.stdout.isTTY === true && !process.env.NO_COLOR
const paint = (code: string, s: string): string => (tty ? `\u001b[${code}m${s}\u001b[0m` : s)
const bold = (s: string): string => paint('1', s)
const dim = (s: string): string => paint('2', s)
const red = (s: string): string => paint('31', s)
const green = (s: string): string => paint('32', s)
const yellow = (s: string): string => paint('33', s)
const cyan = (s: string): string => paint('36', s)

const out = (line = ''): void => {
  process.stdout.write(`${line}\n`)
}
const err = (line: string): void => {
  process.stderr.write(`${line}\n`)
}

const OK = green('✓')
const WARN = yellow('!')
const FAIL = red('✗')

// ─── Repository resolution ──────────────────────────────────────────────────

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await pexecFile('git', args, { cwd, timeout: 20_000, maxBuffer: 8 * 1024 * 1024 })
  return stdout.trim()
}

const gitOr = (cwd: string, args: string[], fallback = ''): Promise<string> =>
  git(cwd, args).catch(() => fallback)

/** The repository containing `dir` (default: cwd). Resolving to the top level
 *  rather than accepting the cwd verbatim is what lets every verb be run from a
 *  subdirectory, the way git itself can. */
async function repoRoot(dir?: string): Promise<string> {
  const start = resolve(dir ?? process.cwd())
  if (!existsSync(start)) {
    err(`geminio: no such directory: ${start}`)
    process.exit(2)
  }
  const top = await gitOr(start, ['rev-parse', '--show-toplevel'])
  if (!top) {
    err(`geminio: not a git repository: ${start}`)
    process.exit(2)
  }
  return top
}

// ─── Flags ──────────────────────────────────────────────────────────────────

interface Args {
  /** Positional arguments, in order, with flags removed. */
  rest: string[]
  has(flag: string): boolean
  value(flag: string): string | undefined
}

/** A deliberately small parser: long flags, `--flag` or `--flag=value`, plus a
 *  handful of single-letter aliases. Everything else is positional. */
function parseArgs(argv: string[], aliases: Record<string, string> = {}): Args {
  const flags = new Map<string, string | true>()
  const rest: string[] = []
  for (const token of argv) {
    if (token.startsWith('--')) {
      const eq = token.indexOf('=')
      if (eq === -1) flags.set(token.slice(2), true)
      else flags.set(token.slice(2, eq), token.slice(eq + 1))
    } else if (token.startsWith('-') && token.length > 1 && aliases[token.slice(1)]) {
      flags.set(aliases[token.slice(1)], true)
    } else {
      rest.push(token)
    }
  }
  return {
    rest,
    has: (flag) => flags.has(flag),
    value: (flag) => {
      const v = flags.get(flag)
      return typeof v === 'string' ? v : undefined
    }
  }
}

// ─── geminio doctor ─────────────────────────────────────────────────────────

function doctorLine(check: DoctorCheck): string {
  const mark = check.status === 'ok' ? OK : check.status === 'warn' ? WARN : FAIL
  const want = check.expected ? dim(` wants ${check.expected}`) : ''
  const got = check.actual ? dim(` · found ${check.actual}`) : check.status === 'ok' ? '' : dim(' · missing')
  return `  ${mark} ${bold(check.id)}${want}${got}`
}

async function cmdDoctor(argv: string[]): Promise<number> {
  const args = parseArgs(argv)
  const root = await repoRoot(args.rest[0])
  const { config } = await readRepoConfig(root)
  if (!config?.requires) {
    out(`${dim('No requirements declared in')} ${REPO_CONFIG_FILE}${dim('.')}`)
    out(dim(`Run \`geminio config init\` to propose one from what this repository already contains.`))
    return 0
  }

  let checks = await runRepoDoctor(root)
  if (args.has('fix')) {
    for (const check of checks) {
      if (check.status === 'ok' || !check.fix) continue
      try {
        await applyDoctorFix(root, check.fix)
        out(`  ${OK} fixed ${bold(check.id)}`)
      } catch (e) {
        out(`  ${FAIL} could not fix ${bold(check.id)}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    checks = await runRepoDoctor(root)
  }

  out(bold(`Doctor · ${root}`))
  for (const check of checks) {
    out(doctorLine(check))
    if (check.why) out(`      ${dim(check.why)}`)
  }
  const failed = checks.filter((c) => c.status === 'fail')
  const warned = checks.filter((c) => c.status === 'warn')
  out()
  if (!failed.length && !warned.length) out(`${OK} ${checks.length} check${checks.length === 1 ? '' : 's'} passed.`)
  else out(`${failed.length} failing, ${warned.length} warning, ${checks.length} total.`)
  // Warnings are things the doctor could not determine, not things that are
  // wrong — failing a build on them would make the file too costly to adopt.
  return failed.length ? 1 : 0
}

// ─── geminio status ─────────────────────────────────────────────────────────

interface StatusCounts {
  staged: number
  unstaged: number
  untracked: number
  conflicted: number
}

function countPorcelain(porcelain: string): StatusCounts {
  const counts: StatusCounts = { staged: 0, unstaged: 0, untracked: 0, conflicted: 0 }
  for (const line of porcelain.split('\n')) {
    if (!line) continue
    const x = line[0]
    const y = line[1]
    if (x === '?') counts.untracked++
    else if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) counts.conflicted++
    else {
      if (x !== ' ') counts.staged++
      if (y !== ' ') counts.unstaged++
    }
  }
  return counts
}

async function cmdStatus(argv: string[]): Promise<number> {
  const args = parseArgs(argv)
  const root = await repoRoot(args.rest[0])
  const [branch, upstream, porcelain, stashes, lastCommit] = await Promise.all([
    gitOr(root, ['rev-parse', '--abbrev-ref', 'HEAD'], 'HEAD'),
    gitOr(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']),
    gitOr(root, ['status', '--porcelain']),
    gitOr(root, ['stash', 'list']),
    gitOr(root, ['log', '-1', '--format=%h %s %cr'])
  ])
  const counts = countPorcelain(porcelain)
  const ahead = upstream ? await gitOr(root, ['rev-list', '--count', `${upstream}..HEAD`], '0') : '0'
  const behind = upstream ? await gitOr(root, ['rev-list', '--count', `HEAD..${upstream}`], '0') : '0'
  const { config } = await readRepoConfig(root)

  const tracking = upstream
    ? `${dim('→')} ${upstream}${Number(ahead) ? ` ${green(`↑${ahead}`)}` : ''}${Number(behind) ? ` ${yellow(`↓${behind}`)}` : ''}`
    : dim('no upstream')

  out(`${bold(root.split('/').pop() ?? root)}  ${dim(root)}`)
  out(`  ${cyan(branch)} ${tracking}`)
  if (lastCommit) out(`  ${dim(lastCommit)}`)

  const parts: string[] = []
  if (counts.conflicted) parts.push(red(`${counts.conflicted} conflicted`))
  if (counts.staged) parts.push(green(`${counts.staged} staged`))
  if (counts.unstaged) parts.push(yellow(`${counts.unstaged} modified`))
  if (counts.untracked) parts.push(dim(`${counts.untracked} untracked`))
  const stashCount = stashes ? stashes.split('\n').filter(Boolean).length : 0
  if (stashCount) parts.push(dim(`${stashCount} stashed`))
  out(`  ${parts.length ? parts.join(dim(' · ')) : green('clean')}`)

  if (config) {
    const protectedHere = (config.protect ?? []).some((p) => branchMatchesGlob(p, branch))
    if (protectedHere) out(`  ${WARN} ${branch} is protected by ${REPO_CONFIG_FILE}`)
    const checklist = config.checklist?.push ?? []
    if (checklist.length) {
      out()
      out(bold('Before you push'))
      for (const item of checklist) out(`  ${dim('•')} ${item}`)
    }
  }
  return counts.conflicted ? 1 : 0
}

/** `protect` entries are globs, matched the way the app matches them. Local to
 *  this module so the headless path does not import the shared regex builder's
 *  UI-facing neighbours. */
function branchMatchesGlob(pattern: string, branch: string): boolean {
  if (!pattern.includes('*')) return pattern === branch
  const rx = new RegExp(`^${pattern.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`)
  return rx.test(branch)
}

// ─── geminio commit-check ───────────────────────────────────────────────────

async function cmdCommitCheck(argv: string[]): Promise<number> {
  // `-m "text"` reads better in a shell than `--message=text`, and a hook is
  // handed a file path, so both shapes have to work.
  const inlineIdx = argv.findIndex((a) => a === '-m' || a === '--message')
  const args = parseArgs(argv.filter((_, i) => inlineIdx < 0 || (i !== inlineIdx && i !== inlineIdx + 1)))
  const inline = inlineIdx >= 0 ? argv[inlineIdx + 1] : args.value('message')
  const positional = args.rest

  const cwd = process.cwd()
  const root = await repoRoot(args.value('repo'))
  let raw: string
  if (inline !== undefined) {
    raw = inline
  } else {
    const file = positional[0] ?? join(root, '.git', 'COMMIT_EDITMSG')
    const path = isAbsolute(file) ? file : resolve(cwd, file)
    raw = await readFile(path, 'utf8').catch(() => '')
    if (!raw) {
      err(`geminio: nothing to check — no message given and ${path} is empty`)
      return 2
    }
  }

  const { config } = await readRepoConfig(root)
  const branch = await gitOr(root, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const issues = checkCommitMessage(raw, { config, branch })
  return reportCommitIssues(issues)
}

function reportCommitIssues(issues: CommitCheckIssue[]): number {
  if (!issues.length) {
    out(`${OK} Commit message looks good.`)
    return 0
  }
  for (const issue of issues) {
    const mark = issue.level === 'error' ? FAIL : WARN
    out(`  ${mark} ${issue.message} ${dim(`(${issue.code})`)}`)
  }
  const errors = issues.filter((i) => i.level === 'error').length
  return errors ? 1 : 0
}

// ─── geminio config ─────────────────────────────────────────────────────────

async function cmdConfig(argv: string[]): Promise<number> {
  const args = parseArgs(argv)
  const [sub, dir] = args.rest
  const root = await repoRoot(dir)
  const file = join(root, REPO_CONFIG_FILE)

  switch (sub) {
    case undefined:
    case 'show': {
      const raw = await readFile(file, 'utf8').catch(() => '')
      if (!raw) {
        out(dim(`No ${REPO_CONFIG_FILE} in ${root}.`))
        return 0
      }
      out(raw.trimEnd())
      return 0
    }
    case 'check': {
      const raw = await readFile(file, 'utf8').catch(() => '')
      if (!raw) {
        err(`geminio: no ${REPO_CONFIG_FILE} in ${root}`)
        return 2
      }
      const { config, issues } = parseRepoConfig(raw)
      if (!config) {
        out(`${FAIL} ${REPO_CONFIG_FILE} could not be read as a v1 config.`)
        for (const i of issues) out(`  ${FAIL} ${i.field}: ${i.code}`)
        return 1
      }
      for (const i of issues) out(`  ${WARN} ${i.field}: ${i.code} ${dim('(dropped)')}`)
      out(issues.length ? `${WARN} ${issues.length} field(s) dropped; the rest applies.` : `${OK} ${REPO_CONFIG_FILE} is valid.`)
      return 0
    }
    case 'init': {
      if (existsSync(file) && !args.has('force')) {
        err(`geminio: ${REPO_CONFIG_FILE} already exists — pass --force to overwrite`)
        return 2
      }
      const suggested = await suggestRepoConfig(root)
      if (isRepoConfigEmpty(suggested)) {
        out(dim('Nothing to propose: no .nvmrc, submodules, LFS, hooks path or consistent commit scopes found.'))
        return 0
      }
      const text = serializeRepoConfig(suggested)
      if (args.has('dry-run')) {
        out(text)
        return 0
      }
      await writeFile(file, text, 'utf8')
      out(`${OK} Wrote ${REPO_CONFIG_FILE}`)
      out(dim('Review it before committing — it becomes every teammate’s rules.'))
      summarizeConfig(suggested)
      return 0
    }
    default:
      err(`geminio config: unknown subcommand "${sub}" (expected init, show or check)`)
      return 2
  }
}

function summarizeConfig(config: RepoConfig): void {
  if (config.protect?.length) out(`  ${dim('protect')} ${config.protect.join(', ')}`)
  if (config.requires?.node) out(`  ${dim('node')} ${config.requires.node}`)
  if (config.commit?.scopes?.length) out(`  ${dim('scopes')} ${config.commit.scopes.join(', ')}`)
}

// ─── geminio repos ──────────────────────────────────────────────────────────

/** Where the desktop app keeps its settings, per platform. Mirrors Electron's
 *  own `app.getPath('userData')` — which is unavailable here, because importing
 *  electron is exactly what this entry point may not do. */
function userDataDir(): string {
  const home = homedir()
  if (process.platform === 'darwin') return join(home, 'Library', 'Application Support', 'Geminio')
  if (process.platform === 'win32') return join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'Geminio')
  return join(process.env.XDG_CONFIG_HOME ?? join(home, '.config'), 'Geminio')
}

function readSettings(): unknown {
  const file = join(userDataDir(), 'gitcito-settings.json')
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

async function cmdRepos(argv: string[]): Promise<number> {
  const args = parseArgs(argv)
  const repos = knownRepos(readSettings())
  if (!repos.length) {
    out(dim('No repositories yet — open one in Geminio, or run `geminio .` in a checkout.'))
    return 0
  }
  const filter = args.rest[0]?.toLowerCase()
  const shown = filter ? repos.filter((r) => matchesRepo(r, filter)) : repos
  if (args.has('paths')) {
    // Machine-readable, for `cd "$(geminio repos --paths api | head -1)"`.
    for (const repo of shown) out(repo.path)
    return shown.length ? 0 : 1
  }
  // Pad name and group separately: the paths only line up if the two columns
  // before them are each fixed width.
  const nameWidth = Math.max(...shown.map((r) => r.name.length), 0)
  const groupWidth = Math.max(...shown.map((r) => (r.group ? r.group.length + 2 : 0)), 0)
  for (const repo of shown) {
    const group = (repo.group ? `[${repo.group}]` : '').padEnd(groupWidth)
    out(`  ${bold(repo.name.padEnd(nameWidth))}  ${dim(group)}  ${dim(repo.path)}`)
  }
  return shown.length ? 0 : 1
}

/** Resolve `geminio open <name>` against the known repositories. Exported for
 *  the shim's `--resolve` mode, which needs the path before it can call `open`. */
async function cmdResolve(argv: string[]): Promise<number> {
  const needle = argv[0]?.toLowerCase()
  if (!needle) return 2
  const hit = resolveRepo(knownRepos(readSettings()), needle)
  if (!hit) return 1
  out(hit.path)
  return 0
}

// ─── geminio editor ─────────────────────────────────────────────────────────

/** Wire (or unwire) Geminio as git's message editor. `--wait` is what makes it
 *  usable there: git blocks until the file comes back, so the command has to
 *  block too. */
async function cmdEditor(argv: string[]): Promise<number> {
  const args = parseArgs(argv)
  const scope = args.has('local') ? '--local' : '--global'
  const cwd = args.has('local') ? await repoRoot() : process.cwd()
  const sub = args.rest[0] ?? 'install'

  const set = async (key: string, value?: string): Promise<void> => {
    if (value === undefined) await pexecFile('git', ['config', scope, '--unset', key], { cwd }).catch(() => undefined)
    else await pexecFile('git', ['config', scope, key, value], { cwd })
  }

  if (sub === 'uninstall') {
    await set('core.editor')
    await set('sequence.editor')
    out(`${OK} Geminio is no longer git’s editor (${scope.slice(2)}).`)
    return 0
  }
  if (sub !== 'install') {
    err(`geminio editor: unknown subcommand "${sub}" (expected install or uninstall)`)
    return 2
  }
  await set('core.editor', 'geminio --wait')
  await set('sequence.editor', 'geminio --wait')
  out(`${OK} git will now open commit messages and rebase todos in Geminio (${scope.slice(2)}).`)
  out(dim('Undo with `geminio editor uninstall`.'))
  return 0
}

// ─── geminio completions ────────────────────────────────────────────────────

const HEADLESS_VERBS = ['doctor', 'status', 'repos', 'commit-check', 'config', 'editor', 'completions', 'help']
const WINDOW_VERBS = [
  'open',
  'diff',
  'graph',
  'blame',
  'show',
  'search',
  'conflicts',
  'stack',
  'stash',
  'reflog',
  'todos',
  'chat',
  'settings',
  'terminal',
  'insights',
  'history',
  'ci',
  'clean',
  'bisect',
  'absorb',
  'snapshots',
  'timelapse',
  'time-machine',
  'maintenance',
  'export',
  'objects',
  'hooks',
  'lfs',
  'sparse',
  'subtree',
  'gitflow',
  'purge',
  'changelog'
]
const ALL_VERBS = [...HEADLESS_VERBS, ...WINDOW_VERBS].sort()

function completions(shell: string): number {
  const verbs = ALL_VERBS.join(' ')
  switch (shell) {
    case 'bash':
      out(`# geminio bash completion — add to ~/.bashrc:
#   eval "$(geminio completions bash)"
_geminio() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  if [ "\$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( \$(compgen -W "${verbs}" -- "\$cur") )
  else
    COMPREPLY=( \$(compgen -d -- "\$cur") )
  fi
}
complete -F _geminio geminio`)
      return 0
    case 'zsh':
      out(`# geminio zsh completion — add to ~/.zshrc:
#   eval "$(geminio completions zsh)"
_geminio() {
  if (( CURRENT == 2 )); then
    compadd ${verbs}
  else
    _files -/
  fi
}
compdef _geminio geminio`)
      return 0
    case 'fish':
      out(`# geminio fish completion — write to ~/.config/fish/completions/geminio.fish:
#   geminio completions fish > ~/.config/fish/completions/geminio.fish
complete -c geminio -f
complete -c geminio -n "__fish_use_subcommand" -a "${verbs}"
complete -c geminio -n "not __fish_use_subcommand" -a "(__fish_complete_directories)"`)
      return 0
    default:
      err('geminio completions: expected bash, zsh or fish')
      return 2
  }
}

// ─── Help & version ─────────────────────────────────────────────────────────

function appVersion(): string {
  // Inside the packaged app this resolves within app.asar; in a source checkout
  // it lands on the repository's own package.json. Both sit two levels above
  // the built `out/main/` file.
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as { version?: string }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function usage(): void {
  const h = (s: string): string => bold(s)
  out(`${h('geminio')} — Geminio from the command line

${h('OPEN')}
  geminio [path]                 Open a repository (default: the current directory)
  geminio open <name|path>       Open by tab name — \`geminio open api\` finds it
  geminio [path] -n <name>       …with a display name
  geminio [path] -g <group>      …inside a group tab

${h('JUMP STRAIGHT TO A SURFACE')}
  geminio diff [path]            Working changes
  geminio graph [path]           The commit graph
  geminio show <ref>             One commit, in detail
  geminio blame <file> [-l N]    Blame, scrolled to a line
  geminio search <query>         Search the repository's code
  geminio conflicts | stack | stash | reflog | todos | chat | settings
  geminio ci | clean | bisect | absorb | snapshots | insights | terminal
                                 …and the rest — \`geminio help verbs\` lists them

${h('ANSWER IN THE TERMINAL')}
  geminio status [path]          Branch, tracking, working tree, push checklist
  geminio doctor [path] [--fix]  Check what ${REPO_CONFIG_FILE} requires. Exit 1 on failure
  geminio commit-check [file]    Lint a commit message. Exit 1 on an error
  geminio config init|show|check Propose, print or validate ${REPO_CONFIG_FILE}
  geminio repos [filter]         Repositories Geminio knows about (--paths for scripts)

${h('SET UP')}
  geminio editor install         Use Geminio for commit messages and rebase todos
  geminio completions <shell>    bash · zsh · fish

${h('OPTIONS')}
  -w, --wait                     Block until the opened file is closed (for git)
  -n, --name <name>              Display name for the tab
  -g, --group <group>            Group tab to open in
  -l, --line <n>                 Line to scroll to
  -h, --help                     This text
  -V, --version                  Version

${dim('Docs: https://myappdesk.github.io/gitcito/help/cli.html')}`)
}

function verbList(): void {
  out(bold('In the terminal'))
  out(`  ${HEADLESS_VERBS.join(', ')}`)
  out()
  out(bold('In the window'))
  out(`  ${WINDOW_VERBS.join(', ')}`)
}

// ─── Entry ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const [verb, ...rest] = process.argv.slice(2)
  let code = 0
  switch (verb) {
    case 'doctor':
      code = await cmdDoctor(rest)
      break
    case 'status':
      code = await cmdStatus(rest)
      break
    case 'commit-check':
      code = await cmdCommitCheck(rest)
      break
    case 'config':
      code = await cmdConfig(rest)
      break
    case 'repos':
      code = await cmdRepos(rest)
      break
    case '--resolve':
      code = await cmdResolve(rest)
      break
    case 'editor':
      code = await cmdEditor(rest)
      break
    case 'completions':
      code = completions(rest[0] ?? '')
      break
    case 'help':
    case '--help':
    case '-h':
      if (rest[0] === 'verbs') verbList()
      else usage()
      break
    case '--version':
    case '-V':
      out(appVersion())
      break
    default:
      err(`geminio: unknown command "${verb}"`)
      usage()
      code = 2
  }
  process.exit(code)
}

main().catch((e) => {
  err(`geminio: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(2)
})
