import type { TranslationKey } from '../i18n'

export type LintLevel = 'warn' | 'error'

export interface LintHint {
  level: LintLevel
  /** Dictionary key; render with `interp(t(key), vars)`. */
  key: TranslationKey
  vars?: Record<string, string | number>
}

/**
 * Turn a rejected commit hook's output into what to fix. commitlint prints one
 * `✖ <problem> [rule-id]` line per broken rule; each known rule becomes its own
 * hint, an unknown one keeps commitlint's wording rather than a vague "rejected".
 * Returns null when the failure was not a commit-message hook at all.
 */
export function commitHookProblems(message: string): LintHint[] | null {
  const problems: LintHint[] = []
  for (const line of message.split('\n')) {
    const m = /^\s*✖\s+(.*?)\s*\[([\w-]+)\]\s*$/.exec(line)
    if (m) problems.push(hookRuleHint(m[2], m[1]))
  }
  // Older commitlint output, or the rule ids alone without the ✖ framing.
  if (!problems.length && /subject-empty|type-empty/i.test(message)) {
    problems.push({ level: 'error', key: 'commitLint.hookNeedsType' })
  }
  if (problems.length) {
    // `type-empty` and `subject-empty` arrive together for one cause.
    const seen = new Set<string>()
    return problems.filter((p) => !seen.has(p.key) && seen.add(p.key))
  }
  if (/commitlint|commit-msg script failed/i.test(message)) return [{ level: 'error', key: 'commitLint.hookRejected' }]
  return null
}

function hookRuleHint(rule: string, text: string): LintHint {
  const limit = /(\d+) characters/.exec(text)?.[1] ?? ''
  const list = /\[([^\]]+)\]/.exec(text)?.[1] ?? ''
  switch (rule) {
    case 'type-empty':
    case 'subject-empty':
      return { level: 'error', key: 'commitLint.hookNeedsType' }
    case 'subject-case':
      return { level: 'error', key: 'commitLint.rule.subjectCase' }
    case 'type-case':
      return { level: 'error', key: 'commitLint.rule.typeCase' }
    case 'type-enum':
      return { level: 'error', key: 'commitLint.rule.typeEnum', vars: { types: list } }
    case 'scope-enum':
      return { level: 'error', key: 'commitLint.rule.scopeEnum', vars: { scopes: list } }
    case 'header-max-length':
      return { level: 'error', key: 'commitLint.rule.headerMax', vars: { max: limit } }
    case 'body-max-line-length':
    case 'footer-max-line-length':
      return { level: 'error', key: 'commitLint.rule.lineMax', vars: { max: limit } }
    case 'subject-full-stop':
      return { level: 'error', key: 'commitLint.trailingPeriod' }
    case 'body-leading-blank':
    case 'footer-leading-blank':
      return { level: 'error', key: 'commitLint.rule.leadingBlank' }
    default:
      return { level: 'error', key: 'commitLint.rule.other', vars: { reason: text } }
  }
}

const SUBJECT_IDEAL = 50
const SUBJECT_MAX = 72
const BODY_WRAP = 72
const CONVENTIONAL = /^(\w+)(\([^)]*\))?!?:\s/
const PAST_TENSE = /^(added|fixed|changed|updated|removed|created)\b/i

/** How a repository writes its subjects, read from its own history. */
export interface CommitStyleProfile {
  /** Most recent subjects start with a Conventional type (`feat:`, `fix(ui):`). */
  conventional: boolean
  /** …and the text after the type starts in lower case (`feat: add`, not `feat: Add`). */
  lowerDescription: boolean
}

const PLAIN_STYLE: CommitStyleProfile = { conventional: false, lowerDescription: false }

/**
 * Infer the house style from recent subjects, so the hints argue for the rules
 * this repository actually follows — not "Capitalize" in a repository whose
 * commitlint rejects capitals. Merges and reverts say nothing about style.
 */
