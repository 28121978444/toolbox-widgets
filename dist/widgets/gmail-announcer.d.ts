export declare const GMAIL_IMAP_HOST = "imap.gmail.com";
export declare const GMAIL_IMAP_PORT = 993;
export declare const GMAIL_APP_PASSWORD_LENGTH = 16;
export interface GmailMessage {
    uid: number;
    from: string;
    subject: string;
    date: string | null;
    seen: boolean;
}
export interface GmailCheckResult {
    unread: number;
    messages: GmailMessage[];
    maxUid: number;
}
export interface GmailAccountSettings {
    email: string;
    notifications: boolean;
}
export interface GmailFetchOptions {
    maxMessages?: number;
    connectTimeoutMs?: number;
}
export interface MailNotice {
    title: string;
    body: string;
}
/** Validate a Gmail address + 16-character App Password pair. */
export declare function validateGmailSetup(input: unknown): {
    email: string;
    password: string;
};
/** Validate portable settings (bundle format). Never includes the password. */
export declare function validateGmailSettings(value: unknown): GmailAccountSettings;
/** Translate imapflow / network errors into actionable messages. */
export declare function friendlyGmailError(cause: unknown): string;
/**
 * Read-only INBOX check: unread count plus the most recent messages.
 * The connection is always closed, even on error.
 */
export declare function fetchGmailInbox(email: string, password: string, options?: GmailFetchOptions): Promise<GmailCheckResult>;
/** Build the desktop notification for freshly arrived messages. */
export declare function formatMailNotice(messages: GmailMessage[], unread: number): MailNotice | null;
