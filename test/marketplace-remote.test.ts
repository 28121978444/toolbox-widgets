import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseRegistry, validateRemoteEndpoint } from '../dist/index.js'

describe('validateRemoteEndpoint', () => {
  it('accepts public HTTPS endpoints', () => {
    assert.equal(validateRemoteEndpoint('https://liquidvision.app/mcp'), 'https://liquidvision.app/mcp')
    assert.equal(validateRemoteEndpoint('https://mcp.cve.now/mcp'), 'https://mcp.cve.now/mcp')
  })

  it('rejects non-HTTPS, credentials and malformed URLs', () => {
    assert.throws(() => validateRemoteEndpoint('http://example.com/mcp'), /HTTPS/)
    assert.throws(() => validateRemoteEndpoint('https://user:pass@example.com/mcp'), /credentials/)
    assert.throws(() => validateRemoteEndpoint('not a url'), /not a valid URL/)
    assert.throws(() => validateRemoteEndpoint(''), /endpoint URL/)
  })

  it('rejects loopback, private and intranet hosts', () => {
    for (const host of [
      'https://localhost/mcp',
      'https://127.0.0.1/mcp',
      'https://10.0.0.5/mcp',
      'https://192.168.1.10/mcp',
      'https://172.16.0.1/mcp',
      'https://169.254.169.254/mcp',
      'https://[::1]/mcp',
      'https://nas.local/mcp',
      'https://server.internal/mcp',
      'https://intranet/mcp'
    ]) {
      assert.throws(() => validateRemoteEndpoint(host), /public hosts|private or loopback/)
    }
  })
})

describe('remote-server registry modules', () => {
  const base = {
    format: 'toolbox-marketplace',
    formatVersion: 1,
    updated: '2026-11-10T00:00:00.000Z',
    modules: [
      {
        id: 'pilot',
        type: 'remote-server',
        name: 'Pilot',
        description: 'Remote tools',
        version: '1.0.0',
        author: 'Someone',
        endpoint: 'https://example.com/mcp'
      }
    ]
  }

  it('parses a remote-server module and keeps the endpoint', () => {
    const registry = parseRegistry(base)
    assert.equal(registry.modules[0]?.type, 'remote-server')
    assert.equal(registry.modules[0]?.endpoint, 'https://example.com/mcp')
  })

  it('rejects remote-server modules without a safe endpoint', () => {
    assert.throws(
      () => parseRegistry({ ...base, modules: [{ ...base.modules[0], endpoint: undefined }] }),
      /endpoint URL/
    )
    assert.throws(
      () => parseRegistry({ ...base, modules: [{ ...base.modules[0], endpoint: 'https://127.0.0.1/mcp' }] }),
      /private or loopback/
    )
  })
})
