/**
 * Marketplace types: a live registry of installable Toolbox modules.
 * The registry is plain JSON hosted in the public toolbox-widgets repo;
 * apps fetch it at runtime so the listing is never stale-by-build.
 */
import type { WidgetBundleEntry } from '../bundle.js'

export const MARKETPLACE_FORMAT = 'toolbox-marketplace'
export const MARKETPLACE_FORMAT_VERSION = 1

export const DEFAULT_REGISTRY_URL =
  'https://raw.githubusercontent.com/28121978444/toolbox-widgets/main/registry.json'

export type MarketplaceModuleType = 'widget' | 'feature' | 'remote-server'

export interface MarketplaceModule {
  id: string
  type: MarketplaceModuleType
  name: string
  description: string
  version: string
  author: string
  /** Single display glyph, rendered in the module card. */
  icon: string
  categories: string[]
  tags: string[]
  homepage: string
  /** Widget modules may ship default settings applied on install. */
  bundle?: WidgetBundleEntry
  /** Remote MCP endpoint (remote-server modules). HTTPS, public hosts only. */
  endpoint?: string
  /** Module needs credentials wired up locally after install. */
  credentialsRequired?: boolean
  /** Built-in modules ship with the app and cannot be uninstalled. */
  builtIn?: boolean
}

export interface MarketplaceRegistry {
  format: typeof MARKETPLACE_FORMAT
  formatVersion: typeof MARKETPLACE_FORMAT_VERSION
  updated: string
  modules: MarketplaceModule[]
}

export interface MarketplaceQuery {
  query?: string
  category?: string
}
