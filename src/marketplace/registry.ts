/**
 * Marketplace registry: live fetch + validation + search. Installs are
 * resolved by the host app (widget bundles go through the portable bundle
 * validator); this module never executes anything from the registry.
 */
import type { FetchLike } from '../widgets/crypto-watch.js'
import { validateRemoteEndpoint } from './remote.js'
import {
  DEFAULT_REGISTRY_URL,
  MARKETPLACE_FORMAT,
  MARKETPLACE_FORMAT_VERSION,
  type MarketplaceModule,
  type MarketplaceQuery,
  type MarketplaceRegistry
} from './types.js'

export interface FetchRegistryOptions {
  fetchImpl?: FetchLike
  registryUrl?: string
  timeoutMs?: number
}

function parseModule(value: unknown): MarketplaceModule {
  if (!value || typeof value !== 'object') throw new Error('Registry module is not an object.')
  const entry = value as Record<string, unknown>
  for (const field of ['id', 'name', 'description', 'version', 'author'] as const) {
    if (typeof entry[field] !== 'string' || (entry[field] as string).trim() === '') {
      throw new Error(`Registry module is missing a valid "${field}".`)
    }
  }
  if (entry.type !== 'widget' && entry.type !== 'feature' && entry.type !== 'remote-server') {
    throw new Error(`Registry module "${String(entry.id)}" has an unknown type.`)
  }
  const endpoint = entry.type === 'remote-server' ? validateRemoteEndpoint(entry.endpoint) : undefined
  return {
    id: entry.id as string,
    type: entry.type,
    name: entry.name as string,
    description: entry.description as string,
    version: entry.version as string,
    author: entry.author as string,
    icon: typeof entry.icon === 'string' ? entry.icon : '▣',
    categories: Array.isArray(entry.categories) ? entry.categories.filter((c): c is string => typeof c === 'string') : [],
    tags: Array.isArray(entry.tags) ? entry.tags.filter((t): t is string => typeof t === 'string') : [],
    homepage: typeof entry.homepage === 'string' ? entry.homepage : '',
    ...(entry.bundle && typeof entry.bundle === 'object' ? { bundle: entry.bundle as MarketplaceModule['bundle'] } : {}),
    ...(endpoint !== undefined ? { endpoint } : {}),
    ...(entry.credentialsRequired === true ? { credentialsRequired: true } : {}),
    ...(entry.builtIn === true ? { builtIn: true } : {})
  }
}

/** Validate a registry document. Throws with a friendly message when invalid. */
export function parseRegistry(value: unknown): MarketplaceRegistry {
  if (!value || typeof value !== 'object') throw new Error('The registry is not an object.')
  const registry = value as { format?: unknown; formatVersion?: unknown; updated?: unknown; modules?: unknown }
  if (registry.format !== MARKETPLACE_FORMAT) {
    throw new Error(`This is not a Toolbox marketplace registry (format: ${String(registry.format)}).`)
  }
  if (registry.formatVersion !== MARKETPLACE_FORMAT_VERSION) {
    throw new Error(
      `Unsupported registry version ${String(registry.formatVersion)}. This app understands version ${MARKETPLACE_FORMAT_VERSION}.`
    )
  }
  if (!Array.isArray(registry.modules)) throw new Error('The registry has no module list.')
  const modules = registry.modules.map(parseModule)
  const ids = new Set(modules.map((m) => m.id))
  if (ids.size !== modules.length) throw new Error('The registry contains duplicate module ids.')
  return {
    format: MARKETPLACE_FORMAT,
    formatVersion: MARKETPLACE_FORMAT_VERSION,
    updated: typeof registry.updated === 'string' ? registry.updated : '',
    modules
  }
}

/** Fetch and validate the live registry. */
export async function fetchRegistry(options: FetchRegistryOptions = {}): Promise<MarketplaceRegistry> {
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as FetchLike)
  const url = options.registryUrl ?? DEFAULT_REGISTRY_URL
  const timeoutMs = options.timeoutMs ?? 15000
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: 'application/json' }
  })
  if (!response.ok) throw new Error(`Marketplace registry returned HTTP ${response.status}.`)
  return parseRegistry(await response.json())
}

/** Live search over a fetched registry: substring query + exact category. */
export function searchModules(modules: MarketplaceModule[], filter: MarketplaceQuery = {}): MarketplaceModule[] {
  const query = filter.query?.trim().toLowerCase() ?? ''
  const category = filter.category?.trim().toLowerCase() ?? ''
  return modules.filter((module) => {
    if (category && !module.categories.some((c) => c.toLowerCase() === category)) return false
    if (!query) return true
    const haystack = [module.id, module.name, module.description, module.author, ...module.tags]
      .join(' ')
      .toLowerCase()
    return haystack.includes(query)
  })
}
