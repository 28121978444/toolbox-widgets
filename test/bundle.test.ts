import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  parseBundle,
  parseBundleJson,
  serializeBundle,
  validateResourceSettings,
  createResourceMonitor
} from '../dist/index.js'

describe('serializeBundle / parseBundle round-trip', () => {
  it('preserves all three widgets', () => {
    const json = serializeBundle([
      { widget: 'crypto-watch', settings: { watchlist: ['bitcoin', 'ethereum'] } },
      {
        widget: 'gmail-announcer',
        settings: { email: 'me@example.com', notifications: false },
        credentialsRef: 'gmail/app-password'
      },
      { widget: 'resource-monitor', settings: { diskPath: 'C:\\', showProcesses: true } }
    ])

    const bundle = parseBundleJson(json)
    assert.equal(bundle.format, 'toolbox-widgets')
    assert.equal(bundle.formatVersion, 1)
    assert.equal(bundle.widgets.length, 3)
    assert.deepEqual(bundle.widgets[0].settings, { watchlist: ['bitcoin', 'ethereum'] })
    assert.equal(bundle.widgets[1].credentialsRef, 'gmail/app-password')
  })

  it('normalizes settings during export', () => {
    const json = serializeBundle([
      { widget: 'crypto-watch', settings: { watchlist: [' Bitcoin '] } }
    ])
    const bundle = parseBundleJson(json)
    assert.deepEqual(bundle.widgets[0].settings, { watchlist: ['bitcoin'] })
  })
})

describe('parseBundle rejection', () => {
  it('rejects a foreign format', () => {
    assert.throws(() => parseBundle({ format: 'other', widgets: [] }), /not a Toolbox widget bundle/i)
  })

  it('rejects an unknown version', () => {
    assert.throws(
      () => parseBundle({ format: 'toolbox-widgets', formatVersion: 99, widgets: [] }),
      /Unsupported bundle version/i
    )
  })

  it('rejects unknown widgets', () => {
    assert.throws(
      () => parseBundle({ format: 'toolbox-widgets', formatVersion: 1, widgets: [{ widget: 'nope' }] }),
      /Unknown widget/i
    )
  })

  it('rejects invalid widget settings', () => {
    assert.throws(
      () =>
        parseBundle({
          format: 'toolbox-widgets',
          formatVersion: 1,
          widgets: [{ widget: 'crypto-watch', settings: { watchlist: [] } }]
        }),
      /at least one coin/i
    )
  })

  it('rejects a credentialsRef on widgets that have no credentials', () => {
    assert.throws(
      () =>
        parseBundle({
          format: 'toolbox-widgets',
          formatVersion: 1,
          widgets: [{ widget: 'crypto-watch', settings: { watchlist: ['bitcoin'] }, credentialsRef: 'x' }]
        }),
      /cannot carry a credentialsRef/i
    )
  })

  it('rejects invalid JSON text', () => {
    assert.throws(() => parseBundleJson('{nope'), /not valid JSON/i)
  })
})

describe('validateResourceSettings', () => {
  it('accepts empty settings', () => {
    assert.deepEqual(validateResourceSettings({}), {})
  })

  it('accepts diskPath and showProcesses', () => {
    assert.deepEqual(validateResourceSettings({ diskPath: '/', showProcesses: false }), {
      diskPath: '/',
      showProcesses: false
    })
  })

  it('rejects a non-string diskPath', () => {
    assert.throws(() => validateResourceSettings({ diskPath: 42 }), /non-empty string/i)
  })
})

describe('resource monitor', () => {
  it('returns real system stats', async () => {
    const monitor = createResourceMonitor()
    const stats = await monitor.getStats()
    assert.ok(stats.cores > 0)
    assert.ok(stats.memTotal > 0)
    assert.ok(typeof stats.cpuPercent === 'number')
    assert.ok(stats.hostname.length > 0)
  })

  it('returns a process list array (empty off-Windows)', async () => {
    const monitor = createResourceMonitor()
    const processes = await monitor.getTopProcesses()
    assert.ok(Array.isArray(processes))
  })
})
