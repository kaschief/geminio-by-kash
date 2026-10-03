import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, GitBranch, GitBranchPlus } from 'lucide-react'
import type { BranchInfo, RemoteBranchInfo } from '../../../shared/types'
import { branchContextActionIds, branchMergeWouldChange, branchWorktreePlan } from '../lib/branchMenu'
import { githubBranchUrl, githubLocalBranchUrl, githubRemote } from '../lib/hosting'
import { interp, useT } from '../i18n'
import { shellApi } from '../infrastructure/api'
import { repoActions, type RepoData } from '../stores/repo'
import { useSettingsStore } from '../stores/settings'
import { useUIStore, type MenuItem } from '../stores/ui'
import { mi } from './menuIcons'
import { ChoiceDot } from './StateMarks'

type BranchTarget =
  | { kind: 'local'; branch: BranchInfo }
  | { kind: 'remote'; branch: RemoteBranchInfo }

interface PickerPosition {
  left: number
  top: number
  width: number
  maxHeight: number
}

export function BranchStatusPicker({ repo }: { repo: RepoData }): React.JSX.Element {
  const t = useT()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<PickerPosition | null>(null)
  const { openContextMenu, openModal } = useUIStore()
  const path = repo.path

  const close = (): void => setPosition(null)

  useEffect(() => {
    if (!position) return
    const onMouseDown = (event: MouseEvent): void => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return
      close()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('pointerdown', onMouseDown, true)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', onMouseDown, true)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
    }
  }, [position])

  const toggle = (): void => {
    if (position) {
      close()
      return
    }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const width = Math.min(440, window.innerWidth - 16)
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
    const top = rect.bottom + 6
    setPosition({ left, top, width, maxHeight: window.innerHeight - top - 8 })
  }

  const contextItems = (target: BranchTarget): MenuItem[] => {
    const isLocal = target.kind === 'local'
    const branchName = target.branch.name
    const ref = isLocal ? branchName : target.branch.fullName
    const copyName = isLocal ? branchName : target.branch.fullName
    const current = repo.branches.locals.find((branch) => branch.isCurrent)
    const canMerge = branchMergeWouldChange(
      ref,
      target.branch.sha,
      current,
      target.branch.mergedIntoCurrent
    )
    const localExists = isLocal || repo.branches.locals.some((branch) => branch.name === branchName)
    const checkedOutInWorktree = repo.worktrees.some((worktree) => worktree.branch === branchName)
    const items: MenuItem[] = []

    for (const action of branchContextActionIds(target.kind, canMerge)) {
      if (action === 'delete' && items.length) items.push({ separator: true })
      switch (action) {
        case 'rename':
          items.push({
            label: t('sidebar.renameBranch'),
            icon: mi.rename(),
            onClick: () => {
              close()
              openModal({
                kind: 'input',
                title: t('sidebar.renameBranchTitle'),
                label: t('sidebar.renameBranchLabel'),
                initial: branchName,
                submitLabel: t('sidebar.renameBranchSubmit'),
                onSubmit: (name) => {
                  const next = name.trim()
                  if (next && next !== branchName) void repoActions.renameBranch(path, branchName, next)
                }
              })
            }
          })
          break
        case 'copy':
          items.push({
            label: t('sidebar.copyBranchName'),
            icon: mi.copy(),
            onClick: () => {
              close()
              void navigator.clipboard.writeText(copyName)
            }
          })
          if (githubRemote(repo.remotes)) {
            const url =
              target.kind === 'local'
                ? githubLocalBranchUrl(repo.remotes, target.branch.upstream)
                : githubBranchUrl(repo.remotes, target.branch.remote, target.branch.name)
            items.push({
              label: t('branch.viewOnGitHub'),
              icon: mi.github(),
              disabled: !url,
              title: url ? undefined : t('branch.viewOnGitHubUnpushed'),
              onClick: () => {
                close()
                if (url) void shellApi.openExternal(url)
              }
            })
          }
          break
        case 'worktree':
          items.push({
            label: interp(t('sidebar.openInWorktree'), { branch: ref }),
            icon: mi.worktree(),
            disabled: checkedOutInWorktree,
            title: checkedOutInWorktree ? t('sidebar.disabled.inWorktree') : undefined,
            onClick: () => {
              close()
              const plan = branchWorktreePlan(path, branchName, ref, localExists)
              void repoActions
                .worktreeAdd(path, plan.dir, plan.branch, plan.newBranch, plan.startPoint)
                .then((ok) => {
                  if (ok) {
                    useSettingsStore
                      .getState()
                      .openRepoTab({ path: plan.dir, name: `${repo.name} - ${branchName}` })
                  }
                })
            }
          })
          break
        case 'merge':
          items.push({
            label: interp(t('branch.mergeInto'), {
              ref,
              branch: repo.branches.current,
              current: repo.branches.current
            }),
            icon: mi.merge(),
            onClick: () => {
              close()
              void repoActions.merge(path, ref)
            }
          })
          break
        case 'delete':
          items.push({
            label: isLocal ? t('sidebar.deleteBranch') : t('sidebar.deleteRemoteBranch'),
            icon: mi.delete(),
            danger: true,
            disabled: isLocal && branchName === repo.branches.current,
            title: isLocal && branchName === repo.branches.current ? t('branch.deleteCurrentBlocked') : undefined,
            onClick: () => {
              close()
              if (target.kind === 'local') {
                openModal({
                  kind: 'confirm',
                  title: t('sidebar.deleteBranchTitle'),
                  message: interp(t('sidebar.deleteBranchMsg'), { name: branchName }),
                  danger: true,
                  confirmLabel: t('sidebar.deleteBranchConfirm'),
                  onConfirm: () => void repoActions.deleteBranch(path, branchName, target.branch.sha)
                })
                return
              }
              openModal({
                kind: 'confirm',
                title: t('sidebar.deleteRemoteBranchTitle'),
                message: interp(t('sidebar.deleteRemoteBranchMsg'), {
                  branch: branchName,
                  remote: target.branch.remote
                }),
                danger: true,
                confirmLabel: t('sidebar.deleteRemoteBranchConfirm'),
                onConfirm: () => void repoActions.deleteRemoteBranch(path, target.branch.remote, branchName)
              })
            }
          })
          break
      }
    }
    return items
  }

  const openBranchContextMenu = (event: React.MouseEvent, target: BranchTarget): void => {
    event.preventDefault()
    event.stopPropagation()
    openContextMenu(event.clientX, event.clientY, contextItems(target))
  }

  return (
    <>
      <button
        ref={triggerRef}
        className="repo-pill"
        title={t('toolbar.switchBranch')}
        aria-haspopup="menu"
        aria-expanded={position !== null}
        onClick={toggle}
      >
        <GitBranch size={14} className="repo-pill-icon" />
        <span className="repo-pill-value" title={repo.branches.current || t('toolbar.noBranch')}>
          {repo.branches.current || t('toolbar.noBranch')}
        </span>
        <ChevronDown size={12} className="repo-pill-chevron" />
      </button>

      {position &&
        createPortal(
          <div
            ref={popoverRef}
            className="branch-picker-popover"
            role="menu"
            style={{
              left: position.left,
              top: position.top,
              width: position.width,
              maxHeight: position.maxHeight
            }}
          >
            <div className="branch-picker-scroll">
              <div className="branch-picker-heading">{t('sidebar.local')}</div>
              {repo.branches.locals.map((branch) => (
                <button
                  key={`local:${branch.name}`}
                  type="button"
                  className={`branch-picker-item ${branch.isCurrent ? 'active' : ''}`}
                  role="menuitemradio"
                  aria-checked={branch.isCurrent}
                  onClick={() => {
                    close()
                    if (!branch.isCurrent) void repoActions.checkout(path, branch.name)
                  }}
                  onContextMenu={(event) => openBranchContextMenu(event, { kind: 'local', branch })}
                >
                  <span className="branch-picker-check">
                    <ChoiceDot on={branch.isCurrent} />
                  </span>
                  <span className="branch-picker-name">{branch.name}</span>
                </button>
              ))}

              {repo.branches.remotes.length > 0 && (
                <>
                  <div className="branch-picker-separator" />
                  <div className="branch-picker-heading">{t('sidebar.remotes')}</div>
                  {repo.branches.remotes.map((branch) => (
                    <button
                      key={`remote:${branch.fullName}`}
                      type="button"
                      className="branch-picker-item"
                      role="menuitem"
                      onClick={() => {
                        close()
                        void repoActions.checkoutRemote(path, branch.fullName, branch.name, branch.remote)
                      }}
                      onContextMenu={(event) => openBranchContextMenu(event, { kind: 'remote', branch })}
                    >
                      <span className="branch-picker-check" />
                      <span className="branch-picker-name">{branch.fullName}</span>
                    </button>
                  ))}
                </>
              )}
            </div>

            <div className="branch-picker-separator" />
            <button
              type="button"
              className="branch-picker-item branch-picker-new"
              role="menuitem"
              onClick={() => {
                close()
                openModal({ kind: 'create-branch', path, currentBranch: repo.branches.current })
              }}
            >
              <span className="branch-picker-check">
                <GitBranchPlus size={15} />
              </span>
              <span className="branch-picker-name">{t('tools.newBranch')}</span>
            </button>
          </div>,
          document.body
        )}
    </>
  )
}
