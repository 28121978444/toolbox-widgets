import type { CatalogModel } from './types.js';
export interface CatalogCache {
    fetchedAt: number;
    models: CatalogModel[];
}
export declare const DEFAULT_CATALOG_TTL_MS: number;
/** Path of the catalog cache file; defaults to ~/.toolbox-llamafarm. */
export declare function catalogCachePath(home?: string): string;
/** Read the cache; returns null when it is missing or unusable. */
export declare function readCatalogCache(path: string): CatalogCache | null;
/** Write the cache, creating the folder when needed. */
export declare function writeCatalogCache(path: string, models: CatalogModel[], now?: number): void;
/** True when the cache is younger than the TTL. */
export declare function isCatalogFresh(cache: CatalogCache | null, ttlMs?: number, now?: number): boolean;
