/**
 * Crypto watch widget core: CoinGecko market data and price history, with
 * validation and parsing kept free of app state so any host can reuse it.
 */
export declare const CRYPTO_MAX_COINS = 8;
export declare const CRYPTO_SERIES_RANGES: readonly [30, 90, 180];
export declare const CRYPTO_SERIES_MAX_POINTS = 240;
export type CryptoRange = (typeof CRYPTO_SERIES_RANGES)[number];
export interface CryptoCoin {
    id: string;
    symbol: string;
    name: string;
    price: number;
    change24h: number | null;
    marketCap: number | null;
}
export interface CryptoSeriesPoint {
    t: number;
    p: number;
}
export interface CryptoSeries {
    id: string;
    days: CryptoRange;
    points: CryptoSeriesPoint[];
    change: number | null;
    high: number;
    low: number;
    fetchedAt: number;
}
export interface FetchLike {
    (url: string | URL, init?: RequestInit): Promise<Response>;
}
export interface CryptoFetchOptions {
    userAgent: string;
    timeoutMs?: number;
    fetchImpl?: FetchLike;
}
/** Validate and dedupe a watchlist. Throws with a friendly message. */
export declare function normalizeWatchlist(value: unknown): string[];
/** Validate a chart range (days). Throws with a friendly message. */
export declare function normalizeRange(value: unknown): CryptoRange;
/** Map a CoinGecko /coins/markets payload to coins, preserving watchlist order. */
export declare function parseMarketsPayload(data: unknown, ids: string[]): {
    coins: CryptoCoin[];
    missing: string[];
};
/** Extract, clean and sort raw [time, price] pairs from a market_chart payload. */
export declare function parseSeriesPayload(data: unknown): CryptoSeriesPoint[];
/** Reduce a series to at most `max` evenly spaced points, keeping the last. */
export declare function downsamplePoints(points: CryptoSeriesPoint[], max?: number): CryptoSeriesPoint[];
/** Compute change/high/low over cleaned points. */
export declare function summarizeSeries(points: CryptoSeriesPoint[], id: string, days: CryptoRange, now?: number): CryptoSeries;
export declare function fetchMarkets(ids: string[], options: CryptoFetchOptions): Promise<{
    coins: CryptoCoin[];
    missing: string[];
}>;
export declare function fetchSeries(id: unknown, days: unknown, options: CryptoFetchOptions): Promise<CryptoSeries>;
/** Validate portable widget settings for the bundle format. */
export declare function validateCryptoSettings(value: unknown): {
    watchlist: string[];
};
