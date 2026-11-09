/**
 * Gmail announcer widget core: read-only IMAP checks against Gmail with
 * friendly errors. Credential storage and notifications are the host app's
 * job — secrets never live inside a portable bundle.
 */
import { ImapFlow } from 'imapflow'

export const GMAIL_IMAP_HOST = 'imap.gmail.com'
export const GMAIL_IMAP_PORT = 993
export const GMAIL_APP_PASSWORD_LENGTH = 16

export interface GmailMessage {
  uid: number
  from: string
  subject: string
  date: string | null
  seen: boolean
}

export interface GmailCheckResult {
  unread: number
  messages: GmailMessage[]
  maxUid: number
}

export interface GmailAccountSettings {
  email: string
  notifications: boolean
}

export interface GmailFetchOptions {
  maxMessages?: number
  connectTimeoutMs?: number
}

export interface MailNotice {
  title: string
  body: string
}

/** Validate a Gmail address + 16-character App Password pair. */
export function validateGmailSetup(input: unknown): { email: string; password: string } {
  if (!input || typeof input !== 'object') {
    throw new Error('Enter your Gmail address and App Password.')
  }
  const setup = input as { email?: unknown; password?: unknown }
  const email = typeof setup.email === 'string' ? setup.email.trim().toLowerCase() : ''
  // Google shows App Passwords in four groups; the spaces are not part of the password.
  const password =
    typeof setup.password === 'string' ? setup.password.replace(/\s+/g, '') : ''

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
    throw new Error('Enter a valid Gmail address.')
  }
  if (password.length !== GMAIL_APP_PASSWORD_LENGTH) {
    throw new Error(
      'Gmail App Passwords are 16 characters. Paste the App Password generated at myaccount.google.com/apppasswords — your normal Google password will not work.'
    )
  }
  return { email, password }
}

/** Validate portable settings (bundle format). Never includes the password. */
export function validateGmailSettings(value: unknown): GmailAccountSettings {
  if (!value || typeof value !== 'object') throw new Error('Gmail announcer settings are missing.')
  const settings = value as { email?: unknown; notifications?: unknown }
  const email = typeof settings.email === 'string' ? settings.email.trim().toLowerCase() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
    throw new Error('Enter a valid Gmail address.')
  }
  return { email, notifications: settings.notifications !== false }
}

/** Translate imapflow / network errors into actionable messages. */
export function friendlyGmailError(cause: unknown): string {
  const error = cause as {
    message?: string
    responseText?: string
    executedCommand?: string
    authenticationFailed?: boolean
  }
  const detail = typeof error?.responseText === 'string' ? error.responseText.trim() : ''
  const message = error?.message || (cause instanceof Error ? cause.message : String(cause))
  const combined = `${message} ${detail}`
  const command = (error?.executedCommand ?? '').toUpperCase()

  if (/imap access is disabled|imap is disabled/i.test(combined)) {
    return 'IMAP is turned off for this Gmail account. Enable it in Gmail → Settings → See all settings → Forwarding and POP/IMAP, then try again.'
  }
  if (/application-specific password required/i.test(combined)) {
    return 'Google requires an App Password. Turn on 2-step verification and create one at myaccount.google.com/apppasswords.'
  }
  if (/web login required|please log in via your web browser|less secure/i.test(combined)) {
    return 'Google blocked this sign-in. Open Gmail in a browser, complete any security prompt, then try the App Password again.'
  }
  if (/too many simultaneous connections|too many connections/i.test(combined)) {
    return 'Gmail has too many open IMAP connections right now. Wait a minute and try again.'
  }
  if (
    error?.authenticationFailed ||
    /authentication|invalid credentials|login failed|auth failed|AUTHENTICATE/i.test(combined) ||
    /AUTHENTICATE|LOGIN/.test(command)
  ) {
    return 'Gmail rejected the sign-in. Use a 16-character App Password with 2-step verification enabled — your normal Google password will not work.'
  }
  if (
    /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|CONNECT_TIMEOUT|timeout|network|no connection/i.test(
      combined
    )
  ) {
    return 'Could not reach Gmail. Check your internet connection and try again.'
  }
  if (/certificate|self signed|TLS|SSL/i.test(combined)) {
    return 'The secure connection to Gmail could not be verified.'
  }
  if (detail) {
    return `Gmail rejected the request: ${detail}`
  }
  if (/^command failed$/i.test(message)) {
    return 'Gmail rejected the request. Check that IMAP is enabled for this account and use a fresh App Password.'
  }
  return message
}

function formatSender(envelope: {
  from?: { name?: string; address?: string }[]
} | undefined): string {
  const first = envelope?.from?.[0]
  if (!first) return 'Unknown sender'
  return first.name?.trim() || first.address?.trim() || 'Unknown sender'
}

function isoDate(value: Date | string | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * Read-only INBOX check: unread count plus the most recent messages.
 * The connection is always closed, even on error.
 */
export async function fetchGmailInbox(
  email: string,
  password: string,
  options: GmailFetchOptions = {}
): Promise<GmailCheckResult> {
  const maxMessages = options.maxMessages ?? 6
  const timeout = options.connectTimeoutMs ?? 20000

  const client = new ImapFlow({
    host: GMAIL_IMAP_HOST,
    port: GMAIL_IMAP_PORT,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
    emitLogs: false,
    disableAutoIdle: true,
    connectionTimeout: timeout,
    greetingTimeout: timeout,
    socketTimeout: timeout
  })

  await client.connect()
  try {
    const mailboxStatus = await client.status('INBOX', { unseen: true })
    const lock = await client.getMailboxLock('INBOX', { readOnly: true })
    try {
      const exists = client.mailbox ? client.mailbox.exists : 0
      const messages: GmailMessage[] = []
      let maxUid = 0

      if (exists > 0) {
        const start = Math.max(1, exists - maxMessages + 1)
        for await (const message of client.fetch(`${start}:*`, {
          envelope: true,
          flags: true
        })) {
          const flags = message.flags ?? new Set<string>()
          messages.push({
            uid: message.uid,
            from: formatSender(message.envelope),
            subject: message.envelope?.subject?.trim() || '(no subject)',
            date: isoDate(message.envelope?.date),
            seen: flags.has('\\Seen')
          })
          maxUid = Math.max(maxUid, message.uid)
        }
      }

      messages.sort((left, right) => right.uid - left.uid)
      return {
        unread: typeof mailboxStatus === 'object' && mailboxStatus ? (mailboxStatus.unseen ?? 0) : 0,
        messages,
        maxUid
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
}

/** Build the desktop notification for freshly arrived messages. */
export function formatMailNotice(messages: GmailMessage[], unread: number): MailNotice | null {
  if (messages.length === 0) return null
  if (messages.length === 1) {
    return {
      title: 'New mail in Gmail',
      body: `${messages[0].from} — ${messages[0].subject}`
    }
  }
  return {
    title: `${messages.length} new messages in Gmail`,
    body: `${unread} unread · ${messages[0].from} — ${messages[0].subject}`
  }
}
