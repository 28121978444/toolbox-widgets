/**
 * Portable widget bundle format shared by every Toolbox-family app.
 *
 * A bundle is plain JSON that can be exported from one app and imported into
 * another. It carries widget settings only — secrets are never included;
 * widgets that need credentials reference a key in the host app's vault via
 * `credentialsRef`, and each app resolves it locally.
 */
import { validateCryptoSettings } from './widgets/crypto-watch.js'
import { validateGmailSettings } from './widgets/gmail-announcer.js'
import { validateResourceSettings } from './widgets/resource-monitor.js'

export const BUNDLE_FORMAT = 'toolbox-widgets'
export const BUNDLE_FORMAT_VERSION = 1

export const WIDGET_IDS = ['crypto-watch', 'gmail-announcer', 'resource-monitor'] as const
export type WidgetId = (typeof WIDGET_IDS)[number]

export interface WidgetBundleEntry {
  widget: WidgetId
  settings: Record<string, unknown>
  /** Vault key reference for credentials — resolved by the importing app, never exported. */
  credentialsRef?: string
}

export interface WidgetBundle {
  format: typeof BUNDLE_FORMAT
  formatVersion: typeof BUNDLE_FORMAT_VERSION
  exportedAt: string
  widgets: WidgetBundleEntry[]
}

function isWidgetId(value: unknown): value is WidgetId {
  return typeof value === 'string' && (WIDGET_IDS as readonly string[]).includes(value)
}

function validateEntry(value: unknown): WidgetBundleEntry {
  if (!value || typeof value !== 'object') throw new Error('Bundle entry is not an object.')
  const entry = value as { widget?: unknown; settings?: unknown; credentialsRef?: unknown }

  if (!isWidgetId(entry.widget)) {
    throw new Error(`Unknown widget "${String(entry.widget)}". Known: ${WIDGET_IDS.join(', ')}.`)
  }

  let settings: Record<string, unknown>
  switch (entry.widget) {
    case 'crypto-watch':
      settings = validateCryptoSettings(entry.settings) as unknown as Record<string, unknown>
      break
    case 'gmail-announcer':
      settings = validateGmailSettings(entry.settings) as unknown as Record<string, unknown>
      break
    case 'resource-monitor':
      settings = validateResourceSettings(entry.settings) as unknown as Record<string, unknown>
      break
  }

  if (entry.credentialsRef !== undefined) {
    if (entry.widget !== 'gmail-announcer') {
      throw new Error(`Widget "${entry.widget}" cannot carry a credentialsRef.`)
    }
    if (typeof entry.credentialsRef !== 'string' || entry.credentialsRef.trim() === '') {
      throw new Error('The credentialsRef must be a non-empty vault key name.')
    }
  }

  return {
    widget: entry.widget,
    settings,
    ...(entry.credentialsRef !== undefined
      ? { credentialsRef: entry.credentialsRef.trim() }
      : {})
  }
}

/** Validate and normalize a bundle. Throws with a friendly message when invalid. */
export function parseBundle(value: unknown): WidgetBundle {
  if (!value || typeof value !== 'object') throw new Error('The bundle is not an object.')
  const bundle = value as {
    format?: unknown
    formatVersion?: unknown
    exportedAt?: unknown
    widgets?: unknown
  }

  if (bundle.format !== BUNDLE_FORMAT) {
    throw new Error(`This is not a Toolbox widget bundle (format: ${String(bundle.format)}).`)
  }
  if (bundle.formatVersion !== BUNDLE_FORMAT_VERSION) {
    throw new Error(
      `Unsupported bundle version ${String(bundle.formatVersion)}. This app understands version ${BUNDLE_FORMAT_VERSION}.`
    )
  }
  if (!Array.isArray(bundle.widgets)) throw new Error('The bundle has no widget list.')

  return {
    format: BUNDLE_FORMAT,
    formatVersion: BUNDLE_FORMAT_VERSION,
    exportedAt:
      typeof bundle.exportedAt === 'string' ? bundle.exportedAt : new Date(0).toISOString(),
    widgets: bundle.widgets.map(validateEntry)
  }
}

/** Parse a bundle from JSON text. */
export function parseBundleJson(text: string): WidgetBundle {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('The bundle file is not valid JSON.')
  }
  return parseBundle(value)
}

/** Serialize entries to a portable JSON bundle. */
export function serializeBundle(entries: WidgetBundleEntry[], now: Date = new Date()): string {
  const bundle: WidgetBundle = {
    format: BUNDLE_FORMAT,
    formatVersion: BUNDLE_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    widgets: entries.map(validateEntry)
  }
  return `${JSON.stringify(bundle, null, 2)}\n`
}
