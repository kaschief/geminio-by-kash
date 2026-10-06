import { describe, it, expect } from 'vitest'
import {
  addNotice,
  badgeText,
  noticeBadge,
  parseStoredNotices,
  sanitizeNoticeMessage,
  unseenErrors,
  NOTICE_LIMIT,
  type Notice
} from '../src/renderer/src/lib/notices'

const n = (id: number, kind: Notice['kind'] = 'success'): Notice => ({ id, kind, message: `m${id}`, at: id })

describe('the bell list', () => {
  it('keeps the most recent, dropping the oldest past the limit', () => {
    let list: Notice[] = []
    for (let i = 1; i <= NOTICE_LIMIT + 5; i++) list = addNotice(list, n(i))
    expect(list).toHaveLength(NOTICE_LIMIT)
    expect(list[0].id).toBe(6)
  })

  it('counts unseen messages, and errors among them separately', () => {
    const list = [n(1, 'error'), n(2), n(3, 'info'), n(4, 'error')]
    // One rejected push among three other messages is "1 error", not "4".
    expect(noticeBadge(list, 0)).toEqual({ unseen: 4, errors: 2 })
    expect(noticeBadge(list, 1)).toEqual({ unseen: 3, errors: 1 })
    expect(noticeBadge(list, 4)).toEqual({ unseen: 0, errors: 0 })
  })

  it('counts unseen errors for the Dock icon', () => {
    expect(unseenErrors([n(1, 'error'), n(2, 'error'), n(3)], 1)).toBe(1)
  })

  it('caps the badge text', () => {
    expect(badgeText(7)).toBe('7')
    expect(badgeText(150)).toBe('99+')
  })
})

describe('what is kept on disk', () => {
  it('never keeps a credential from a URL in a message', () => {
    expect(sanitizeNoticeMessage('fatal: unable to access https://kash:ghp_secret@github.com/a/b.git'))
      .toBe('fatal: unable to access https://github.com/a/b.git')
    expect(sanitizeNoticeMessage('ssh://git@host/x')).toBe('ssh://host/x')
    expect(sanitizeNoticeMessage('Pushed main to origin')).toBe('Pushed main to origin')
  })

  it('cuts very long output', () => {
    expect(sanitizeNoticeMessage('x'.repeat(5000))).toHaveLength(2001)
  })

  it('reads back what it saved, and starts fresh from anything unreadable', () => {
    const saved = JSON.stringify({ notices: [n(4, 'error'), { id: 'bad' }, n(5)], seenUpTo: 4 })
    expect(parseStoredNotices(saved)).toEqual({ notices: [n(4, 'error'), n(5)], seenUpTo: 4 })
    expect(parseStoredNotices('not json')).toEqual({ notices: [], seenUpTo: 0 })
    expect(parseStoredNotices(null)).toEqual({ notices: [], seenUpTo: 0 })
  })
})
