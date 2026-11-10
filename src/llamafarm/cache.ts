/**
 * Catalog cache shared by the Model Farm apps: the HuggingFace listing is
 * slow to rebuild (one detail request per model), so it is kept on disk for
 * a few hours between runs.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { CatalogModel } from './types.js'

export interface CatalogCache {
  fetchedAt: number
  models: CatalogModel[]
}

export const DEFAULT_CATALOG_TTL_MS = 6 * 60 * 60 * 1000

/** Path of the catalog cache file; defaults to ~/.toolbox-llamafarm. */
export function catalogCachePath(home?: string): string {
  return join(home ?? join(homedir(), '.toolbox-llamafarm'), 'catalog-cache.json')
}

/** Read the cache; returns null when it is missing or unusable. */
export function readCatalogCache(path: string): CatalogCache | null {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<CatalogCache>
    if (!Array.isArray(raw.models) || typeof raw.fetchedAt !== 'number') return null
    return { fetchedAt: raw.fetchedAt, models: raw.models as CatalogModel[] }
  } catch {
    return null
  }
}

/** Write the cache, creating the folder when needed. */
export function writeCatalogCache(path: string, models: CatalogModel[], now: number = Date.now()): void {
  mkdirSync(dirname(path), { recursive: true })
  const payload: CatalogCache = { fetchedAt: now, models }
  writeFileSync(path, JSON.stringify(payload), 'utf8')
}

/** True when the cache is younger than the TTL. */
export function isCatalogFresh(cache: CatalogCache | null, ttlMs: number = DEFAULT_CATALOG_TTL_MS, now: number = Date.now()): boolean {
  return cache !== null && now - cache.fetchedAt < ttlMs
}