export function inferCommitStyle(subjects: readonly string[]): CommitStyleProfile {
  const sample = subjects.filter((s) => !/^(Merge|Revert) /.test(s)).slice(0, 30)
  if (sample.length < 3) return PLAIN_STYLE
  const conventional = sample.filter((s) => CONVENTIONAL.test(s))
  if (conventional.length / sample.length < 0.6) return PLAIN_STYLE
  const firsts = conventional.map((s) => s.replace(CONVENTIONAL, '')[0] ?? '').filter((c) => c.toLowerCase() !== c.toUpperCase())
  const lower = firsts.filter((c) => c === c.toLowerCase()).length
  return { conventional: true, lowerDescription: firsts.length > 0 && lower / firsts.length >= 0.7 }
}

/**
 * Lint a commit message (subject + optional body) against the repository's
 * conventions. Each hint names one thing to change. Non-blocking — these are
 * hints, not hard gates.
 */
export function lintCommit(summary: string, body: string, style: CommitStyleProfile = PLAIN_STYLE): LintHint[] {
  const hints: LintHint[] = []
  const s = summary.trim()
  if (!s) return hints

  if (s.length > SUBJECT_MAX)
    hints.push({ level: 'error', key: 'commitLint.subjectTooLong', vars: { len: s.length, max: SUBJECT_MAX } })
  else if (s.length > SUBJECT_IDEAL)
    hints.push({ level: 'warn', key: 'commitLint.subjectLong', vars: { len: s.length, ideal: SUBJECT_IDEAL } })

  if (/[.]$/.test(s)) hints.push({ level: 'warn', key: 'commitLint.trailingPeriod' })

  const isConventional = CONVENTIONAL.test(s)
  // The words after the type are what the casing and mood rules judge.
  const text = isConventional ? s.replace(CONVENTIONAL, '') : s
  // A word is only judged once it is finished — a space after it. Mid-word,
  // `t` may be on its way to `test:` and `Ad` to `ADR`; a hint there would be
  // second-guessing someone who has not finished typing.
  const firstWordDone = /^\S+\s/.test(text)

  if (firstWordDone) {
    if (style.conventional && !isConventional) {
      hints.push({ level: 'warn', key: 'commitLint.needsType' })
    } else if (isConventional && style.lowerDescription && /^[A-Z]/.test(text)) {
      // commitlint's subject-case rejects `API docs` as firmly as `Add docs`.
      hints.push({ level: 'warn', key: 'commitLint.lowercaseDescription' })
    } else if (!isConventional && !style.conventional && /^[a-z]/.test(text)) {
      hints.push({ level: 'warn', key: 'commitLint.capitalize' })
    }
    if (PAST_TENSE.test(text)) hints.push({ level: 'warn', key: 'commitLint.imperative' })
  }

  // Body: blank line after subject is enforced on join, so only wrap-width here.
  const longLine = body.split('\n').find((l) => l.length > BODY_WRAP)
  if (longLine) hints.push({ level: 'warn', key: 'commitLint.wrapBody', vars: { width: BODY_WRAP } })

  return hints
}

/** Color band for the subject character counter. */
export function subjectCounterLevel(len: number): '' | 'warn' | 'error' {
  if (len > SUBJECT_MAX) return 'error'
  if (len > SUBJECT_IDEAL) return 'warn'
  return ''
}

export const SUBJECT_IDEAL_LEN = SUBJECT_IDEAL

/** Conventional-Commit types (matches the project's commitlint allow-list). */
export const CC_TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'] as const

const CC_PREFIX = /^(\w+)(\([^)]*\))?(!)?:\s*/

/** Split a summary into its Conventional-Commit prefix parts (empty type if none). */
export function parseCcPrefix(summary: string): { type: string; scope: string; bang: string; rest: string } {
  const m = CC_PREFIX.exec(summary)
  if (m && (CC_TYPES as readonly string[]).includes(m[1])) {
    return { type: m[1], scope: m[2] ?? '', bang: m[3] ?? '', rest: summary.slice(m[0].length) }
  }
  return { type: '', scope: '', bang: '', rest: summary }
}

