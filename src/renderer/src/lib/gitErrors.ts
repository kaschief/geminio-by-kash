/**
 * Turning raw git failures into something a person can act on. Pure — no React,
 * no IPC — so the parsing is pinned down by tests against real git output.
 */

/**
 * Electron wraps every rejected IPC call as
 * `Error invoking remote method 'git': Error: …`, and simple-git adds its own
 * `GitError:` — neither tells the user anything.
 */
const WRAPPER_PREFIX = /^(?:Error invoking remote method '[^']*':\s*)?(?:(?:Git)?Error:\s*)*/

/**
 * Git prints its verdict on an `error:` or `fatal:` line, but commands like
 * `stash apply` print a whole `git status` first, so a toast that shows the
 * opening lines shows "On branch main / Your branch is up to date" — the one
 * part that is not the problem. Lead with the verdict and keep the rest below
 * it, where "Show more" still reaches it.
 */
export function readableGitError(raw: string): string {
  const message = raw.replace(WRAPPER_PREFIX, '').trim()
  const lines = message.split('\n')
  const verdictAt = lines.findIndex((l) => /^(?:error|fatal):\s/.test(l))
  if (verdictAt <= 0) return message
  const verdict = lines[verdictAt].replace(/^(?:error|fatal):\s*/, '')
  const rest = [...lines.slice(0, verdictAt), ...lines.slice(verdictAt + 1)].join('\n').trim()
  return rest ? `${verdict}\n\n${rest}` : verdict
}

/**
 * The files git refused to overwrite in "Your local changes to the following
 * files would be overwritten by merge/checkout", or null when the message is
 * some other failure. Git lists them tab-indented, one per line.
 */
export function overwrittenLocalChanges(raw: string): string[] | null {
  const lines = raw.split('\n')
  const at = lines.findIndex((l) => /Your local changes to the following files would be overwritten/.test(l))
  if (at === -1) return null
  const files: string[] = []
  for (const line of lines.slice(at + 1)) {
    if (!line.startsWith('\t')) break
    files.push(line.trim())
  }
  return files
}

/** At most `max` names, then an ellipsis — enough to recognise, short enough for a toast. */
export function summarizePaths(paths: string[], max = 3): string {
  const shown = paths.slice(0, max).join(', ')
  return paths.length > max ? `${shown}, …` : shown
}
