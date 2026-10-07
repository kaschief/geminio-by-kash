import { create } from 'zustand'
import type { ReactNode } from 'react'
import type { CiState, DivergedStrategy, KeychainReason, ResetStrategy, SemanticDiff } from '../../../shared/types'
import type { WorkspaceCandidate } from '../lib/workspacePlan'
import { addNotice, parseStoredNotices, resolveNotices, sanitizeNoticeMessage, type Notice, type NoticeKind } from '../lib/notices'
import { parseDiffZoom } from '../lib/diffZoom'

export type CiFilter = 'all' | CiState

export interface Toast {
  id: number
  kind: 'success' | 'error' | 'info'
  message: string
  /** Repository the message came from — lets an error toast offer "Fix with AI". */
  repoPath?: string
  /** One button on the toast (Undo). It stays up longer, to be reachable. */
  action?: ToastAction
}

export interface ToastAction {
  label: string
  run: () => void
}

/** Where on screen something is, as plain numbers (a DOMRect does not survive
 *  being copied). */
export interface AnchorRect {
  left: number
  top: number
  width: number
  height: number
}

export function anchorOf(el: Element): AnchorRect {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

/**
 * A confirm asked next to what was chosen — the file row, the hunk's button —
 * instead of a dialog over the whole window. No backdrop: what would be lost
 * stays readable while the question is open.
 */
export interface ConfirmPopoverSpec {
  anchor: AnchorRect
  /** `beside` for a row in a narrow list, `below` for a button or wide row. */
  prefer?: 'beside' | 'below'
  title: string
  detail?: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel?: () => void
}

export interface MenuItem {
  label?: string
  icon?: ReactNode
  danger?: boolean
  separator?: boolean
  disabled?: boolean
  /** Native tooltip — used for disabled-state explanations. */
  title?: string
  onClick?: () => void
  /** Nested items — renders a flyout submenu on hover instead of a click action. */
  submenu?: MenuItem[]
  /**
   * Makes the row a stateful item with a check gutter, announced as checked or
   * not. `radio` marks it as one choice among siblings (exactly one is on);
   * otherwise it is an independent on/off toggle. Leave undefined for plain
   * actions — a label swap like "Pin"/"Unpin" is an action, not a state.
   */
  checked?: boolean
  radio?: boolean
  /**
   * Dimmed trailing text — the current value of a setting. A submenu parent
   * without one derives it from its children (see `submenuSummary`), so an
   * active choice is visible before the flyout is opened.
   */
  detail?: string
}

export interface ContextMenuState {
  x: number
  y: number
  items: MenuItem[]
}

export type ModalSpec =
  | {
      kind: 'input'
      title: string
      label: string
      placeholder?: string
      initial?: string
      submitLabel?: string
      allowEmpty?: boolean
      onSubmit: (value: string) => void
    }
  | {
      /** One `${input:id}` prompt from a launch.json `inputs` array: a real
       *  picker for `pickString`, a (maskable) text field for `promptString`. */
      kind: 'launch-input'
      input: import('../../../shared/types').LaunchInput
      /** 1-based position in the run's input sequence, for "n of m". */
      step: number
      total: number
      onSubmit: (value: string) => void
    }
  | {
      kind: 'confirm'
      title: string
      message: string
      danger?: boolean
      confirmLabel?: string
      autoFocusConfirm?: boolean
      onConfirm: () => void
      secondaryLabel?: string
      secondaryDanger?: boolean
      onSecondary?: () => void
    }
  | {
      /** The submit screen: the plan, the progress, and the links it produced. */
      kind: 'stack-submit'
      repoPath: string
      /** Which stack — the modal can be showing one you are not standing on. */
      leaf?: string
      create: number
      retarget: number
      /** "branch → base" per level that changes, top level first. */
      lines: string[]
    }
  | {
      kind: 'addRemote'
      path: string
      defaultName: string
      existingNames: string[]
      matchName?: string
      /** Sync action that opened this — add remote, then finish that action. */
      resume?: 'push' | 'pull' | 'fetch'
    }
  | {
      kind: 'editRemote'
      path: string
      name: string
      url: string
      pushUrl?: string
    }
  | {
      kind: 'diverged-checkout'
      localName: string
      fullName: string
      ahead: number
      behind: number
      onResolve: (strategy: DivergedStrategy, backup: boolean) => void
    }
  | {
      // Asked for a remote branch whose local counterpart is ahead: checking
      // out would hand back local work, so the user picks which side wins.
      kind: 'ahead-checkout'
      localName: string
      fullName: string
      ahead: number
      onKeepLocal: () => void
      onReset: (strategy: ResetStrategy, backup: boolean) => void
    }
  | { kind: 'clone'; onClone: (repo: { path: string; name: string }) => void }
  | { kind: 'create-branch'; path: string; currentBranch?: string; description?: string }
  | { kind: 'settings'; page?: 'profile' | 'layout' | 'integrations' | 'ai' | 'themes' | 'general' | 'security' | 'shortcuts' | 'data' | 'repository'; themeTab?: 'theme' | 'graph'; repoPath?: string; repoTab?: 'general' | 'config' | 'info' | 'vault' | 'analytics' | 'insights' | 'history' | 'logs' }
  | { kind: 'launcher'; groupId?: string }
  | { kind: 'create-repo'; onCreate: (repo: { path: string; name: string }) => void }
  | { kind: 'ai-config-wizard'; repoPath: string; repoName: string }
  | { kind: 'interactive-rebase'; repoPath: string; base: string; baseSubject: string }
  | { kind: 'branch-compare'; repoPath: string; branchA: string; branchB: string }
  | { kind: 'conflict-radar'; repoPath: string; base?: string }
  | { kind: 'teammate-radar'; repoPath: string }
  | { kind: 'commit-edit'; repoPath: string; sha: string; subject: string }
  | {
      kind: 'reset-to-commit'
      repoPath: string
      sha: string
      shortSha: string
      branch: string
      dirty: boolean
      onReset: (mode: 'soft' | 'mixed' | 'hard') => void
    }
  | { kind: 'local-ci'; repoPath: string; rev?: string }
  | { kind: 'keychain-consent'; reason: KeychainReason; adopted?: boolean }
  | { kind: 'range-diff'; repoPath: string; branch: string; initialOld?: string }
  | { kind: 'absorb'; repoPath: string }
  | { kind: 'time-machine'; repoPath: string }
  | { kind: 'timelapse'; repoPath: string }
  | { kind: 'ai-pr-review'; repoPath: string; prTitle: string; sourceBranch: string; targetBranch: string }
  /** The colour picker. Deliberately knows nothing about what it is colouring:
   *  it is used by group tabs, folders and Repositories-page sections alike.
   *  `tabId` is optional so a page-local colour can reuse the same modal. */
  | { kind: 'group-color'; tabId?: string; current?: string; onSelect: (color: string) => void }
  /** Pick which scanned folders become workspaces. The plan is computed before
   *  the modal opens, so this only chooses from it — nothing is created until
   *  the confirm, and cancelling leaves the scan's indexing in place. */
  | {
      kind: 'scan-workspaces'
      root: string
      candidates: WorkspaceCandidate[]
      onConfirm: (chosen: WorkspaceCandidate[]) => void
    }
  | { kind: 'reflog'; repoPath: string }
  | { kind: 'code-search'; repoPath: string; query?: string }
  | { kind: 'stack'; repoPath: string }
  | { kind: 'gitflow'; repoPath: string }
  | { kind: 'history-purge'; repoPath: string; initialPath?: string }
  | { kind: 'subtree'; repoPath: string }
  | { kind: 'clean'; repoPath: string }
  | { kind: 'export'; repoPath: string; tab?: 'bundle' | 'archive' }
  | { kind: 'maintenance'; repoPath: string }
  | { kind: 'merge-options'; repoPath: string; source?: string }
  | { kind: 'objects'; repoPath: string; rev?: string }
  | { kind: 'attributes'; repoPath: string }
  | { kind: 'credentials'; repoPath: string }
  | { kind: 'replace'; repoPath: string; commit?: string }
  | { kind: 'changelog-gen'; repoPath: string }
  | { kind: 'snapshots'; repoPath: string }
  | { kind: 'todos'; repoPath: string; focusId?: string }
  | { kind: 'stash-partial'; repoPath: string }
  | { kind: 'create-tag'; repoPath: string; hash?: string; at?: string }
  | { kind: 'cheatsheet' }
  // `geminio --wait <file>` — a `git commit`/`git rebase -i` is blocked on this
  // dialog, so closing it by any route must answer git (see CliEditModal).
  | { kind: 'cli-edit'; file: string; sentinel: string; content: string }
  | { kind: 'ai-accounts-notice' }
  | { kind: 'create-issue'; repoPath: string; remoteUrl: string }
  | { kind: 'repo-settings'; repoPath: string; tab?: 'general' | 'config' | 'info' | 'vault' | 'analytics' | 'insights' | 'history' | 'logs' }
  | { kind: 'secure-share'; repoPath: string; initialMode?: 'export' | 'import' }
  | { kind: 'secure-workspace'; initialMode?: 'export' | 'import' }
  | { kind: 'bisect'; repoPath: string }
  | { kind: 'hooks'; repoPath: string }
  | { kind: 'lfs'; repoPath: string }
  | { kind: 'sparse'; repoPath: string }
  | { kind: 'ignore'; repoPath: string; targetPath: string; isFolder: boolean }
  | { kind: 'pr-detail'; repoPath: string; remoteUrl: string; number: number }
  | { kind: 'pr-preview'; repoPath: string; number?: number; remote?: string; branch?: string }
  | {
      kind: 'create-pr'
      repoPath: string
      remoteUrl?: string
      source?: string
      target?: string
      defaultTitle?: string
      defaultBody?: string
    }

export type FileViewSource =
  | { type: 'wip'; staged: boolean; untracked: boolean }
  | { type: 'commit'; hash: string }
  | { type: 'stash'; sha: string; untracked: boolean }
  // A plain working-tree file opened from the project tree. Read from disk
  // (no git ref) and editable in place.
  | { type: 'tree' }

export type FileViewMode = 'preview' | 'diff' | 'file' | 'blame' | 'history'

/** A message handed to the composer, applied when it is next on screen. */
export interface ComposerIntent {
  path: string
  summary: string
  description: string
  amend: boolean
  /**
   * Set by automatic hand-backs (an undo restoring its message): the summary
   * the composer held when the message was offered. If it holds anything else
   * by the time it opens, the person has typed since, and the offer is
   * dropped rather than written over their words. Explicit requests (Amend
   * commit…) leave it unset and always apply.
   */
  onlyIfSummary?: string
}

export interface FileViewState {
  repoPath: string
  file: string
  source: FileViewSource
  mode: FileViewMode
  /** Line to scroll to and flash once the file is rendered (search results). */
  line?: number
  /** Bumped by `setFileView` per request, so re-opening the same line re-scrolls. */
  revealSeq?: number
  /** Entry edge when elastically moving to an adjacent file. */
  initialScroll?: 'start' | 'end'
}

/** Identity includes the repository and revision, not just the basename. */
export function fileViewKey(view: FileViewState): string {
  return JSON.stringify([view.repoPath, view.file, view.source])
}

export interface FileReaderSession {
  /** Last painted text, shown immediately while the working copy revalidates. */
  content?: string | null
  semantic?: { key: string; result: SemanticDiff | null; open: boolean }
  key: string
  mode: FileViewMode
  editing: boolean
  draft: string
  findOpen: boolean
  find: FileSearchState
  ignoreWs: boolean
  scroll: { top: number; left: number }[]
}

interface RepoViewState {
  fileView: FileViewState | null
  conflictView: ConflictViewState | null
  conflictWhy: string | null
  graphFilter: string
  ciFilter: CiFilter
  authorFilter: string | null
  pathFilter: string | null
  sidebarTab: 'git' | 'files'
  chatPanelOpen: boolean
  rightPanelTab: 'details' | 'chat'
  scrollToHash: string | null
}
const emptyRepoView = (): RepoViewState => ({
  fileView: null, conflictView: null, conflictWhy: null,
  graphFilter: '', ciFilter: 'all', authorFilter: null, pathFilter: null,
  sidebarTab: 'git', chatPanelOpen: false, rightPanelTab: 'details', scrollToHash: null
})
function repoViewSnapshot(s: RepoViewState): RepoViewState {
  const { fileView, conflictView, conflictWhy, graphFilter, ciFilter, authorFilter,
    pathFilter, sidebarTab, chatPanelOpen, rightPanelTab, scrollToHash } = s
  return { fileView, conflictView, conflictWhy, graphFilter, ciFilter, authorFilter,
    pathFilter, sidebarTab, chatPanelOpen, rightPanelTab, scrollToHash }
}

export interface ConflictViewState {
  repoPath: string
  file: string
}

/** Active content-search term, mirrored from the commit panel so the center
 *  file/diff view can highlight matches. null = nothing to highlight. */
export interface FileSearchState {
  query: string
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
}

export interface PanelLayout {
  sidebarWidth: number
  panelWidth: number
  terminalHeight: number
  /** Height of the Problems dock at the bottom of the centre column. */
  problemsHeight: number
  /** Width of the terminal pane when docked as a right-hand column. */
  terminalWidth: number
  terminalListWidth: number
  terminalListCollapsed: boolean
  composerUnstagedRatio: number
  composerMessageHeight: number | null
  /** Conflict editor: share of the width taken by the left (ours) side. */
  conflictSideRatio: number
  /** Conflict editor: share of the height taken by the two side panes. */
  conflictFilesRatio: number
  composerConflictedCollapsed: boolean
  composerUnstagedCollapsed: boolean
  composerStagedCollapsed: boolean
}

const LAYOUT_KEY = 'gitcito-layout'
const SIDEBAR_KEY = 'gitcito-sidebar-collapsed'
const DIFF_ZOOM_KEY = 'gitcito-diff-zoom'
const DEFAULT_LAYOUT: PanelLayout = {
  sidebarWidth: 248,
  panelWidth: 420,
  terminalHeight: 260,
  problemsHeight: 240,
  terminalWidth: 480,
  terminalListWidth: 220,
  terminalListCollapsed: false,
  composerUnstagedRatio: 0.5,
  composerMessageHeight: null,
  conflictSideRatio: 0.5,
  conflictFilesRatio: 0.55,
  composerConflictedCollapsed: false,
  composerUnstagedCollapsed: false,
  composerStagedCollapsed: false
}

function loadLayout(): PanelLayout {
  try {
    return { ...DEFAULT_LAYOUT, ...(JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}') as Partial<PanelLayout>) }
  } catch {
    return DEFAULT_LAYOUT
  }
}

interface UIState {
  contextMenu: ContextMenuState | null
  modal: ModalSpec | null
  confirmPopover: ConfirmPopoverSpec | null
  toasts: Toast[]
  /** What the bell keeps — failures, news from others, work finished while
   *  away. Not every toast: see lib/notices for what earns a place. */
  notices: Notice[]
  /** The newest notice id the person has seen in the bell's panel. */
  noticesSeenUpTo: number
  /** GitHub's unread count when the person last looked (bell or inbox). Only
   *  items beyond it are news; GitHub's own count is "unread", not "unseen". */
  githubSeenUnread: number
  /** Cmd/Ctrl+K command palette — fuzzy jump to branches, commits, files, actions. */
  commandPaletteOpen: boolean
  /**
   * Mission control is showing. It is a view, not a tab: the title-bar button
   * swaps the whole workspace body for the dashboard and swaps it back, so no
   * extra tab is ever created for it.
   */
  missionOpen: boolean
  /** Unread GitHub notification count for the toolbar bell badge. */
  githubUnread: number
  /** Terminal-pane visibility, per repo path. Switching to a tab that never
   *  opened its terminal keeps the pane closed; reopening the tab restores it.
   *  In-memory only — resets to all-closed on cold start. */
  terminalOpenByRepo: Record<string, boolean>
  /** Which repos have the Problems dock open. */
  problemsOpenByRepo: Record<string, boolean>
  /** Left sidebar (branches/files) collapsed. Global workspace preference —
   *  hides the sidebar column so the graph gets the full width. */
  sidebarCollapsed: boolean
  /** Zoom of every diff pane, apart from the app zoom. One value for all of
   *  them, so a diff opened elsewhere reads at the size just chosen. */
  diffZoom: number
  setDiffZoom: (zoom: number) => void
  /** Which sidebar tab is showing. Lives here rather than in the component
   *  because the refresh cycle reads it: the file tree's per-path badges cost a
   *  second full `git status` walk, and nothing displays them until this is
   *  'files'. */
  sidebarTab: 'git' | 'files'
  setSidebarTab: (tab: 'git' | 'files') => void
  /** Chat shares the contextual right panel with commit/stash details. */
  chatPanelOpen: boolean
  rightPanelTab: 'details' | 'chat'
  /** A composer draft handed to the chat panel from elsewhere (an error
   *  toast's "Fix with AI"). The panel consumes it once, for its own repo. */
  chatPrompt: { repoPath: string; text: string } | null
  graphFilter: string
  ciFilter: CiFilter
  authorFilter: string | null
  /** Dim commits that didn't touch this path (file/folder). null = off. */
  pathFilter: string | null
  busy: string | null
  /** Which toolbar operation is in flight, so the spinner can render on the
   *  relevant tool button instead of a layout-shifting label on the right. */
  busyOp: 'push' | 'pull' | 'fetch' | null
  /** Count of mutating git ops queued or running. > 0 gates the UI: action
   *  buttons and mutating keyboard shortcuts are disabled until it drops to 0,
   *  so the user can't fire a second action before the first has settled. */
  inflight: number
  /** Prefill the commit composer (amend from HEAD, or restore after undo). */
  composerIntent: ComposerIntent | null
  activeRepoPath: string | null
  repoViews: Record<string, RepoViewState>
  fileReaders: Record<string, FileReaderSession>
  graphScrollByRepo: Record<string, { top: number; left: number }>
  activateRepoView(repoPath: string | null): void
  patchRepoView(repoPath: string | null, patch: Partial<RepoViewState>): void
  rememberFileReader(view: FileViewState, session: FileReaderSession): void
  rememberGraphScroll(repoPath: string, scroll: { top: number; left: number }): void
  fileView: FileViewState | null
  conflictView: ConflictViewState | null
  /** File whose "why this conflicts" strip is open. Lives here rather than in
   *  the resolver so a background refresh, which remounts it, does not close it. */
  conflictWhy: string | null
  fileSearch: FileSearchState | null
  scrollToHash: string | null
  layout: PanelLayout
  /** True while the in-app file editor holds unsaved changes — drives the
   *  discard guard before navigating away. */
  editorDirty: boolean
  /** RepoCosmos 3D visualization easter egg — a fullscreen overlay mounted
   *  as a sibling to the modal stack, since it must cover the modal that
   *  triggered it. null = closed. */
  cosmos: { repoPath: string } | null

  openContextMenu(x: number, y: number, items: MenuItem[]): void
  closeContextMenu(): void
  openModal(modal: ModalSpec): void
  closeModal(): void
  setCommandPalette(open: boolean): void
  setMissionOpen(open: boolean): void
  toggleCommandPalette(): void
  setGithubUnread(n: number): void
  /** Returns the toast's id, for a caller that may need to take it down early. */
  toast(kind: Toast['kind'], message: string, opts?: { repoPath?: string; action?: ToastAction }): number
  askBeside(spec: ConfirmPopoverSpec): void
  closeConfirmPopover(): void
  /** Record something in the bell's list (and badge, Dock, system notification). */
  notify(kind: NoticeKind, message: string, opts?: { repoPath?: string; key?: string; remote?: boolean; quiet?: boolean }): void
  /** A success that fixes earlier failures with this key: they stop counting. */
  resolveNotice(key: string): void
  markNoticesSeen(): void
  markGithubSeen(): void
  clearNotices(): void
  dismissToast(id: number): void
  toggleTerminal(repoPath: string): void
  toggleProblems(repoPath: string): void
  setProblemsOpen(repoPath: string, open: boolean): void
  setTerminalOpen(repoPath: string, open: boolean): void
  toggleSidebar(): void
  setSidebarCollapsed(collapsed: boolean): void
  openChatPanel(): void
  /** Open the chat panel with a prefilled composer draft for one repository. */
  openChatPanelWith(repoPath: string, text: string): void
  consumeChatPrompt(): void
  closeChatPanel(): void
  showDetailsPanel(repoPath?: string): void
  setGraphFilter(filter: string): void
  setCiFilter(filter: CiFilter): void
  setAuthorFilter(author: string | null): void
  setPathFilter(path: string | null): void
  setBusy(label: string | null, op?: 'push' | 'pull' | 'fetch' | null): void
  beginInflight(): void
  endInflight(): void
  requestComposerIntent(intent: ComposerIntent): void
  consumeComposerIntent(): void
  setFileView(view: FileViewState | null, repoPath?: string): void
  setEditorDirty(dirty: boolean, repoPath?: string): void
  setConflictView(view: ConflictViewState | null, repoPath?: string): void
  setConflictWhy(file: string | null): void
  setFileSearch(search: FileSearchState | null, repoPath?: string): void
  requestScrollTo(hash: string | null): void
  setLayout(partial: Partial<PanelLayout>): void
  /** Reset all persisted panel sizes (widths/heights/collapse) to defaults. */
  resetLayout(): void
  openCosmos(repoPath: string): void
  closeCosmos(): void
}

// The bell's history survives a restart: an overnight push that failed is
// still there in the morning. Per machine, in this window's local storage.
const NOTICES_KEY = 'geminio-notices-v1'
const storedNotices = parseStoredNotices(
  (() => {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage.getItem(NOTICES_KEY)
    } catch {
      return null
    }
  })()
)
// Ids carry on from the saved list, so "seen up to" still means the same thing.
let toastId = storedNotices.notices.reduce((max, n) => Math.max(max, n.id), storedNotices.seenUpTo)
let revealSeq = 0

export const useUIStore = create<UIState>((set, get) => ({
  activeRepoPath: null,
  repoViews: {},
  fileReaders: {},
  graphScrollByRepo: {},
  activateRepoView: (activeRepoPath) => set((s) => {
    if (s.activeRepoPath === activeRepoPath) return s
    const repoViews = { ...s.repoViews }
    if (s.activeRepoPath) repoViews[s.activeRepoPath] = repoViewSnapshot(s)
    const next = { ...(activeRepoPath ? repoViews[activeRepoPath] ?? emptyRepoView() : emptyRepoView()) }
    if (next.fileView) {
      next.fileView = { ...next.fileView }
      // Entry gestures and line reveals are one-shot actions, not return state.
      delete next.fileView.initialScroll
      delete next.fileView.line
    }
    return { ...next, activeRepoPath, repoViews, fileSearch: null, editorDirty: false, contextMenu: null, confirmPopover: null }
  }),
  patchRepoView: (repoPath, patch) => set((s) => {
    if (repoPath === s.activeRepoPath) return patch
    if (!repoPath) return s
    return { repoViews: { ...s.repoViews, [repoPath]: { ...(s.repoViews[repoPath] ?? emptyRepoView()), ...patch } } }
  }),
  rememberFileReader: (view, session) => set((s) => {
    const current = view.repoPath === s.activeRepoPath ? s.fileView : s.repoViews[view.repoPath]?.fileView
    // An old component can unmount after a new file opened or was closed.
    if (!current || fileViewKey(current) !== session.key) return s
    return { fileReaders: { ...s.fileReaders, [view.repoPath]: session } }
  }),
  rememberGraphScroll: (repoPath, scroll) => set((s) => ({ graphScrollByRepo: { ...s.graphScrollByRepo, [repoPath]: scroll } })),
  contextMenu: null,
  modal: null,
  confirmPopover: null,
  toasts: [],
  notices: storedNotices.notices,
  noticesSeenUpTo: storedNotices.seenUpTo,
  githubSeenUnread: 0,
  commandPaletteOpen: false,
  missionOpen: false,
  githubUnread: 0,
  terminalOpenByRepo: {},
  problemsOpenByRepo: {},
  sidebarCollapsed: (() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1'
    } catch {
      return false
    }
  })(),
  diffZoom: (() => {
    try {
      return parseDiffZoom(localStorage.getItem(DIFF_ZOOM_KEY))
    } catch {
      return 1
    }
  })(),
  setDiffZoom: (zoom) => {
    const diffZoom = parseDiffZoom(String(zoom))
    set({ diffZoom })
    try {
      localStorage.setItem(DIFF_ZOOM_KEY, String(diffZoom))
    } catch {
      /* ignore quota errors */
    }
  },
  chatPanelOpen: false,
  rightPanelTab: 'details',
  chatPrompt: null,
  graphFilter: '',
  ciFilter: 'all',
  authorFilter: null,
  pathFilter: null,
  busy: null,
  busyOp: null,
  inflight: 0,
  composerIntent: null,
  fileView: null,
  conflictView: null,
  conflictWhy: null,
  fileSearch: null,
  scrollToHash: null,
  layout: loadLayout(),
  editorDirty: false,
  cosmos: null,

  openContextMenu: (x, y, items) => set({ contextMenu: { x, y, items } }),
  closeContextMenu: () => set({ contextMenu: null }),
  openModal: (modal) => set({ modal: modal.kind === 'repo-settings'
    ? { kind: 'settings', page: 'repository', repoPath: modal.repoPath, repoTab: modal.tab }
    : modal, contextMenu: null }),
  closeModal: () => set({ modal: null }),
  setCommandPalette: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setMissionOpen: (missionOpen) => set({ missionOpen }),
  toggleCommandPalette: () => set({ commandPaletteOpen: !get().commandPaletteOpen }),
  // Items read elsewhere lower the count; "seen" follows it down, so the next
  // new item is news again.
  setGithubUnread: (githubUnread) => set({ githubUnread, githubSeenUnread: Math.min(get().githubSeenUnread, githubUnread) }),

  toast: (kind, message, opts) => {
    const id = ++toastId
    const repo = opts?.repoPath ? { repoPath: opts.repoPath } : {}
    const action = opts?.action ? { action: opts.action } : {}
    set({ toasts: [...get().toasts, { id, kind, message, ...repo, ...action }] })
    const dismiss = (): void => {
      setTimeout(() => get().dismissToast(id), kind === 'error' || opts?.action ? 7000 : 3500)
    }
    // An error raised while the window is in the background would time out
    // unseen: its countdown starts when the person comes back.
    if (kind === 'error' && typeof document !== 'undefined' && !document.hasFocus()) {
      window.addEventListener('focus', dismiss, { once: true })
    } else {
      dismiss()
    }
    return id
  },
  notify: (kind, message, opts) => {
    const id = ++toastId
    set({
      notices: addNotice(get().notices, {
        id,
        kind,
        message: sanitizeNoticeMessage(message),
        at: Date.now(),
        ...(opts?.repoPath ? { repoPath: opts.repoPath } : {}),
        ...(opts?.key ? { key: opts.key } : {}),
        ...(opts?.remote ? { remote: true } : {}),
        ...(opts?.quiet ? { quiet: true } : {})
      })
    })
  },
  resolveNotice: (key) => {
    const next = resolveNotices(get().notices, key)
    if (next !== get().notices) set({ notices: next })
  },
  markNoticesSeen: () => {
    const newest = get().notices[get().notices.length - 1]?.id ?? 0
    if (newest > get().noticesSeenUpTo) set({ noticesSeenUpTo: newest })
  },
  clearNotices: () => set({ notices: [] }),
  markGithubSeen: () => set({ githubSeenUnread: get().githubUnread }),
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  askBeside: (confirmPopover) => set({ confirmPopover, contextMenu: null }),
  closeConfirmPopover: () => set({ confirmPopover: null }),

  toggleTerminal: (repoPath) =>
    set((s) => ({ terminalOpenByRepo: { ...s.terminalOpenByRepo, [repoPath]: !s.terminalOpenByRepo[repoPath] } })),
  setTerminalOpen: (repoPath, open) =>
    set((s) => ({ terminalOpenByRepo: { ...s.terminalOpenByRepo, [repoPath]: open } })),
  toggleProblems: (repoPath) =>
    set((s) => ({ problemsOpenByRepo: { ...s.problemsOpenByRepo, [repoPath]: !s.problemsOpenByRepo[repoPath] } })),
  setProblemsOpen: (repoPath, open) =>
    set((s) => ({ problemsOpenByRepo: { ...s.problemsOpenByRepo, [repoPath]: open } })),
  sidebarTab: 'git',
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  toggleSidebar: () => get().setSidebarCollapsed(!get().sidebarCollapsed),
  setSidebarCollapsed: (sidebarCollapsed) => {
    set({ sidebarCollapsed })
    try {
      localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? '1' : '0')
    } catch {
      /* ignore quota errors */
    }
  },
  openChatPanel: () => set({ chatPanelOpen: true, rightPanelTab: 'chat' }),
  openChatPanelWith: (repoPath, text) =>
    set({ chatPanelOpen: true, rightPanelTab: 'chat', chatPrompt: { repoPath, text } }),
  consumeChatPrompt: () => set({ chatPrompt: null }),
  closeChatPanel: () => set({ chatPanelOpen: false, rightPanelTab: 'details' }),
  showDetailsPanel: (repoPath) => get().patchRepoView(repoPath ?? get().activeRepoPath, { rightPanelTab: 'details' }),
  setGraphFilter: (graphFilter) => set({ graphFilter }),
  setCiFilter: (ciFilter) => set({ ciFilter }),
  setAuthorFilter: (authorFilter) => set({ authorFilter }),
  setPathFilter: (pathFilter) => set({ pathFilter }),
  setBusy: (busy, op = null) => set({ busy, busyOp: op }),
  beginInflight: () => set((s) => ({ inflight: s.inflight + 1 })),
  endInflight: () => set((s) => ({ inflight: Math.max(0, s.inflight - 1) })),
  requestComposerIntent: (composerIntent) => set({ composerIntent }),
  consumeComposerIntent: () => set({ composerIntent: null }),
  setFileView: (fileView, repoPath) => {
    const path = fileView?.repoPath ?? repoPath ?? get().activeRepoPath
    const current = path === get().activeRepoPath ? get().fileView : path ? get().repoViews[path]?.fileView : null
    if (path && (!fileView || !current || fileViewKey(current) !== fileViewKey(fileView))) {
      set((s) => {
        const fileReaders = { ...s.fileReaders }
        delete fileReaders[path]
        return { fileReaders }
      })
    }
    get().patchRepoView(path, {
      // Each line-targeted open must reveal even the same search hit again.
      fileView: fileView?.line != null ? { ...fileView, revealSeq: ++revealSeq } : fileView
    })
  },
  setEditorDirty: (editorDirty, repoPath) => {
    if (!repoPath || repoPath === get().activeRepoPath) set({ editorDirty })
  },
  setConflictView: (conflictView, repoPath) => get().patchRepoView(conflictView?.repoPath ?? repoPath ?? get().activeRepoPath, { conflictView }),
  setConflictWhy: (conflictWhy) => set({ conflictWhy }),
  setFileSearch: (fileSearch, repoPath) => {
    if (!repoPath || repoPath === get().activeRepoPath) set({ fileSearch })
  },
  requestScrollTo: (scrollToHash) => set({ scrollToHash }),
  setLayout: (partial) => {
    const layout = { ...get().layout, ...partial }
    set({ layout })
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
    } catch {
      /* ignore quota errors */
    }
  },
  resetLayout: () => {
    set({ layout: DEFAULT_LAYOUT })
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(DEFAULT_LAYOUT))
    } catch {
      /* ignore quota errors */
    }
  },
  openCosmos: (repoPath) => set({ cosmos: { repoPath } }),
  closeCosmos: () => set({ cosmos: null })
}))

// Keep the bell's history on disk as it changes.
useUIStore.subscribe((next, prev) => {
  if (next.notices === prev.notices && next.noticesSeenUpTo === prev.noticesSeenUpTo) return
  try {
    localStorage.setItem(NOTICES_KEY, JSON.stringify({ notices: next.notices, seenUpTo: next.noticesSeenUpTo }))
  } catch {
    // Storage full or unavailable: the list still works for this session.
  }
})
