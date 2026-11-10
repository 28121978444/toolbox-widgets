/**
 * Marketplace registry: live fetch + validation + search. Installs are
 * resolved by the host app (widget bundles go through the portable bundle
 * validator); this module never executes anything from the registry.
 */
import type { FetchLike } from '../widgets/crypto-watch.js';
import { type MarketplaceModule, type MarketplaceQuery, type MarketplaceRegistry } from './types.js';
export interface FetchRegistryOptions {
    fetchImpl?: FetchLike;
    registryUrl?: string;
    timeoutMs?: number;
}
/** Validate a registry document. Throws with a friendly message when invalid. */
export declare function parseRegistry(value: unknown): MarketplaceRegistry;
/** Fetch and validate the live registry. */
export declare function fetchRegistry(options?: FetchRegistryOptions): Promise<MarketplaceRegistry>;
/** Live search over a fetched registry: substring query + exact category. */
export declare function searchModules(modules: MarketplaceModule[], filter?: MarketplaceQuery): MarketplaceModule[];
