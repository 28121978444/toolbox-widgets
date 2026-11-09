import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  downsamplePoints,
  fetchMarkets,
  fetchSeries,
  normalizeRange,
  normalizeWatchlist,
  parseMarketsPayload,
  parseSeriesPayload,
  summarizeSeries,
  validateCryptoSettings
} from '../dist/index.js'

describe('normalizeWatchlist', () => {
  it('trims, lowercases and dedupes ids', () => {
    assert.deepEqual(normalizeWatchlist([' Bitcoin ', 'BITCOIN', 'ethereum']), [
      'bitcoin',
      'ethereum'
    ])
  })

  it('rejects an empty list', () => {
    assert.throws(() => normalizeWatchlist([]), /at least one coin/i)
    assert.throws(() => normalizeWatchlist('bitcoin'), /at least one coin/i)
  })

  it('rejects non-string and invalid ids', () => {
    assert.throws(() => normalizeWatchlist([42, '']), /at least one coin/i)
    assert.throws(() => normalizeWatchlist(['bad id!']), /at least one coin/i)
  })

  it('caps the watchlist at 8 coins', () => {
    const ids = Array.from({ length: 9 }, (_, index) => `coin-${index + 1}`)
    assert.throws(() => normalizeWatchlist(ids), /up to 8/i)
  })
})

describe('normalizeRange', () => {
  it('accepts supported ranges', () => {
    assert.equal(normalizeRange(30), 30)
    assert.equal(normalizeRange(180), 180)
  })

  it('rejects unsupported ranges', () => {
    assert.throws(() => normalizeRange(7), /1, 3 or 6 month/i)
    assert.throws(() => normalizeRange('30'), /1, 3 or 6 month/i)
  })
})

describe('parseMarketsPayload', () => {
  it('maps coins in watchlist order and reports missing ids', () => {
    const { coins, missing } = parseMarketsPayload(
      [
        { id: 'ethereum', symbol: 'eth', name: 'Ethereum', current_price: 3000, market_cap: 3 },
        { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 60000, price_change_percentage_24h: 1.5 }
      ],
      ['bitcoin', 'ethereum', 'solana']
    )
    assert.deepEqual(
      coins.map((coin) => coin.id),
      ['bitcoin', 'ethereum']
    )
    assert.equal(coins[0].symbol, 'BTC')
    assert.equal(coins[0].change24h, 1.5)
    assert.equal(coins[1].change24h, null)
    assert.deepEqual(missing, ['solana'])
  })

  it('skips entries without an id or price', () => {
    const { coins } = parseMarketsPayload(
      [{ id: 'bitcoin', current_price: 60000 }, { id: 'broken' }, { current_price: 1 }],
      ['bitcoin']
    )
    assert.equal(coins.length, 1)
  })

  it('rejects a non-array payload', () => {
    assert.throws(() => parseMarketsPayload({}, []), /unexpected response/i)
  })
})

describe('parseSeriesPayload + summarizeSeries', () => {
  it('cleans, sorts and summarizes points', () => {
    const points = parseSeriesPayload({
      prices: [
        [2000, 2],
        [1000, 1],
        ['bad', 5],
        [3000, 'bad'],
        [4000, 4]
      ]
    })
    assert.deepEqual(points, [
      { t: 1000, p: 1 },
      { t: 2000, p: 2 },
      { t: 4000, p: 4 }
    ])

    const series = summarizeSeries(points, 'bitcoin', 30, 123)
    assert.equal(series.change, 300)
    assert.equal(series.high, 4)
    assert.equal(series.low, 1)
    assert.equal(series.fetchedAt, 123)
    assert.equal(series.days, 30)
  })

  it('rejects payloads with fewer than two usable points', () => {
    assert.throws(() => parseSeriesPayload({ prices: [[1, 2]] }), /no usable price history/i)
    assert.throws(() => parseSeriesPayload({}), /unexpected response/i)
  })
})

describe('downsamplePoints', () => {
  it('keeps short series untouched', () => {
    const points = [
      { t: 1, p: 1 },
      { t: 2, p: 2 }
    ]
    assert.deepEqual(downsamplePoints(points), points)
  })

  it('reduces long series to max points and keeps the last point', () => {
    const points = Array.from({ length: 1000 }, (_, index) => ({ t: index, p: index }))
    const sampled = downsamplePoints(points, 240)
    assert.equal(sampled.length, 240)
    assert.deepEqual(sampled[sampled.length - 1], { t: 999, p: 999 })
  })
})

describe('fetchMarkets / fetchSeries with injected fetch', () => {
  it('sends a well-formed CoinGecko request and parses the response', async () => {
    let seenUrl = ''
    const fetchImpl = async (url: string | URL) => {
      seenUrl = String(url)
      return new Response(
        JSON.stringify([{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 60000 }]),
        { status: 200 }
      )
    }
    const { coins } = await fetchMarkets(['bitcoin'], { userAgent: 'test', fetchImpl })
    assert.equal(coins.length, 1)
    assert.ok(seenUrl.includes('api.coingecko.com'))
    assert.ok(seenUrl.includes('ids=bitcoin'))
  })

  it('maps HTTP 429 to a friendly rate-limit error', async () => {
    const fetchImpl = async () => new Response('[]', { status: 429 })
    await assert.rejects(
      () => fetchMarkets(['bitcoin'], { userAgent: 'test', fetchImpl }),
      /rate limit/i
    )
  })

  it('fetches and summarizes a series', async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ prices: [[1000, 1], [2000, 2], [3000, 3]] }), { status: 200 })
    const series = await fetchSeries('bitcoin', 90, { userAgent: 'test', fetchImpl })
    assert.equal(series.id, 'bitcoin')
    assert.equal(series.days, 90)
    assert.equal(series.change, 200)
  })

  it('rejects unknown coin ids before hitting the network', async () => {
    await assert.rejects(
      () => fetchSeries('BAD ID!', 90, { userAgent: 'test', fetchImpl: async () => new Response('{}') }),
      /coin id/i
    )
  })
})

describe('validateCryptoSettings', () => {
  it('accepts a valid watchlist', () => {
    assert.deepEqual(validateCryptoSettings({ watchlist: ['bitcoin'] }), {
      watchlist: ['bitcoin']
    })
  })

  it('rejects missing or invalid settings', () => {
    assert.throws(() => validateCryptoSettings(null), /missing/i)
    assert.throws(() => validateCryptoSettings({ watchlist: [] }), /at least one coin/i)
  })
})
