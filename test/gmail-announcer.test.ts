import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatMailNotice,
  friendlyGmailError,
  validateGmailSettings,
  validateGmailSetup
} from '../dist/index.js'

describe('validateGmailSetup', () => {
  it('normalizes email and strips spaces from the App Password', () => {
    const setup = validateGmailSetup({ email: ' Me@Example.COM ', password: 'abcd efgh ijkl mnop' })
    assert.equal(setup.email, 'me@example.com')
    assert.equal(setup.password, 'abcdefghijklmnop')
  })

  it('rejects bad emails', () => {
    assert.throws(() => validateGmailSetup({ email: 'nope', password: 'abcdefghijklmnop' }), /valid Gmail address/i)
  })

  it('rejects passwords that are not 16 characters', () => {
    assert.throws(
      () => validateGmailSetup({ email: 'me@example.com', password: 'short' }),
      /16 characters/i
    )
  })
})

describe('validateGmailSettings (bundle)', () => {
  it('keeps email and defaults notifications to true', () => {
    assert.deepEqual(validateGmailSettings({ email: 'Me@Example.com' }), {
      email: 'me@example.com',
      notifications: true
    })
  })

  it('honors an explicit notifications flag', () => {
    assert.equal(validateGmailSettings({ email: 'me@example.com', notifications: false }).notifications, false)
  })

  it('never carries a password', () => {
    const settings = validateGmailSettings({ email: 'me@example.com', password: 'secret' })
    assert.equal('password' in settings, false)
  })

  it('rejects a bad email', () => {
    assert.throws(() => validateGmailSettings({ email: 'nope' }), /valid Gmail address/i)
  })
})

describe('friendlyGmailError', () => {
  const cases: Array<[unknown, RegExp]> = [
    [{ message: 'imap access is disabled' }, /IMAP is turned off/i],
    [{ message: 'application-specific password required' }, /App Password/i],
    [{ message: 'web login required' }, /blocked this sign-in/i],
    [{ message: 'too many simultaneous connections' }, /too many open IMAP/i],
    [{ message: 'invalid credentials' }, /rejected the sign-in/i],
    [{ message: 'authenticationFailed', authenticationFailed: true }, /rejected the sign-in/i],
    [{ message: 'getaddrinfo ENOTFOUND imap.gmail.com' }, /Could not reach Gmail/i],
    [{ message: 'self signed certificate' }, /secure connection/i]
  ]

  for (const [cause, pattern] of cases) {
    it(`maps ${String((cause as { message?: string }).message)}`, () => {
      assert.match(friendlyGmailError(cause), pattern)
    })
  }

  it('falls back to the original message', () => {
    assert.equal(friendlyGmailError(new Error('boom')), 'boom')
  })
})

describe('formatMailNotice', () => {
  const message = { uid: 1, from: 'Ada', subject: 'Hello', date: null, seen: false }

  it('builds a single-message notice', () => {
    assert.deepEqual(formatMailNotice([message], 1), {
      title: 'New mail in Gmail',
      body: 'Ada — Hello'
    })
  })

  it('builds a multi-message notice with the unread count', () => {
    const notice = formatMailNotice([message, { ...message, uid: 2 }], 5)
    assert.equal(notice?.title, '2 new messages in Gmail')
    assert.equal(notice?.body, '5 unread · Ada — Hello')
  })

  it('returns null for no messages', () => {
    assert.equal(formatMailNotice([], 0), null)
  })
})
