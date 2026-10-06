import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell, CheckCircle2, AlertCircle, Info, ChevronRight, Github } from 'lucide-react'
import { useUIStore } from '../stores/ui'
import { useSettingsStore } from '../stores/settings'
import { badgeText, noticeBadge, type Notice } from '../lib/notices'
import { openRepoSwitcherEntries } from '../lib/repositoryMenu'
import { repoDisplayName } from '../lib/repoAlias'
import { timeAgo } from '../lib/timeAgo'
import { useT, interp } from '../i18n'
import { useOutsidePress } from './useOutsidePress'

const KIND_ICON = {
  success: <CheckCircle2 size={14} />,
  error: <AlertCircle size={14} />,
  info: <Info size={14} />
} as const

/**
 * The title-bar bell. One place for what the app told you while you were not
 * looking: every toast is kept here for the session, with its repository and
 * time, and the badge counts what you have not seen — red when one of them is
 * an error. GitHub's own inbox, when connected, is one row at the top rather
 * than a second bell.
 */
export function NotificationBell({ github }: { github: { show: boolean; unread: number } }): React.JSX.Element {
  const t = useT()
  const notices = useUIStore((s) => s.notices)
  const seenUpTo = useUIStore((s) => s.noticesSeenUpTo)
  const settings = useSettingsStore((s) => s.settings)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ right: number; top: number; maxHeight: number } | null>(null)
  // What was new when the panel opened. The badge clears on opening, but the
  // rows keep their "new" dot until the panel closes, or there would be no
  // telling which ones arrived since last time.
  const [newSince, setNewSince] = useState(0)
  // Ticks while the panel is open, so "2 minutes ago" stays true.
  const [now, setNow] = useState(() => Date.now())

  const badge = noticeBadge(notices, seenUpTo)
  const count = badge.unseen + github.unread
  const close = (): void => setPosition(null)

  useEffect(() => {
    if (!position) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    const tick = window.setInterval(() => setNow(Date.now()), 30_000)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    return () => {
      window.clearInterval(tick)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
    }
  }, [position])

  useOutsidePress(position !== null, [triggerRef, panelRef], close)

  // Seen means seen in the open panel — including anything arriving while it is open.
  useEffect(() => {
    if (position) useUIStore.getState().markNoticesSeen()
  }, [position, notices])

  const toggle = (): void => {
    if (position) return close()
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    setNow(Date.now())
    setNewSince(useUIStore.getState().noticesSeenUpTo)
    const top = rect.bottom + 6
    setPosition({ right: Math.max(8, window.innerWidth - rect.right), top, maxHeight: window.innerHeight - top - 12 })
  }

  const goTo = (notice: Notice): void => {
    if (!notice.repoPath) return
    const entry = openRepoSwitcherEntries(settings.tabs).find((e) => e.path === notice.repoPath)
    if (!entry) return
    const store = useSettingsStore.getState()
    store.setActiveTab(entry.tabId)
    if (entry.tabKind === 'group') store.setGroupActiveRepo(entry.tabId, entry.path)
    close()
  }

  const repoName = (path: string): string => {
    const entry = openRepoSwitcherEntries(settings.tabs).find((e) => e.path === path)
    return repoDisplayName(path, settings.repoAliases, entry?.name ?? path.split('/').pop() ?? path)
  }

  const label =
    count === 1 ? t('notices.bellUnreadOne') : count > 1 ? interp(t('notices.bellUnread'), { n: count }) : t('titlebar.notifications')
  const newestFirst = [...notices].reverse()

  return (
    <>
      <button
        ref={triggerRef}
        className="titlebar-action notif-bell"
        title={t('titlebar.notifications')}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={position !== null}
        onClick={toggle}
      >
        <Bell size={16} />
        {badge.error ? (
          <span className="notif-badge">{badgeText(count)}</span>
        ) : (
          count > 0 && <span className="notif-dot" aria-hidden="true" />
        )}
      </button>

      {position &&
        createPortal(
          <div
            ref={panelRef}
            className="branch-picker-popover notice-panel"
            role="dialog"
            aria-label={t('titlebar.notifications')}
            style={{ right: position.right, top: position.top, maxHeight: position.maxHeight }}
          >
            <div className="notice-head">
              <span className="notice-title">{t('titlebar.notifications')}</span>
              {notices.length > 0 && (
                <button type="button" className="notice-clear" onClick={() => useUIStore.getState().clearNotices()}>
                  {t('notices.clear')}
                </button>
              )}
            </div>

            {github.show && (
              <button
                type="button"
                className="notice-github"
                onClick={() => {
                  close()
                  useSettingsStore.getState().openPageTab({ type: 'notifications' })
                }}
              >
                <Github size={14} />
                <span className="notice-github-label">{t('notices.githubInbox')}</span>
                {github.unread > 0 && <span className="notice-github-count">{badgeText(github.unread)}</span>}
                <ChevronRight size={14} className="notice-github-chevron" />
              </button>
            )}

            <div className="notice-list" role="list">
              {newestFirst.length === 0 && <p className="notice-empty">{t('notices.empty')}</p>}
              {newestFirst.map((n) => {
                const ago = timeAgo(n.at, now)
                const unseen = n.id > newSince
                const Row = n.repoPath ? 'button' : 'div'
                return (
                  <Row
                    key={n.id}
                    role="listitem"
                    {...(n.repoPath ? { type: 'button' as const, onClick: () => goTo(n), title: t('notices.openRepo') } : {})}
                    className={`notice-row ${n.kind}${unseen ? ' unseen' : ''}`}
                  >
                    <span className="notice-icon">{KIND_ICON[n.kind]}</span>
                    <span className="notice-body">
                      <span className="notice-message">{n.message}</span>
                      <span className="notice-meta">
                        {n.repoPath && <span className="notice-repo">{repoName(n.repoPath)}</span>}
                        {ago && <span>{interp(t(ago.key), { n: ago.n })}</span>}
                      </span>
                    </span>
                  </Row>
                )
              })}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
