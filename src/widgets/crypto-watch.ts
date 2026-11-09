/**
 * Crypto watch widget core: CoinGecko market data and price history, with
 * validation and parsing kept free of app state so any host can reuse it.
 */

export const CRYPTO_MAX_COINS = 8
export const CRYPTO_SERIES_RANGES = [30, 90, 180] as const
export const CRYPTO_SERIES_MAX_POINTS = 240

export type CryptoRange = (typeof CRYPTO_SERIES_RANGES)[number]

export interface CryptoCoin {
  id: string
  symbol: string
  name: string
  price: number
  change24h: number | null
  marketCap: number | null
}

export interface CryptoSeriesPoint {
  t: number
  p: number
}

export interface CryptoSeries {
  id: string
  days: CryptoRange
  points: CryptoSeriesPoint[]
  change: number | null
  high: number
  low: number
  fetchedAt: number
}

export interface FetchLike {
  (url: string | URL, init?: RequestInit): Promise<Response>
}

export interface CryptoFetchOptions {
  userAgent: string
  timeoutMs?: number
  fetchImpl?: FetchLike
}

const COIN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/

function normalizeCoinId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const id = value.trim().toLowerCase()
  return COIN_ID_PATTERN.test(id) ? id : null
}

/** Validate and dedupe a watchlist. Throws with a friendly message. */
export function normalizeWatchlist(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('Choose at least one coin id.')
  const ids = value
    .map(normalizeCoinId)
    .filter((id): id is string => Boolean(id))

  const unique = [...new Set(ids)]
  if (unique.length === 0) throw new Error('Choose at least one coin id.')
  if (unique.length > CRYPTO_MAX_COINS) {
    throw new Error(`Watch up to ${CRYPTO_MAX_COINS} coins at a time.`)
  }
  return unique
}

/** Validate a chart range (days). Throws with a friendly message. */
export function normalizeRange(value: unknown): CryptoRange {
  if (typeof value !== 'number' || !CRYPTO_SERIES_RANGES.includes(value as CryptoRange)) {
    throw new Error('Choose a 1, 3 or 6 month range.')
  }
  return value as CryptoRange
}

interface RawCoin {
  id?: string
  symbol?: string
  name?: string
  current_price?: number
  price_change_percentage_24h?: number | null
  market_cap?: number | null
}

/** Map a CoinGecko /coins/markets payload to coins, preserving watchlist order. */
export function parseMarketsPayload(data: unknown, ids: string[]): { coins: CryptoCoin[]; missing: string[] } {
  if (!Array.isArray(data)) throw new Error('CoinGecko returned an unexpected response.')

  const found = new Map<string, CryptoCoin>()
  for (const entry of data as RawCoin[]) {
    if (typeof entry.id !== 'string' || typeof entry.current_price !== 'number') continue
    found.set(entry.id, {
      id: entry.id,
      symbol: (entry.symbol ?? entry.id).toUpperCase(),
      name: entry.name ?? entry.id,
      price: entry.current_price,
      change24h:
        typeof entry.price_change_percentage_24h === 'number'
          ? entry.price_change_percentage_24h
          : null,
      marketCap: typeof entry.market_cap === 'number' ? entry.market_cap : null
    })
  }

  const coins = ids.map((id) => found.get(id)).filter((coin): coin is CryptoCoin => Boolean(coin))
  const missing = ids.filter((id) => !found.has(id))
  return { coins, missing }
}

/** Extract, clean and sort raw [time, price] pairs from a market_chart payload. */
export function parseSeriesPayload(data: unknown): CryptoSeriesPoint[] {
  const raw = (data as { prices?: unknown })?.prices
  if (!Array.isArray(raw)) throw new Error('CoinGecko returned an unexpected response.')

  const points: CryptoSeriesPoint[] = []
  for (const entry of raw) {
    if (!Array.isArray(entry)) continue
    const [t, p] = entry
    if (typeof t !== 'number' || typeof p !== 'number' || !Number.isFinite(p)) continue
    points.push({ t, p })
  }
  if (points.length < 2) {
    throw new Error('CoinGecko returned no usable price history for this coin.')
  }
  points.sort((a, b) => a.t - b.t)
  return points
}

