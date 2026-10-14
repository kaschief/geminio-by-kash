/**
 * Which background repositories (open in a tab, but not the active one) are due
 * for a re-read of what their tab mark shows. Only the active repository is
 * watched, so without this a commit, reset or push made from a terminal or an
 * agent leaves a background tab's push badge or changes dot frozen until the
 * tab is opened. Each repository is re-read at most once per `minGapMs`, so a
 * flurry of window focus changes costs nothing extra.
 */
export function backgroundMarksDue(
  paths: Iterable<string>,
  activePath: string | null,
  lastAt: ReadonlyMap<string, number>,
  now: number,
  minGapMs: number
): string[] {
  const due: string[] = []
  const seen = new Set<string>()
  for (const path of paths) {
    if (path === activePath || seen.has(path)) continue
    seen.add(path)
    const last = lastAt.get(path)
    if (last === undefined || now - last >= minGapMs) due.push(path)
  }
  return due
}
