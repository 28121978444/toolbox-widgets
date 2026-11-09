export {
  BUNDLE_FORMAT,
  BUNDLE_FORMAT_VERSION,
  WIDGET_IDS,
  parseBundle,
  parseBundleJson,
  serializeBundle
} from './bundle.js'
export type { WidgetBundle, WidgetBundleEntry, WidgetId } from './bundle.js'

export {
  CRYPTO_MAX_COINS,
  CRYPTO_SERIES_MAX_POINTS,
  CRYPTO_SERIES_RANGES,
  downsamplePoints,
  fetchMarkets,
  fetchSeries,
  normalizeRange,
  normalizeWatchlist,
  parseMarketsPayload,
  parseSeriesPayload,
  summarizeSeries,
  validateCryptoSettings
} from './widgets/crypto-watch.js'
export type {
  CryptoCoin,
  CryptoFetchOptions,
  CryptoRange,
  CryptoSeries,
  CryptoSeriesPoint,
  FetchLike
} from './widgets/crypto-watch.js'

export {
  fetchGmailInbox,
  formatMailNotice,
  friendlyGmailError,
  GMAIL_APP_PASSWORD_LENGTH,
  GMAIL_IMAP_HOST,
  GMAIL_IMAP_PORT,
  validateGmailSettings,
  validateGmailSetup
} from './widgets/gmail-announcer.js'
export type {
  GmailAccountSettings,
  GmailCheckResult,
  GmailFetchOptions,
  GmailMessage,
  MailNotice
} from './widgets/gmail-announcer.js'

export {
  createResourceMonitor,
  validateResourceSettings
} from './widgets/resource-monitor.js'
export type {
  ResourceMonitorOptions,
  ResourceMonitorSettings,
  ResourceStats,
  TopProcess
} from './widgets/resource-monitor.js'
