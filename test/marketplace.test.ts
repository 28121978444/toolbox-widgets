import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import {
  fetchRegistry,
  parseRegistry,
  searchModules,
  type FetchLike,
  type MarketplaceRegistry
} from '../dist/index.js'

const REGISTRY: MarketplaceRegistry = {
  format: 'toolbox-marketplace',
  formatVersion: 1,
  updated: '2026-11-10T00:00:00.000Z',
  modules: [
    {
      id: 'crypto-watch',
      type: 'widget',
      name: 'Crypto Watch',
      description: 'Live coin prices',
      version: '0.1.0',
      author: 'Toolbox',
      icon: '◈',
      categories: ['finance'],
      tags: ['crypto', 'prices'],
      homepage: 'https://example.com',
      bundle: { widget: 'crypto-watch', settings: { watchlist: ['bitcoin'] } }
    },
    {
      id: 'llamafarm',
      type: 'feature',
      name: 'Model Farm',
      description: 'Find local models that run',
      version: '0.2.0',
      author: 'Toolbox',
      icon: '⌁',
      categories: ['ai'],
      tags: ['llm', 'ollama'],
      homepage: 'https://example.com',
      builtIn: true
    }
  ]
}

describe('parseRegistry', () => {
  it('accepts a valid registry and normalizes optional fields', () => {
    const parsed = parseRegistry(REGISTRY)
    assert.equal(parsed.modules.length, 2)
    assert.equal(parsed.modules[1]?.builtIn, true)
    assert.equal(parsed.modules[0]?.bundle?.widget, 'crypto-watch')
  })

  it('rejects wrong format, version and duplicate ids', () => {
    assert.throws(() => parseRegistry({ ...REGISTRY, format: 'nope' }), /not a Toolbox marketplace registry/i)
    assert.throws(() => parseRegistry({ ...REGISTRY, formatVersion: 99 }), /unsupported registry version/i)
    assert.throws(
      () => parseRegistry({ ...REGISTRY, modules: [REGISTRY.modules[0], REGISTRY.modules[0]] }),
      /duplicate module ids/i
    )
  })

  it('rejects modules missing required fields or with unknown type', () => {
    assert.throws(
      () => parseRegistry({ ...REGISTRY, modules: [{ id: 'x', type: 'widget' }] }),
      /missing a valid/i
    )
    assert.throws(
      () => parseRegistry({ ...REGISTRY, modules: [{ ...REGISTRY.modules[0], type: 'plugin' }] }),
      /unknown type/i
    )
  })
})

describe('searchModules', () => {
  it('matches query across name, description, tags and author', () => {
    assert.equal(searchModules(REGISTRY.modules, { query: 'ollama' })[0]?.id, 'llamafarm')
    assert.equal(searchModules(REGISTRY.modules, { query: 'COIN PRICES' })[0]?.id, 'crypto-watch')
    assert.equal(searchModules(REGISTRY.modules, { query: 'toolbox' }).length, 2)
    assert.equal(searchModules(REGISTRY.modules, { query: 'zzz' }).length, 0)
  })

  it('filters by exact category and combines with query', () => {
    assert.equal(searchModules(REGISTRY.modules, { category: 'ai' })[0]?.id, 'llamafarm')
    assert.equal(searchModules(REGISTRY.modules, { category: 'finance', query: 'llm' }).length, 0)
    assert.equal(searchModules(REGISTRY.modules, {}).length, 2)
  })
})

describe('fetchRegistry', () => {
  it('fetches and validates the live registry', async () => {
    const fetchImpl: FetchLike = (async (url: string | URL) => {
      assert.ok(String(url).startsWith('https://'))
      return new Response(JSON.stringify(REGISTRY), { status: 200 })
    }) as FetchLike
    const registry = await fetchRegistry({ fetchImpl })
    assert.equal(registry.modules.length, 2)
  })

  it('throws on HTTP errors and invalid documents', async () => {
    const notFound: FetchLike = (async () => new Response('nope', { status: 404 })) as FetchLike
    await assert.rejects(fetchRegistry({ fetchImpl: notFound }), /HTTP 404/)
    const badJson: FetchLike = (async () => new Response('{', { status: 200 })) as FetchLike
    await assert.rejects(fetchRegistry({ fetchImpl: badJson }))
  })
})

describe('shipped registry.json', () => {
  it('is valid and lists the family modules', async () => {
    const raw = JSON.parse(await readFile(new URL('../registry.json', import.meta.url), 'utf8'))
    const registry = parseRegistry(raw)
    const ids = registry.modules.map((m) => m.id)
    assert.ok(ids.includes('crypto-watch'))
    assert.ok(ids.includes('gmail-announcer'))
    assert.ok(ids.includes('resource-monitor'))
    assert.ok(ids.includes('llamafarm'))
    assert.equal(registry.modules.find((m) => m.id === 'llamafarm')?.builtIn, true)
  })
})