/** Apply (or, with an empty type, strip) a Conventional-Commit type prefix,
 *  preserving any existing scope/`!` and the rest of the subject. */
export function applyCcType(summary: string, type: string): string {
  const { rest, scope, bang } = parseCcPrefix(summary)
  return type ? `${type}${scope}${bang}: ${rest}` : rest
}

/** Apply (or, with an empty scope, strip) a Conventional-Commit scope. Only
 *  meaningful once a type is set — a bare `(scope):` is not a valid prefix. */
export function applyCcScope(summary: string, scope: string): string {
  const { type, bang, rest } = parseCcPrefix(summary)
  if (!type) return summary
  const s = scope.trim()
  return `${type}${s ? `(${s})` : ''}${bang}: ${rest}`
}

/** The scope currently written on the subject, without its parentheses. */
export function currentCcScope(summary: string): string {
  return parseCcPrefix(summary).scope.replace(/^\(|\)$/g, '')
}

/** Common gitmoji, each with a short intent label (shown in the picker).
 *  Labels are dictionary keys — resolve them with `t()` at render time. */
export const GITMOJIS: { emoji: string; labelKey: TranslationKey }[] = [
  { emoji: '✨', labelKey: 'gitmoji.feature' },
  { emoji: '🐛', labelKey: 'gitmoji.fix' },
  { emoji: '📝', labelKey: 'gitmoji.docs' },
  { emoji: '💄', labelKey: 'gitmoji.style' },
  { emoji: '♻️', labelKey: 'gitmoji.refactor' },
  { emoji: '⚡️', labelKey: 'gitmoji.performance' },
  { emoji: '✅', labelKey: 'gitmoji.tests' },
  { emoji: '👷', labelKey: 'gitmoji.ci' },
  { emoji: '🔧', labelKey: 'gitmoji.chore' },
  { emoji: '⏪️', labelKey: 'gitmoji.revert' },
  { emoji: '🎉', labelKey: 'gitmoji.init' },
  { emoji: '🔥', labelKey: 'gitmoji.remove' },
  { emoji: '🚧', labelKey: 'gitmoji.wip' },
  { emoji: '🔒️', labelKey: 'gitmoji.security' },
  { emoji: '⬆️', labelKey: 'gitmoji.upgradeDeps' },
  { emoji: '🚀', labelKey: 'gitmoji.deploy' }
]

/** Find a leading gitmoji on the summary (empty emoji if none). */
export function parseGitmojiPrefix(summary: string): { emoji: string; rest: string } {
  for (const g of GITMOJIS) {
    if (summary === g.emoji) return { emoji: g.emoji, rest: '' }
    if (summary.startsWith(g.emoji + ' ')) return { emoji: g.emoji, rest: summary.slice(g.emoji.length + 1) }
  }
  return { emoji: '', rest: summary }
}

/** Apply (or, with an empty emoji, strip) a leading gitmoji on the subject. */
export function applyGitmoji(summary: string, emoji: string): string {
  const { rest } = parseGitmojiPrefix(summary)
  return emoji ? `${emoji} ${rest}` : rest
}

const TICKET_PREFIX = /^([A-Z][A-Z0-9]+-\d+):\s*/

/** Split a leading `KEY-123: ` ticket prefix from the subject (empty if none). */
export function parseTicketPrefix(summary: string): { ticket: string; rest: string } {
  const m = TICKET_PREFIX.exec(summary)
  return m ? { ticket: m[1], rest: summary.slice(m[0].length) } : { ticket: '', rest: summary }
}

/** Apply (or, with an empty ticket, strip) a `KEY-123: ` prefix on the subject. */
export function applyTicket(summary: string, ticket: string): string {
  const { rest } = parseTicketPrefix(summary)
  const t = ticket.trim().toUpperCase()
  return t ? `${t}: ${rest}` : rest
}

/** Pull a ticket key out of a branch name, if present (e.g. `feat/ABC-123-x`). */
export function ticketFromBranch(branch: string): string {
  return /([A-Z][A-Z0-9]+-\d+)/.exec(branch ?? '')?.[1] ?? ''
}