/** Reduce a series to at most `max` evenly spaced points, keeping the last. */
export function downsamplePoints(
  points: CryptoSeriesPoint[],
  max: number = CRYPTO_SERIES_MAX_POINTS
): CryptoSeriesPoint[] {
  if (points.length <= max) return points

  const sampled: CryptoSeriesPoint[] = []
  const step = (points.length - 1) / (max - 1)
  for (let index = 0; index < max; index += 1) {
    sampled.push(points[Math.round(index * step)])
  }
  sampled[sampled.length - 1] = points[points.length - 1]
  return sampled
}

/** Compute change/high/low over cleaned points. */
export function summarizeSeries(
  points: CryptoSeriesPoint[],
  id: string,
  days: CryptoRange,
  now: number = Date.now()
): CryptoSeries {
  if (points.length < 2) throw new Error('Need at least two price points.')

  let high = points[0].p
  let low = points[0].p
  for (const point of points) {
    if (point.p > high) high = point.p
    if (point.p < low) low = point.p
  }

  const first = points[0].p
  const last = points[points.length - 1].p
  return {
    id,
    days,
    points: downsamplePoints(points),
    change: first > 0 ? ((last - first) / first) * 100 : null,
    high,
    low,
    fetchedAt: now
  }
}

function coinGeckoError(response: Response): Error {
  if (response.status === 429) {
    return new Error('CoinGecko rate limit reached. Wait a minute, then try again.')
  }
  if (response.status === 404) {
    return new Error('CoinGecko did not recognize that coin id.')
  }
  return new Error(`CoinGecko returned HTTP ${response.status}.`)
}

async function fetchJson(url: URL, options: CryptoFetchOptions): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as FetchLike)
  const timeoutMs = options.timeoutMs ?? 15000

  let response: Response
  try {
    response = await fetchImpl(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': options.userAgent, Accept: 'application/json' }
    })
  } catch (cause) {
    throw new Error(
      cause instanceof Error && cause.name === 'TimeoutError'
        ? 'CoinGecko did not respond in time. Try again.'
        : 'Could not reach CoinGecko. Check your internet connection.'
    )
  }

  if (!response.ok) throw coinGeckoError(response)
  return response.json()
}

const MARKETS_URL = 'https://api.coingecko.com/api/v3/coins/markets'

export async function fetchMarkets(
  ids: string[],
  options: CryptoFetchOptions
): Promise<{ coins: CryptoCoin[]; missing: string[] }> {
  const watchlist = normalizeWatchlist(ids)
  const url = new URL(MARKETS_URL)
  url.searchParams.set('vs_currency', 'usd')
  url.searchParams.set('ids', watchlist.join(','))
  url.searchParams.set('order', 'market_cap_desc')
  url.searchParams.set('per_page', String(CRYPTO_MAX_COINS))
  url.searchParams.set('page', '1')
  url.searchParams.set('sparkline', 'false')
  url.searchParams.set('price_change_percentage', '24h')

  const data = await fetchJson(url, options)
  return parseMarketsPayload(data, watchlist)
}

export async function fetchSeries(
  id: unknown,
  days: unknown,
  options: CryptoFetchOptions
): Promise<CryptoSeries> {
  const coinId = normalizeCoinId(id)
  if (!coinId) throw new Error('Use a CoinGecko coin id such as bitcoin or ethereum.')
  const range = normalizeRange(days)

  const url = new URL(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart`)
  url.searchParams.set('vs_currency', 'usd')
  url.searchParams.set('days', String(range))

  const data = await fetchJson(url, options)
  return summarizeSeries(parseSeriesPayload(data), coinId, range)
}

/** Validate portable widget settings for the bundle format. */
export function validateCryptoSettings(value: unknown): { watchlist: string[] } {
  if (!value || typeof value !== 'object') throw new Error('Crypto watch settings are missing.')
  const settings = value as { watchlist?: unknown }
  return { watchlist: normalizeWatchlist(settings.watchlist) }
}
