import { ExternalLink } from 'lucide-react'
import { useLayoutEffect, useEffect, useMemo, useRef, useState } from 'react'
import { X, GitCommitHorizontal, Loader2, Search, ChevronUp, ChevronDown, Save } from 'lucide-react'
import type { BlameLine, BlobSpec, FileHistoryEntry, NumberedLine } from '../../../shared/types'
import { gitApi, shellApi } from '../infrastructure/api'
import { useSettingsStore } from '../stores/settings'
import { useUIStore, fileViewKey, type FileReaderSession, type FileViewMode, type FileViewState } from '../stores/ui'
import { useRepoStore, repoActions, type HunkActionKind } from '../stores/repo'
import { canonicalRepoPath } from '../lib/repoAlias'
import { filePermalink } from '../lib/autolink'
import { revealLineWhenReady } from '../lib/reveal'
import { openInEditor, editorLineMenuItems } from '../lib/editorOpen'
import { useT, interp, type TranslationKey } from '../i18n'
import { useHoverExplain } from './HoverExplain'
import { DiffViewer, type HunkAction } from './DiffViewer'
import { ElasticFileNavigation } from './ElasticFileNavigation'
import { useAiReady } from './useAiReady'
import { displayPath } from '../lib/pathDisplay'
import { SemanticSummary } from './SemanticSummary'
import { buildQueryRegExp, highlightHtml, type HighlightLayer } from './FileSearchBar'
import { fileExt, guessLanguage, highlightLine } from '../lib/highlight'
import { formatBytes, parseTooLargeError } from '../lib/fileSize'
import { isSecretFile, maskSecretLine } from '../lib/secrets'
import { Eye, EyeOff, Bookmark as BookmarkIcon } from 'lucide-react'
import { ImageDiff } from './ImageDiff'
import { PreviewPane } from './PreviewPane'
import { GutterMark, ChangeGutterPopup } from './ChangeGutter'
import { FileMinimap } from './FileMinimap'
import { computeGutterChanges, gutterMarksByLine, type GutterChange } from '../lib/diff'
import { previewKind, isBinaryKind } from '../preview/registry'
import { GRAPH_COLORS } from '../graph/layout'

const MODES: { id: FileViewMode; labelKey: TranslationKey }[] = [
  { id: 'preview', labelKey: 'fileViewer.modePreview' },
  { id: 'file', labelKey: 'fileViewer.modeFile' },
  { id: 'diff', labelKey: 'fileViewer.modeDiff' },
  { id: 'blame', labelKey: 'fileViewer.modeBlame' },
  { id: 'history', labelKey: 'fileViewer.modeHistory' }
]

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'avif'])

/** Above this many lines the view gets `is-huge`, letting the browser skip
 *  layout/paint for offscreen rows (`content-visibility: auto`). The DOM stays
 *  complete, so find, reveal-line and text selection behave exactly as before. */
const HUGE_LINES = 5000

function isImage(name: string): boolean {
  return IMAGE_EXTS.has(fileExt(name))
}

function shaColor(sha: string): string {
  let h = 0
  for (let i = 0; i < 7; i++) h = (h * 31 + sha.charCodeAt(i)) | 0
  return GRAPH_COLORS[Math.abs(h) % GRAPH_COLORS.length]
}

function sourceRef(view: FileViewState): string | undefined {
  if (view.source.type === 'commit') return view.source.hash
  if (view.source.type === 'stash') return view.source.untracked ? `${view.source.sha}^3` : view.source.sha
  if (view.source.type === 'tree') return undefined
  return view.source.staged ? ':0' : undefined
}

/**
 * The two versions the current diff compares, for the semantic summary.
 * Mirrors what the diff itself shows: a commit against its first parent, the
 * index against HEAD when staged, the working tree against the index when not.
 */
function diffSides(view: FileViewState): { oldSide: BlobSpec; newSide: BlobSpec } | null {
  const s = view.source
  if (s.type === 'commit') {
    return { oldSide: { kind: 'ref', ref: `${s.hash}^1` }, newSide: { kind: 'ref', ref: s.hash } }
  }
  if (s.type === 'stash') {
    if (s.untracked) return { oldSide: { kind: 'empty' }, newSide: { kind: 'ref', ref: `${s.sha}^3` } }
    return { oldSide: { kind: 'ref', ref: `${s.sha}^1` }, newSide: { kind: 'ref', ref: s.sha } }
  }
  if (s.type === 'wip') {
    if (s.untracked) return { oldSide: { kind: 'empty' }, newSide: { kind: 'worktree' } }
    if (s.staged) return { oldSide: { kind: 'ref', ref: 'HEAD' }, newSide: { kind: 'index' } }
    return { oldSide: { kind: 'index' }, newSide: { kind: 'worktree' } }
  }
  return null // the project tree has no diff mode
}

function blameRef(view: FileViewState): string | undefined {
  if (view.source.type === 'commit') return view.source.hash
  if (view.source.type === 'stash') return view.source.untracked ? `${view.source.sha}^3` : view.source.sha
  return undefined
}

/** Refs for the before/after sides of an image diff. before === null means the
 *  side does not exist (added file); after === undefined means the working tree. */
function imageDiffRefs(view: FileViewState): { before: string | null; after?: string } {
  const s = view.source
  if (s.type === 'commit') return { before: `${s.hash}^`, after: s.hash }
  if (s.type === 'stash')
    return s.untracked ? { before: null, after: `${s.sha}^3` } : { before: `${s.sha}^1`, after: s.sha }
  if (s.type === 'tree') return { before: 'HEAD', after: undefined }
  if (s.untracked) return { before: null, after: undefined }
  return { before: 'HEAD', after: s.staged ? ':0' : undefined }
}

