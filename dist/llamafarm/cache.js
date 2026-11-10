/**
 * Catalog cache shared by the Model Farm apps: the HuggingFace listing is
 * slow to rebuild (one detail request per model), so it is kept on disk for
 * a few hours between runs.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
export const DEFAULT_CATALOG_TTL_MS = 6 * 60 * 60 * 1000;
/** Path of the catalog cache file; defaults to ~/.toolbox-llamafarm. */
export function catalogCachePath(home) {
    return join(home ?? join(homedir(), '.toolbox-llamafarm'), 'catalog-cache.json');
}
/** Read the cache; returns null when it is missing or unusable. */
export function readCatalogCache(path) {
    try {
        const raw = JSON.parse(readFileSync(path, 'utf8'));
        if (!Array.isArray(raw.models) || typeof raw.fetchedAt !== 'number')
            return null;
        return { fetchedAt: raw.fetchedAt, models: raw.models };
    }
    catch {
        return null;
    }
}
/** Write the cache, creating the folder when needed. */
export function writeCatalogCache(path, models, now = Date.now()) {
    mkdirSync(dirname(path), { recursive: true });
    const payload = { fetchedAt: now, models };
    writeFileSync(path, JSON.stringify(payload), 'utf8');
}
/** True when the cache is younger than the TTL. */
export function isCatalogFresh(cache, ttlMs = DEFAULT_CATALOG_TTL_MS, now = Date.now()) {
    return cache !== null && now - cache.fetchedAt < ttlMs;
}
//# sourceMappingURL=cache.js.map