export function FileViewer({ view }: { view: FileViewState }): React.JSX.Element {
  const setFileView = useUIStore((s) => s.setFileView)
  const openContextMenu = useUIStore((s) => s.openContextMenu)
  const setEditorDirty = useUIStore((s) => s.setEditorDirty)
  const openModal = useUIStore((s) => s.openModal)
  const toast = useUIStore((s) => s.toast)
  const fileSearch = useUIStore((s) => s.fileSearch)
  const searchRe = useMemo(() => (fileSearch ? buildQueryRegExp(fileSearch, true) : null), [fileSearch])
  const readerKey = fileViewKey(view)
  const restoredReader = useRef((() => {
    const saved = useUIStore.getState().fileReaders[view.repoPath]
    return saved?.key === readerKey ? saved : undefined
  })()).current
  const cachedContent = restoredReader?.mode === view.mode && (view.mode === 'diff' || view.mode === 'file') && !isImage(view.file)
    ? restoredReader.content ?? null : null
  const contentIdentity = useRef(cachedContent !== null
    ? JSON.stringify([readerKey, view.mode, restoredReader?.ignoreWs ?? false, restoredReader?.editing ?? false, null, false]) : null)
  const restoringDraft = useRef(restoredReader?.editing ? restoredReader.draft : null)
  const restoringScroll = useRef(restoredReader)
  const bodyRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const preRef = useRef<HTMLPreElement>(null)

  // ─── In-file find (Ctrl/Cmd+F) — layers on top of the right-panel filter ───
  const [findOpen, setFindOpen] = useState(restoredReader?.findOpen ?? false)
  // The diff's display toggles portal into this header slot (see DiffViewer).
  const [diffToolsHost, setDiffToolsHost] = useState<HTMLDivElement | null>(null)
  // The floating layer over the content (find bar, line-selection actions).
  const [overlayHost, setOverlayHost] = useState<HTMLDivElement | null>(null)
  const [find, setFind] = useState(restoredReader?.find ?? { query: '', caseSensitive: false, wholeWord: false, regex: false })
  const [hitCount, setHitCount] = useState(0)
  const [activeHit, setActiveHit] = useState(0)
  const findInputRef = useRef<HTMLInputElement>(null)
  const findRe = useMemo(
    () => (find.query ? buildQueryRegExp(find, true) : null),
    [find.query, find.caseSensitive, find.wholeWord, find.regex]
  )
  // Find layer first so it wins overlaps and is the navigable one; the filter
  // layer from the right panel stays as a secondary highlight ("more matches").
  const layers = useMemo<HighlightLayer[]>(() => {
    const ls: HighlightLayer[] = []
    if (findRe) ls.push({ re: findRe, className: 'find-hit' })
    if (searchRe) ls.push({ re: searchRe, className: 'search-hit' })
    return ls
  }, [findRe, searchRe])

  // Where the reader was when they started searching. Typing jumps to each
  // partial match ("t", "te", "tes"…); when the full query matches nothing, the
  // view goes back here instead of stranding them wherever the last partial
  // match happened to be.
  const findOriginRef = useRef<number | null>(null)
  const openFind = (): void => {
    if (!findOpen) findOriginRef.current = bodyRef.current?.scrollTop ?? null
    setFindOpen(true)
    setFind((f) =>
      f.query
        ? f
        : {
            query: fileSearch?.query ?? '',
            caseSensitive: fileSearch?.caseSensitive ?? false,
            wholeWord: fileSearch?.wholeWord ?? false,
            regex: fileSearch?.regex ?? false
          }
    )
    requestAnimationFrame(() => {
      findInputRef.current?.focus()
      findInputRef.current?.select()
    })
  }
  const closeFind = (): void => {
    setFindOpen(false)
    findOriginRef.current = null
  }
  const goHit = (delta: number): void =>
    setActiveHit((i) => (hitCount ? (i + delta + hitCount) % hitCount : 0))
  const t = useT()
  // Ready, not merely enabled: with no key the Explain button and hover cards
  // could only ever say "No AI API key configured".
  const aiEnabled = useAiReady('explain')
  const hoverExplainOn = useSettingsStore((s) => s.activeProfile().ai.hoverExplain !== false)
  const hoverExplainKey = useSettingsStore((s) => s.activeProfile().ai.hoverExplainKey ?? 'shift')
  const [content, setContent] = useState<string | null>(cachedContent)
  // Size-cap refusal from main (byte count) + the user's explicit override.
  const [tooLarge, setTooLarge] = useState<number | null>(null)
  const [forceLoad, setForceLoad] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imgDiff, setImgDiff] = useState<{ before: string | null; after: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [blame, setBlame] = useState<BlameLine[]>([])
  // When set, blame is computed at this ref instead of the view's ref — lets you
  // walk a line's history backwards via "reblame at parent".
  const [blameOverrideRef, setBlameOverrideRef] = useState<string | null>(null)
  const [history, setHistory] = useState<FileHistoryEntry[]>([])

  const [refreshKey, setRefreshKey] = useState(0)
  const [ignoreWs, setIgnoreWs] = useState(restoredReader?.ignoreWs ?? false)

  // ─── In-app editing (project-tree files only) ───
  const [editing, setEditing] = useState(restoredReader?.editing ?? false)
  const [draft, setDraft] = useState(restoredReader?.draft ?? '')
  const [saving, setSaving] = useState(false)

  const { repoPath, file, mode, source } = view

  // Park only the open reader for this repo. Layout cleanup runs before its
  // DOM is removed; late cleanup may never overwrite a newer file selection.
  const readerSession = useRef<FileReaderSession>({ key: readerKey, mode, editing, draft, findOpen, find, ignoreWs, content, semantic: restoredReader?.semantic, scroll: [] })
  readerSession.current = { ...readerSession.current, key: readerKey, mode, editing, draft, findOpen, find, ignoreWs, content }
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body) return
    return () => {
      const scrollers = [body, ...body.querySelectorAll<HTMLElement>('.diff-split-col, textarea')]
      useUIStore.getState().rememberFileReader(view, {
        ...readerSession.current,
        scroll: scrollers.map((el) => ({ top: el.scrollTop, left: el.scrollLeft }))
      })
    }
  }, [readerKey])
  useLayoutEffect(() => {
    const saved = restoringScroll.current
    if (!saved || saved.mode !== mode || content === null) return
    // Restore in the layout phase: deferring this to the next animation frame
    // paints the file at the top once before jumping to the saved position.
    const body = bodyRef.current
    if (!body) return
    const scrollers = [body, ...body.querySelectorAll<HTMLElement>('.diff-split-col, textarea')]
    scrollers.forEach((el, i) => {
      const position = saved.scroll[i]
      if (position) { el.scrollTop = position.top; el.scrollLeft = position.left }
    })
    restoringScroll.current = undefined
  }, [content, mode])

  // Clear any blame "rewind" when switching files/repos.
  useEffect(() => setBlameOverrideRef(null), [file, repoPath])
  useEffect(() => setForceLoad(false), [file, repoPath])

  // ─── Open a line in the external editor ───
  // Only for content that still matches what is on disk: a file shown at some
  // commit would send the editor to a line that has since moved.
  const editorSetting = useSettingsStore((s) => s.settings.editor)
  const editorTracksDisk = source.type === 'tree' || source.type === 'wip'
  // ─── Bookmarks in the gutter ───
  // A mark on the line itself, and a click target that appears on hover: the
  // context menu is where you go when you already know the feature exists.
  const addBookmark = useSettingsStore((s) => s.addBookmark)
  const deleteBookmark = useSettingsStore((s) => s.deleteBookmark)
  const bookmarksByRepo = useSettingsStore((s) => s.settings.repoBookmarks)
  const markedLines = useMemo(() => {
    const marks = new Map<number, string>()
    for (const b of bookmarksByRepo?.[canonicalRepoPath(repoPath)] ?? []) {
      if (b.file === file) marks.set(b.line, b.id)
    }
    return marks
  }, [bookmarksByRepo, repoPath, file])

  const toggleBookmark = (line: number, text: string): void => {
    const existing = markedLines.get(line)
    if (existing) {
      deleteBookmark(repoPath, existing)
      toast('info', t('bookmarks.removed'))
      return
    }
    const branch = useRepoStore.getState().repos[repoPath]?.status?.current
    addBookmark(repoPath, { file, line, snippet: text, ...(branch ? { branch } : {}) })
    toast('info', t('bookmarks.added'))
  }
  const lineMenu = (line: number) => (e: React.MouseEvent): void => {
    // A rewound blame ("blaming at <sha>^") lists lines as they were then, and
    // the row's own menu (the sha actions) wins where it has already answered.
    if (!editorTracksDisk || blameOverrideRef || e.defaultPrevented) return
    const items = editorLineMenuItems(editorSetting, { path: `${repoPath}/${file}`, line, repo: repoPath })
    // The line's own text is stored with the bookmark: it is what finds the
    // line again once the file has moved on (see lib/bookmarks.ts).
    const snippet = (content ?? '').split('\n')[line - 1] ?? ''
    // The same toggle the gutter offers: a line that already has a bookmark
    // needs the way back out, not a second copy of it.
    const marked = markedLines.has(line)
    if (items.length) items.push({ separator: true })
    items.push({
      label: marked ? t('bookmarks.remove') : t('bookmarks.add'),
      icon: <BookmarkIcon size={13} />,
      ...(marked ? { danger: true } : {}),
      onClick: () => toggleBookmark(line, snippet)
    })
    e.preventDefault()
    openContextMenu(e.clientX, e.clientY, items)
  }

  // Secret masking: KEY=•••• in .env/key files, on by default, per-view reveal.
  const maskSecretsSetting = useSettingsStore((s) => s.settings.maskSecrets)
  const [revealSecrets, setRevealSecrets] = useState(false)
  const fileIsSecret = isSecretFile(file)
  const maskOn = fileIsSecret && maskSecretsSetting && !revealSecrets
  const maybeMask = (l: string): string => (maskOn ? maskSecretLine(l) : l)

  // ─── Change gutter (File view, on-disk files: wip and tree) + minimap ───
  const showChangeGutterSetting = useSettingsStore((s) => s.settings.showChangeGutter)
  const showMinimapSetting = useSettingsStore((s) => s.settings.showMinimap)
  const [gutterChanges, setGutterChanges] = useState<GutterChange[]>([])
  const [openChange, setOpenChange] = useState<{ index: number; rect: DOMRect } | null>(null)
  const gutterByLine = useMemo(() => gutterMarksByLine(gutterChanges), [gutterChanges])

  const gutterWanted =
    showChangeGutterSetting && (source.type === 'wip' || source.type === 'tree') && mode === 'file' && !editing

  useEffect(() => {
    if (!gutterWanted) {
      setGutterChanges([])
      return
    }
    let cancelled = false
    const [staged, untracked] = source.type === 'wip' ? [source.staged, source.untracked] : [false, false]
    gitApi
      .diffFile(repoPath, file, staged, untracked, false)
      .then((diff) => {
        if (!cancelled) setGutterChanges(computeGutterChanges(diff))
      })
      .catch(() => {
        if (!cancelled) setGutterChanges([])
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoPath, file, gutterWanted, refreshKey, source.type === 'wip' ? source.staged : '', source.type === 'wip' ? source.untracked : ''])

  useEffect(() => setOpenChange(null), [repoPath, file, mode, editing])

  const gotoChange = (index: number): void => {
    const change = gutterChanges[index]
    if (!change) return
    requestAnimationFrame(() => {
      const row = bodyRef.current?.querySelectorAll('.code-line')[change.lineStart - 1] as HTMLElement | undefined
      row?.scrollIntoView({ block: 'center' })
      requestAnimationFrame(() => {
        const mark = row?.querySelector('.code-gutter') as HTMLElement | undefined
        const rect = (mark ?? row)?.getBoundingClientRect()
        if (rect) setOpenChange({ index, rect })
      })
    })
  }

  // Re-fetch working-tree content when the window regains focus/visibility.
  // Suspended while editing so a window-focus reload can't discard the buffer.
  useEffect(() => {
    if (source.type !== 'wip' || editing) return
    const refresh = (): void => setRefreshKey((k) => k + 1)
    const onVisible = (): void => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [source.type, editing])
  const lang = guessLanguage(file)
  const fileIsImage = isImage(file)
  const pvKind = previewKind(file)
  // Image files already render inline in File view, so they don't need a
  // separate Preview tab. Binary docs (pdf/video/audio/sheet/word) have no
  // meaningful text view — they offer Preview + History only.
  const previewable = !!pvKind && !fileIsImage
  const binaryDoc = !!pvKind && isBinaryKind(pvKind) && !fileIsImage
  // Host permalink to this file at the viewed commit (commit source + a remote).
  const repoData = useRepoStore((s) => s.repos[repoPath])
  const originUrl = repoData?.remotes.find((r) => r.name === 'origin')?.url ?? repoData?.remotes[0]?.url
  const permalink = source.type === 'commit' ? filePermalink(originUrl, source.hash, file) : undefined
  // Which two blobs the semantic summary should compare (null for the project
  // tree, which has no diff mode).
  const semanticSides = useMemo(() => diffSides(view), [view])

  // A real on-disk working-tree file (project tree, or any WIP entry). These can
  // be edited; the editor always reads/writes the working copy even when the
  // File view is otherwise showing the staged (':0') version.
  const onDiskFile = source.type === 'tree' || source.type === 'wip'
  // The file can be edited at all (drives the Edit button, shown from any mode).
  const editableFile = onDiskFile && !fileIsImage && !binaryDoc
  // The editor is actually mounted (File view + editing toggled on).
  const editable = editableFile && mode === 'file' && content !== null
  const dirty = editing && content !== null && draft !== content

  // Mirror the dirty flag to the store so navigation guards can see it; leaving
  // the viewer (or the file) always clears it.
  useEffect(() => {
    setEditorDirty(dirty, repoPath)
  }, [dirty, setEditorDirty, repoPath])
  useEffect(() => () => setEditorDirty(false, repoPath), [setEditorDirty, repoPath])

  const saveDraft = async (): Promise<void> => {
    if (!dirty || saving) return
    setSaving(true)
    try {
      await shellApi.writeFiles(repoPath, [{ path: file, content: draft }])
      setContent(draft)
      setEditorDirty(false, repoPath)
      toast('success', `Saved ${file.split('/').pop()}`)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  // Syntax-highlighted backdrop for the editor. A trailing newline keeps the
  // last (possibly empty) line rendered so the textarea and backdrop align.
  const editorHtml = useMemo(
    () => draft.split('\n').map((l) => highlightLine(l, lang) || '&nbsp;').join('\n') + '\n',
    [draft, lang]
  )
  const syncEditorScroll = (): void => {
    if (preRef.current && editorRef.current) {
      preRef.current.scrollTop = editorRef.current.scrollTop
      preRef.current.scrollLeft = editorRef.current.scrollLeft
    }
  }

  // Enter edit mode — switch to File view first (the editor only lives there).
  const startEditing = (): void => {
    if (mode !== 'file') setFileView({ ...view, mode: 'file' })
    setEditing(true)
  }

  // Guarded close — prompt before throwing away unsaved edits.
  const requestClose = (): void => {
    if (dirty) {
      openModal({
        kind: 'confirm',
        title: t('fileViewer.discardTitle'),
        message: interp(t('fileViewer.discardMessage'), { file: file.split('/').pop() ?? '' }),
        danger: true,
        confirmLabel: t('fileViewer.discard'),
        onConfirm: () => {
          setEditorDirty(false, repoPath)
          setFileView(null, repoPath)
        }
      })
    } else {
      setFileView(null, repoPath)
    }
  }

  // Hover-to-explain over the file and blame views (the diff view has its own,
  // inside DiffViewer). Never over a masked secret file — the token would be a
  // run of bullets — and never while the editor owns the text.
  // Built lazily on demand: a memoized copy would keep a second full split of
  // the file alive next to `content` for the whole life of the view.
  const hoverLines = (): NumberedLine[] =>
    content ? content.split('\n').map((text, i) => ({ no: i + 1, text })) : []
  const { hoverProps, armed: hoverArmed, card: hoverCard } = useHoverExplain({
    enabled: aiEnabled && hoverExplainOn && (mode === 'file' || mode === 'blame') && !editing && !maskOn,
    file,
    lang,
    modifier: hoverExplainKey,
    getLines: hoverLines,
    lineOf: (el) => {
      const no = el.closest('.code-line, .blame-line')?.querySelector('.code-no')?.textContent
      const n = Number(no)
      return Number.isInteger(n) && n > 0 ? n : null
    }
  })

  // Blame can't run on images or files that don't exist in history (untracked/new).
  const isUntracked =
    (source.type === 'wip' && source.untracked) || (source.type === 'stash' && source.untracked)
  const blameAvailable = !fileIsImage && !isUntracked
  let modes = MODES.filter((m) => m.id !== 'blame' || blameAvailable)
  if (!previewable) modes = modes.filter((m) => m.id !== 'preview')
  if (binaryDoc) modes = modes.filter((m) => m.id === 'preview' || m.id === 'history')
  // A plain working-tree file has no commit/stash to diff against here.
  if (source.type === 'tree') modes = modes.filter((m) => m.id !== 'diff')
  const modeAvailable = modes.some((m) => m.id === mode)

  // If the active mode isn't available for this file, fall back to the first
  // available one (Preview for binary docs, File view otherwise).
  useEffect(() => {
    if (!modeAvailable && modes[0]) setFileView({ ...view, mode: modes[0].id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, modeAvailable])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && editable) {
        e.preventDefault()
        void saveDraft()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        openFind()
        return
      }
      // `defaultPrevented`: something closer already took this Escape (a find bar,
      // a field reverting its value). Without the check, closing the find bar
      // re-renders first, this listener then sees it closed, and the same key
      // press closes the whole file.
      if (e.key === 'Escape' && !e.defaultPrevented && !useUIStore.getState().modal) {
        if (findOpen) closeFind()
        else requestClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setFileView, findOpen, fileSearch, editable, dirty, draft, content, saving])

  useEffect(() => {
    let cancelled = false
    const identity = JSON.stringify([readerKey, mode, ignoreWs, editing, blameOverrideRef, forceLoad])
    const resumed = contentIdentity.current === identity
    const acceptContent = (text: string): void => { contentIdentity.current = identity; setContent(text) }
    // A returning reader paints its previous text immediately. Re-read disk in
    // the background so edits made while this repository was away still arrive.
    if (!resumed) {
      contentIdentity.current = null
      setContent(null)
      setImageUrl(null)
      setImgDiff(null)
    }
    setError(null)
    setTooLarge(null)
    const load = async (): Promise<void> => {
      try {
        if (mode === 'preview') {
          // PreviewPane fetches its own content; just clear the loading spinner.
          if (!cancelled) acceptContent('')
          return
        }
        if (fileIsImage && mode === 'diff') {
          const refs = imageDiffRefs(view)
          const result = await gitApi.imageDiff(repoPath, file, refs.before, refs.after)
          if (!cancelled) {
            setImgDiff(result)
            acceptContent('')
          }
          return
        }
        if (fileIsImage && mode === 'file') {
          const url = await gitApi.fileDataUrl(repoPath, file, sourceRef(view), forceLoad)
          if (!cancelled) {
            setImageUrl(url)
            acceptContent('')
          }
          return
        }
        if (mode === 'diff') {
          const text =
            source.type === 'commit'
              ? await gitApi.commitFileDiff(repoPath, source.hash, file, ignoreWs)
              : source.type === 'stash'
                ? await gitApi.stashFileDiff(repoPath, source.sha, file, source.untracked, ignoreWs)
                : source.type === 'wip'
                  ? await gitApi.diffFile(repoPath, file, source.staged, source.untracked, ignoreWs)
                  : ''
          if (!cancelled) acceptContent(text)
        } else if (mode === 'file') {
          // While editing, always read the on-disk working copy (ignore the
          // staged ':0' ref) so edits and saves target the real file.
          const ref = editing && onDiskFile ? undefined : sourceRef(view)
          const text = await gitApi.fileContent(repoPath, file, ref, forceLoad)
          if (!cancelled) {
            acceptContent(text)
            // Seed the editor buffer from this authoritative load (entering edit
            // or switching file/mode). User keystrokes never trigger a reload, so
            // this can't clobber unsaved typing.
            if (editing) {
              const savedDraft = restoringDraft.current
              setDraft((current) => resumed ? current : savedDraft ?? text)
              restoringDraft.current = null
            }
          }
        } else if (mode === 'blame') {
          const lines = await gitApi.blameFile(repoPath, file, blameOverrideRef ?? blameRef(view))
          if (!cancelled) {
            setBlame(lines)
            acceptContent('')
          }
        } else {
          const entries = await gitApi.fileHistory(repoPath, file)
          if (!cancelled) {
            setHistory(entries)
            acceptContent('')
          }
        }
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        const size = parseTooLargeError(message)
        if (size !== null) setTooLarge(size)
        else setError(message)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    repoPath,
    file,
    mode,
    refreshKey,
    forceLoad,
    blameOverrideRef,
    editing,
    ignoreWs,
    source.type,
    source.type === 'commit' ? source.hash : source.type === 'stash' ? source.sha : source.type === 'wip' ? source.staged : ''
  ])

  // Recount find hits whenever the query/content/layers change; clamp active.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const marks = bodyRef.current?.querySelectorAll('mark.find-hit')
      const n = marks?.length ?? 0
      setHitCount(n)
      setActiveHit((i) => (n ? Math.min(i, n - 1) : 0))
      if (n === 0 && findOriginRef.current !== null && bodyRef.current) {
        bodyRef.current.scrollTop = findOriginRef.current
      }
    })
    return () => cancelAnimationFrame(id)
  }, [findRe, searchRe, content, mode, file])

  // Mark the active find hit and scroll it into view.
  useEffect(() => {
    const marks = bodyRef.current?.querySelectorAll('mark.find-hit')
    if (!marks || marks.length === 0) return
    marks.forEach((m, i) => m.classList.toggle('active', i === activeHit))
    marks[activeHit]?.scrollIntoView({ block: 'center' })
  }, [activeHit, hitCount, findRe])

  // Opened from a search result: scroll to (and flash) the exact matching line
  // once the file/diff has rendered. Wins over the "first match" scroll below.
  useEffect(() => {
    if (view.line == null) return
    return revealLineWhenReady(view.line)
  }, [view.line, view.revealSeq, view.file, content, mode])

  // When only the right-panel filter is active (no find open), scroll to its
  // first match so the user sees why the file matched.
  useEffect(() => {
    if (findOpen || !searchRe || content === null || view.line != null) return
    const id = requestAnimationFrame(() => {
      bodyRef.current?.querySelector('mark.search-hit')?.scrollIntoView({ block: 'center' })
    })
    return () => cancelAnimationFrame(id)
  }, [searchRe, content, mode, file, findOpen])

  // Which edge(s) of the control strip hide something, for the fade. Measured on
  // scroll and on resize — the window, the panel beside it, or the mode changing
  // which controls exist.
  const controlsRef = useRef<HTMLDivElement>(null)
  const [controlsClip, setControlsClip] = useState<'start' | 'end' | 'both' | undefined>(undefined)
  const measureControls = (): void => {
    const el = controlsRef.current
    if (!el) return
    const hiddenStart = el.scrollLeft > 1
    const hiddenEnd = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setControlsClip(hiddenStart && hiddenEnd ? 'both' : hiddenStart ? 'start' : hiddenEnd ? 'end' : undefined)
  }
  useEffect(() => {
    const el = controlsRef.current
    if (!el) return
    const ro = new ResizeObserver(measureControls)
    ro.observe(el)
    // The diff toggles portal in after this runs, and a button appearing widens
    // the content without resizing the strip itself — watch the children too.
    const mo = new MutationObserver(measureControls)
    mo.observe(el, { childList: true, subtree: true })
    measureControls()
    return () => {
      ro.disconnect()
      mo.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, editing, diffToolsHost])

  // Which hunk actions fit the diff on screen. With whitespace ignored they still
  // work: the patch is applied matching whitespace loosely (see applyHunkPatch),
  // so they do what the visible diff shows. None for an untracked working file
  // (no index version to stage against hunk by hunk — stage the file), and none
  // for a conflicted file, whose combined diff (`diff --cc`) `git apply` cannot
  // read — resolve it in the conflict view instead.
  const isCombinedDiff = !!content && /^diff --cc /m.test(content)
  const hunkActions = useMemo<HunkAction[]>(() => {
    if (isCombinedDiff) return []
    const action = (kind: HunkActionKind, hunkKey: TranslationKey, linesKey: TranslationKey): HunkAction => ({
      id: kind,
      hunkLabel: t(hunkKey),
      linesLabel: (n) => interp(t(linesKey), { n }),
      reverse: kind !== 'stage' && kind !== 'apply',
      // Forward (stage, apply) is green; anything that takes work back or away
      // (unstage, revert, discard) is red — one rule, whatever the undo story.
      intent: kind === 'stage' || kind === 'apply' ? 'forward' : 'backward',
      run: (patch) =>
        void repoActions.applyHunk(repoPath, patch, kind, ignoreWs).then(() => setRefreshKey((k) => k + 1))
    })
    if (source.type === 'wip' && !source.untracked) {
      return source.staged
        ? [action('unstage', 'hunk.unstage', 'hunk.unstageLines')]
        : [action('stage', 'diff.stageHunk', 'hunk.stageLines'), action('discard', 'hunk.discard', 'hunk.discardLines')]
    }
    if (source.type === 'commit') return [action('revert', 'hunk.revert', 'hunk.revertLines')]
    // A stash's untracked files diff as new files; applying creates the file.
    if (source.type === 'stash') return [action('apply', 'hunk.apply', 'hunk.applyLines')]
    return []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ignoreWs, isCombinedDiff, source, repoPath, t])

  // A plain mouse wheel only scrolls vertically; on the sideways-only control
  // strip, turn it into horizontal scrolling so the hidden end stays reachable.
  const scrollSideways = (e: React.WheelEvent<HTMLDivElement>): void => {
    const el = e.currentTarget
    if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
    el.scrollLeft += e.deltaY
  }

  const pathDepth = useSettingsStore((s) => s.settings.pathDepth ?? 'all')
  const headerPath = displayPath(file, pathDepth)

  const openPathMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    const copy = (text: string, done: string): void => {
      void navigator.clipboard.writeText(text)
      toast('success', done)
    }
    useUIStore.getState().openContextMenu(e.clientX, e.clientY, [
      { label: t('fileViewer.copyPath'), onClick: () => copy(file, t('fileViewer.pathCopied')) },
      ...(permalink
        ? [{ label: t('fileViewer.copyLink'), onClick: () => copy(permalink, t('fileViewer.permalinkCopied')) }]
        : []),
      // Editing in place is rare (most edits happen in an editor), so it lives
      // here rather than as a header button.
      ...(editableFile && !(editable && editing) ? [{ label: t('fileViewer.editFile'), onClick: startEditing }] : [])
    ])
  }

  const sourceChip =
    source.type === 'commit' ? (
      <span className="fv-chip commit">{source.hash.slice(0, 7)}</span>
    ) : source.type === 'stash' ? (
      <span className="fv-chip stash">{t('fileViewer.chipStash')}</span>
    ) : source.type === 'tree' ? (
      <span className={`fv-chip working${dirty ? ' dirty' : ''}`}>{dirty ? t('fileViewer.chipUnsaved') : t('fileViewer.chipWorkingTree')}</span>
    ) : (
      <span className={`fv-chip ${source.staged ? 'staged' : 'unstaged'}`}>{source.staged ? t('fileViewer.chipStaged') : t('fileViewer.chipUnstaged')}</span>
    )

  return (
    <div className="file-viewer" data-mode={mode}>
      <div className="fv-header">
        {/* Right-click for the path and the permalink — rarely needed, so they
            do not take a header button. */}
        <span className="fv-path" title={file} onContextMenu={openPathMenu}>
          {headerPath.dir && <span className="fv-dir">{headerPath.dir}</span>}
          <strong className="fv-name">{headerPath.name}</strong>
        </span>
        {sourceChip}
        {/* Everything but the close button lives in one strip that scrolls
            sideways when the window is too narrow for it; close stays pinned. */}
        <div className="fv-controls" ref={controlsRef} data-clip={controlsClip} onWheel={scrollSideways} onScroll={measureControls}>
        <div className="fv-modes">
          {modes.map((m) => (
            <button
              key={m.id}
              className={`fv-mode ${mode === m.id ? 'active' : ''}`}
              onClick={() => setFileView({ ...view, mode: m.id })}
            >
              {t(m.labelKey)}
            </button>
          ))}
        </div>
        {mode === 'diff' && imgDiff === null && <div className="fv-diff-tools" ref={setDiffToolsHost} />}
        {fileIsSecret && maskSecretsSetting && (
          <button
            className="btn ghost small"
            title={revealSecrets ? t('fileViewer.hideSecrets') : t('fileViewer.revealSecrets')}
            onClick={() => setRevealSecrets((v) => !v)}
          >
            {revealSecrets ? <EyeOff size={13} /> : <Eye size={13} />} {revealSecrets ? t('fileViewer.hide') : t('fileViewer.reveal')}
          </button>
        )}
        {editable && editing && (
          <button
            className="btn small fv-save-btn"
            disabled={!dirty || saving}
            title={t('fileViewer.save')}
            onClick={() => void saveDraft()}
          >
            {saving ? <Loader2 size={13} className="spin" /> : <Save size={13} />} {t('common.save')}
          </button>
        )}
        </div>
        {editorSetting?.command && (
          <button className="icon-btn fv-open-editor" aria-label={interp(t('editor.openIn'), { app: editorSetting.name })}
            title={interp(t('editor.openWorkingFile'), { editor: editorSetting.name })}
            onClick={() => void openInEditor(editorSetting, { path: `${repoPath}/${file}`, repo: repoPath })}>
            <ExternalLink size={15} />
          </button>
        )}
        <button className="icon-btn" title={t('fileViewer.close')} onClick={requestClose}>
          <X size={15} />
        </button>
      </div>

      <div className="fv-body-wrap fv-elastic-wrap">
        <ElasticFileNavigation bodyRef={bodyRef} view={view}
          enabled={!editing && !error && tooLarge === null && content !== null && (mode === 'diff' || mode === 'file')} />
        {/* Floating chrome — the find bar, the diff's line-selection actions —
            lives on a layer over the content that never scrolls and takes no
            space, so opening either moves nothing. The diff find bar sits
            below the first hunk header, including in narrow panes. */}
        <div className="fv-overlay" ref={setOverlayHost}>
          {findOpen && (
            <div className="fv-find">
              <Search size={13} className="fv-find-icon" />
              <input
                ref={findInputRef}
                className={`fv-find-input${find.query.trim() && hitCount === 0 ? ' is-no-results' : ''}`}
                placeholder={t('fileViewer.findPlaceholder')}
                value={find.query}
                spellCheck={false}
                onChange={(e) => setFind((f) => ({ ...f, query: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    goHit(e.shiftKey ? -1 : 1)
                  } else if (e.key === 'Escape') {
                    // Escape here means "leave the find bar", never "close the file":
                    // keep it from reaching the viewer's window-level shortcut.
                    e.preventDefault()
                    e.stopPropagation()
                    closeFind()
                  }
                }}
              />
              <div className="fv-find-toggles">
                <button
                  className={`fs-toggle${find.caseSensitive ? ' active' : ''}`}
                  title={t('fileSearch.matchCase')}
                  onClick={() => setFind((f) => ({ ...f, caseSensitive: !f.caseSensitive }))}
                >
                  Aa
                </button>
                <button
                  className={`fs-toggle${find.wholeWord ? ' active' : ''}`}
                  title={t('fileSearch.matchWholeWord')}
                  onClick={() => setFind((f) => ({ ...f, wholeWord: !f.wholeWord }))}
                >
                  ab
                </button>
                <button
                  className={`fs-toggle${find.regex ? ' active' : ''}`}
                  title={t('fileSearch.useRegex')}
                  onClick={() => setFind((f) => ({ ...f, regex: !f.regex }))}
                >
                  .*
                </button>
              </div>
              <span className="fv-find-count" role="status" aria-live="polite">
                {!find.query.trim()
                  ? ''
                  : hitCount
                    ? interp(t('find.position'), { i: activeHit + 1, n: hitCount })
                    : t('search.noResults')}
              </span>
              <button className="icon-btn" title={t('fileViewer.findPrev')} disabled={!hitCount} onClick={() => goHit(-1)}>
                <ChevronUp size={14} />
              </button>
              <button className="icon-btn" title={t('fileViewer.findNext')} disabled={!hitCount} onClick={() => goHit(1)}>
                <ChevronDown size={14} />
              </button>
              <button className="icon-btn" title={t('fileViewer.close')} onClick={closeFind}>
                <X size={14} />
              </button>
            </div>
          )}
        </div>
        <div className="fv-body fv-elastic-body" ref={bodyRef}>
          {error && <div className="fv-error">{error}</div>}
          {!error && tooLarge !== null && (
            <div className="fv-too-large">
              <p>{interp(t('preview.tooLarge'), { size: formatBytes(tooLarge) })}</p>
              <button className="btn small" onClick={() => setForceLoad(true)}>
                {t('preview.tooLargeLoad')}
              </button>
            </div>
          )}
          {!error && tooLarge === null && content === null && mode !== 'preview' && (
            <div className="graph-empty">
              <div className="spinner" />
            </div>
          )}

          {!error && mode === 'preview' && pvKind && (
            <PreviewPane repoPath={repoPath} file={file} gitRef={sourceRef(view)} kind={pvKind} />
          )}

          {!error && imgDiff !== null && mode === 'diff' && (
            <ImageDiff before={imgDiff.before} after={imgDiff.after} />
          )}

          {!error && content !== null && imgDiff === null && mode === 'diff' && semanticSides && (
            <SemanticSummary
              repoPath={repoPath}
              file={file}
              oldSide={semanticSides.oldSide}
              newSide={semanticSides.newSide}
              revision={content}
              snapshot={readerSession.current.semantic}
              onSnapshot={(snapshot) => { readerSession.current.semantic = snapshot }}
            />
          )}

          {!error && content !== null && imgDiff === null && mode === 'diff' && (
            <DiffViewer
              diff={content}
              file={file}
              lang={lang}
              highlightLayers={layers}
              maskValues={maskOn}
              ignoreWs={ignoreWs}
              onToggleIgnoreWs={() => setIgnoreWs((v) => !v)}
              toolbarHost={diffToolsHost}
              overlayHost={overlayHost}
              externalFind={{ open: findOpen, toggle: findOpen ? closeFind : openFind }}
              hunkActions={hunkActions}
            />
          )}

          {!error && imageUrl !== null && mode === 'file' && (
            <div className="image-preview">
              <img src={imageUrl} alt={file} />
            </div>
          )}

          {!error && content !== null && imageUrl === null && mode === 'file' && editing && (
            <div className="code-editor">
              <pre
                ref={preRef}
                className="code-editor-pre hljs"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: editorHtml }}
              />
              <textarea
                ref={editorRef}
                className="code-editor-area"
                value={draft}
                spellCheck={false}
                autoFocus
                onScroll={syncEditorScroll}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Insert a real tab instead of moving focus.
                  if (e.key === 'Tab') {
                    e.preventDefault()
                    const ta = e.currentTarget
                    const { selectionStart: s, selectionEnd: en } = ta
                    const next = draft.slice(0, s) + '  ' + draft.slice(en)
                    setDraft(next)
                    requestAnimationFrame(() => ta.setSelectionRange(s + 2, s + 2))
                  }
                }}
              />
            </div>
          )}

          {!error && content !== null && imageUrl === null && mode === 'file' && !editing && (() => {
            const fileLines = content.split('\n')
            const showMinimap = showMinimapSetting && fileLines.length <= HUGE_LINES
            return (
              <>
                <div
                  className={`file-content hljs ${fileLines.length > HUGE_LINES ? 'is-huge' : ''} ${hoverArmed ? 'hover-armed' : ''}`}
                  {...hoverProps}
                >
                  {fileLines.map((l, i) => {
                    const change = gutterByLine.get(i + 1)
                    return (
                      <div className="code-line" key={i} onContextMenu={lineMenu(i + 1)}>
                        {change && (
                          <GutterMark
                            change={change}
                            active={openChange?.index === change.index}
                            onClick={(e) => setOpenChange({ index: change.index, rect: e.currentTarget.getBoundingClientRect() })}
                          />
                        )}
                        {editorTracksDisk && (
                          <button
                            className={`code-mark ${markedLines.has(i + 1) ? 'on' : ''}`}
                            title={markedLines.has(i + 1) ? t('bookmarks.remove') : t('bookmarks.add')}
                            aria-label={markedLines.has(i + 1) ? t('bookmarks.remove') : t('bookmarks.add')}
                            onClick={() => toggleBookmark(i + 1, l)}
                          />
                        )}
                        <span className="code-no">{i + 1}</span>
                        <span
                          className="code-text"
                          dangerouslySetInnerHTML={{ __html: highlightHtml(highlightLine(maybeMask(l), lang), layers) || '&nbsp;' }}
                        />
                      </div>
                    )
                  })}
                </div>
                {showMinimap && <FileMinimap lines={fileLines} gutterByLine={gutterByLine} scrollRef={bodyRef} />}
              </>
            )
          })()}

          {openChange && gutterChanges[openChange.index] && (
            <ChangeGutterPopup
              change={gutterChanges[openChange.index]}
              total={gutterChanges.length}
              lang={lang}
              anchorRect={openChange.rect}
              onPrev={() => gotoChange((openChange.index - 1 + gutterChanges.length) % gutterChanges.length)}
              onNext={() => gotoChange((openChange.index + 1) % gutterChanges.length)}
              onClose={() => setOpenChange(null)}
            />
          )}

          {!error && content !== null && mode === 'blame' && (
            <div
              className={`blame-view hljs ${blame.length > HUGE_LINES ? 'is-huge' : ''} ${hoverArmed ? 'hover-armed' : ''}`}
              {...hoverProps}
            >
              {blameOverrideRef && (
                <div className="blame-rewind-bar">
                  <span>Blaming at <code>{blameOverrideRef}</code></span>
                  <button className="btn ghost tiny" onClick={() => setBlameOverrideRef(null)}>
                    Back to latest
                  </button>
                </div>
              )}
              {blame.map((b) => (
                <div className="blame-line" key={b.lineNo} onContextMenu={lineMenu(b.lineNo)}>
                  <button
                    className="blame-meta"
                    style={{ borderLeftColor: shaColor(b.sha) }}
                    title={`${b.sha.slice(0, 10)} — ${new Date(b.date * 1000).toLocaleDateString()}\nRight-click for more`}
                    onClick={() => setFileView({ ...view, source: { type: 'commit', hash: b.sha }, mode: 'diff' })}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      openContextMenu(e.clientX, e.clientY, [
                        { label: interp(t('fileViewer.openShaDiff'), { sha: b.sha.slice(0, 7) }), onClick: () => setFileView({ ...view, source: { type: 'commit', hash: b.sha }, mode: 'diff' }) },
                        { label: t('fileViewer.reblame'), onClick: () => setBlameOverrideRef(`${b.sha}^`) },
                        { label: t('fileViewer.copySha'), onClick: () => void navigator.clipboard.writeText(b.sha) }
                      ])
                    }}
                  >
                    <code>{b.sha.slice(0, 7)}</code>
                    <span>{b.author}</span>
                  </button>
                  <span className="code-no">{b.lineNo}</span>
                  <span
                    className="code-text"
                    dangerouslySetInnerHTML={{ __html: highlightHtml(highlightLine(maybeMask(b.text), lang), layers) || '&nbsp;' }}
                  />
                </div>
              ))}
            </div>
          )}

          {!error && content !== null && mode === 'history' && (
            <div className="history-view">
              {history.map((h) => (
                <button
                  key={h.hash}
                  className="history-item"
                  onClick={() => setFileView({ ...view, source: { type: 'commit', hash: h.hash }, mode: 'diff' })}
                >
                  <GitCommitHorizontal size={14} style={{ color: shaColor(h.hash) }} />
                  <span className="history-subject">{h.subject}</span>
                  <span className="history-author">{h.author}</span>
                  <code>{h.hash.slice(0, 7)}</code>
                  <span className="history-date">{new Date(h.date * 1000).toLocaleDateString()}</span>
                </button>
              ))}
              {history.length === 0 && <div className="fv-error">{t('fileViewer.noHistory')}</div>}
            </div>
          )}

          {hoverCard}
        </div>
      </div>
    </div>
  )
}
