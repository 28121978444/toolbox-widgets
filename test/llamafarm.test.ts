import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  detectMachine,
  fetchCatalog,
  parseParamsBillions,
  parseQuantLabel,
  scoreModels,
  sortForDisplay,
  type CatalogModel,
  type ExecFileLike,
  type FetchLike,
  type MachineProfile,
  type ScoredModel
} from '../dist/index.js'

const GiB = 2 ** 30

function model(overrides: Partial<CatalogModel>): CatalogModel {
  return {
    id: 'test/model',
    task: 'text-generation',
    label: 'model',
    author: 'test',
    formats: ['gguf'],
    paramsBillions: 7,
    quantLabel: 'Q4_K_M',
    fileBytes: 5 * GiB,
    runtimeRamBytes: Math.round(5 * GiB * 1.25),
    downloads: 1000,
    likes: 10,
    license: 'apache-2.0',
    tags: ['gguf'],
    hfUrl: 'https://huggingface.co/test/model',
    ...overrides
  }
}

function machine(overrides: Partial<MachineProfile> = {}): MachineProfile {
  return {
    totalRamBytes: 32 * GiB,
    availableRamBytes: 10 * GiB,
    cores: 8,
    gpus: [],
    ollama: { installed: false, url: 'http://127.0.0.1:11434', models: [], error: null },
    detectedAt: Date.now(),
    ...overrides
  }
}

describe('parseParamsBillions', () => {
  it('parses common parameter notations', () => {
    assert.equal(parseParamsBillions('Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf'), 7)
    assert.equal(parseParamsBillions('Llama-3.2-1.5B-Instruct.gguf'), 1.5)
    assert.equal(parseParamsBillions('mixtral-8x7b-q4.gguf'), 7)
    assert.equal(parseParamsBillions('model-72B-q8_0.gguf'), 72)
  })

  it('returns null when no parameter count is present', () => {
    assert.equal(parseParamsBillions('phi-4-Q4_K_M.gguf'), null)
    assert.equal(parseParamsBillions('README.md'), null)
  })
})

describe('parseQuantLabel', () => {
  it('parses k-quants and legacy quants', () => {
    assert.equal(parseQuantLabel('qwen2.5-coder-7b-q4_k_m.gguf'), 'Q4_K_M')
    assert.equal(parseQuantLabel('model-Q8_0.gguf'), 'Q8_0')
    assert.equal(parseQuantLabel('model-F16.gguf'), 'F16')
  })

  it('returns null without a quant label', () => {
    assert.equal(parseQuantLabel('model.safetensors'), null)
    assert.equal(parseQuantLabel('model.gguf'), null)
  })
})

describe('scoreModels', () => {
  const available = 10 * GiB
  const thresholdBudget = available * 0.93 // 9.3 GiB

  it('marks models inside the 0.93 now-budget green in now scenario', () => {
    const fits = model({ runtimeRamBytes: Math.round(thresholdBudget) })
    const [scored] = scoreModels({ models: [fits], machine: machine(), scenario: 'now' })
    assert.equal(scored.verdict, 'green')
    assert.equal(scored.fitsNow, true)
    assert.equal(scored.fitsTotal, true)
    assert.equal(scored.reason, 'runs now')
  })

  it('marks models just over the budget yellow when they fit total', () => {
    const tight = model({ runtimeRamBytes: Math.round(thresholdBudget) + 64 * 1024 * 1024 })
    const [scored] = scoreModels({ models: [tight], machine: machine(), scenario: 'now' })
    assert.equal(scored.verdict, 'yellow')
    assert.equal(scored.fitsNow, false)
    assert.equal(scored.fitsTotal, true)
    assert.match(scored.reason, /needs \d+ GB freed/)
    assert.ok(scored.hints.some((hint) => hint.includes('close apps')))
  })

  it('marks models beyond total RAM red in both scenarios', () => {
    const huge = model({ runtimeRamBytes: 64 * GiB })
    const now = scoreModels({ models: [huge], machine: machine(), scenario: 'now' })[0]
    const total = scoreModels({ models: [huge], machine: machine(), scenario: 'total' })[0]
    assert.equal(now.verdict, 'red')
    assert.equal(total.verdict, 'red')
    assert.equal(now.reason, 'exceeds total RAM')
  })

  it('in total scenario everything up to total RAM is green', () => {
    const big = model({ runtimeRamBytes: 20 * GiB })
    const [scored] = scoreModels({ models: [big], machine: machine(), scenario: 'total' })
    assert.equal(scored.verdict, 'green')
    assert.equal(scored.reason, 'fits this machine')
  })

  it('suggests --n-gpu-layers for red models when a GPU is present', () => {
    const huge = model({ runtimeRamBytes: 64 * GiB, fileBytes: 50 * GiB })
    const withGpu = machine({ gpus: [{ name: 'RTX 4070', vramBytes: 12 * GiB }] })
    const [scored] = scoreModels({ models: [huge], machine: withGpu, scenario: 'now' })
    const hint = scored.hints.find((entry) => entry.includes('--n-gpu-layers'))
    assert.ok(hint)
    // 12 GiB * 0.9 / (50 GiB / 32 layers) = 6 layers
    assert.ok(hint?.includes('--n-gpu-layers 6'))
  })

  it('omits the gpu hint when no GPU or no achievable layer split', () => {
    const huge = model({ runtimeRamBytes: 64 * GiB, fileBytes: 50 * GiB })
    const noGpu = scoreModels({ models: [huge], machine: machine(), scenario: 'now' })[0]
    assert.ok(!noGpu.hints.some((entry) => entry.includes('--n-gpu-layers')))

    const tinyGpu = machine({ gpus: [{ name: 'iGPU', vramBytes: 256 * 1024 * 1024 }] })
    const smallGpu = scoreModels({ models: [huge], machine: tinyGpu, scenario: 'now' })[0]
    assert.ok(!smallGpu.hints.some((entry) => entry.includes('--n-gpu-layers')))
  })

  it('mentions Ollama for gguf models when Ollama is installed', () => {
    const withOllama = machine({
      ollama: { installed: true, url: 'http://127.0.0.1:11434', models: [], error: null }
    })
    const [scored] = scoreModels({ models: [model({})], machine: withOllama, scenario: 'now' })
    assert.ok(scored.hints.some((entry) => entry.toLowerCase().includes('ollama')))
  })

  it('respects a custom now threshold', () => {
    const half = model({ runtimeRamBytes: 6 * GiB })
    const [scored] = scoreModels({ models: [half], machine: machine(), scenario: 'now', nowThreshold: 0.5 })
    assert.equal(scored.verdict, 'yellow')
  })
})

describe('sortForDisplay', () => {
  it('orders green, yellow, red then by ascending footprint without mutating input', () => {
    const red = { ...model({ runtimeRamBytes: 1 * GiB }), verdict: 'red' } as ScoredModel
    const greenBig = { ...model({ runtimeRamBytes: 8 * GiB }), verdict: 'green' } as ScoredModel
    const greenSmall = { ...model({ runtimeRamBytes: 2 * GiB }), verdict: 'green' } as ScoredModel
    const yellow = { ...model({ runtimeRamBytes: 3 * GiB }), verdict: 'yellow' } as ScoredModel
    const input = [red, greenBig, yellow, greenSmall]
    const sorted = sortForDisplay(input)
    assert.deepEqual(
      sorted.map((entry) => entry.verdict),
      ['green', 'green', 'yellow', 'red']
    )
    assert.equal(sorted[0]?.runtimeRamBytes, 2 * GiB)
    assert.equal(input[0]?.verdict, 'red')
  })
})

describe('detectMachine', () => {
  const failingFetch: FetchLike = (async () => {
    throw new Error('connect ECONNREFUSED')
  }) as FetchLike

  it('never throws and reports RAM even when everything fails', async () => {
    const execFile: ExecFileLike = (_file, _args, _opts, cb) => cb(new Error('nope'), '')
    const profile = await detectMachine({ fetchImpl: failingFetch, execFileImpl: execFile })
    assert.ok(profile.totalRamBytes > 0)
    assert.ok(profile.availableRamBytes > 0)
    assert.ok(profile.cores > 0)
    assert.deepEqual(profile.gpus, [])
    assert.equal(profile.ollama.installed, false)
    assert.ok(profile.ollama.error)
  })

  it('parses single and multiple GPU entries', async () => {
    const single: ExecFileLike = (_file, _args, _opts, cb) =>
      cb(null, JSON.stringify({ Name: 'RTX 4070', AdapterRAM: 12884901888 }))
    const multi: ExecFileLike = (_file, _args, _opts, cb) =>
      cb(
        null,
        JSON.stringify([
          { Name: 'RTX 4070', AdapterRAM: 12884901888 },
          { Name: 'iGPU', AdapterRAM: 1073741824 }
        ])
      )
    const singleProfile = await detectMachine({ fetchImpl: failingFetch, execFileImpl: single })
    const multiProfile = await detectMachine({ fetchImpl: failingFetch, execFileImpl: multi })
    // Non-Windows platforms skip the GPU probe entirely.
    if (process.platform === 'win32') {
      assert.equal(singleProfile.gpus.length, 1)
      assert.equal(singleProfile.gpus[0]?.vramBytes, 12884901888)
      assert.equal(multiProfile.gpus.length, 2)
    } else {
      assert.deepEqual(singleProfile.gpus, [])
      assert.deepEqual(multiProfile.gpus, [])
    }
  })

  it('detects installed Ollama models', async () => {
    const ollamaFetch: FetchLike = (async (url: string | URL) => {
      assert.ok(String(url).endsWith('/api/tags'))
      return new Response(
        JSON.stringify({ models: [{ name: 'qwen2.5-coder:7b', size: 4683078144, modified_at: '2026-11-01T00:00:00Z' }] }),
        { status: 200 }
      )
    }) as FetchLike
    const execFile: ExecFileLike = (_file, _args, _opts, cb) => cb(new Error('nope'), '')
    const profile = await detectMachine({ fetchImpl: ollamaFetch, execFileImpl: execFile })
    assert.equal(profile.ollama.installed, true)
    assert.equal(profile.ollama.models[0]?.name, 'qwen2.5-coder:7b')
    assert.equal(profile.ollama.models[0]?.sizeBytes, 4683078144)
  })

  it('prefers registry VRAM (64-bit) over the uint32 CIM cap', async () => {
    let cimCalled = false
    const execFile: ExecFileLike = (_file, args, _opts, cb) => {
      if (args.some((arg) => arg.includes('Get-ItemProperty'))) {
        cb(null, JSON.stringify({ Name: 'RTX 4060 Ti', AdapterRAM: 8585740288 }))
      } else {
        cimCalled = true
        cb(null, JSON.stringify({ Name: 'RTX 4060 Ti', AdapterRAM: 4293918720 }))
      }
    }
    const profile = await detectMachine({ fetchImpl: failingFetch, execFileImpl: execFile })
    if (process.platform === 'win32') {
      assert.equal(profile.gpus[0]?.vramBytes, 8585740288)
      assert.equal(cimCalled, false)
    }
  })

  it('falls back to CIM when the registry probe fails', async () => {
    const execFile: ExecFileLike = (_file, args, _opts, cb) => {
      if (args.some((arg) => arg.includes('Get-ItemProperty'))) {
        cb(new Error('registry denied'), '')
      } else {
        cb(null, JSON.stringify({ Name: 'RTX 4070', AdapterRAM: 4293918720 }))
      }
    }
    const profile = await detectMachine({ fetchImpl: failingFetch, execFileImpl: execFile })
    if (process.platform === 'win32') {
      assert.equal(profile.gpus[0]?.vramBytes, 4293918720)
    }
  })
})

describe('fetchCatalog', () => {
  function hfFetch(routes: Record<string, unknown>): FetchLike {
    return (async (url: string | URL) => {
      const path = String(url).replace('https://huggingface.co', '')
      const body = routes[path]
      if (body === undefined) return new Response('not found', { status: 404 })
      return new Response(JSON.stringify(body), { status: 200 })
    }) as FetchLike
  }

  const LIST_TEXT = [
    {
      id: 'Qwen/Qwen2.5-Coder-7B-Instruct-GGUF',
      pipeline_tag: 'text-generation',
      tags: ['gguf', 'license:apache-2.0'],
      downloads: 9000,
      likes: 500
    },
    {
      id: 'openai-community/gpt2',
      pipeline_tag: 'text-generation',
      tags: ['safetensors', 'license:mit'],
      downloads: 31775505,
      likes: 3919
    },
    {
      id: 'Someone/No-Weights',
      pipeline_tag: 'text-generation',
      tags: ['transformers'],
      downloads: 5,
      likes: 0
    }
  ]

  const DETAIL_QWEN = {
    siblings: [
      { rfilename: 'README.md', size: 5670 },
      {
        rfilename: 'qwen2.5-coder-7b-instruct-q2_k.gguf',
        size: 3015940032,
        lfs: { size: 3015940032 }
      },
      {
        rfilename: 'qwen2.5-coder-7b-instruct-q4_k_m.gguf',
        size: 4683078144,
        lfs: { size: 4683078144 }
      }
    ],
    cardData: { license: 'apache-2.0' }
  }

  const DETAIL_GPT2 = {
    siblings: [
      { rfilename: 'model-00001-of-00002.safetensors', size: 2 * GiB, lfs: { size: 2 * GiB } },
      { rfilename: 'model-00002-of-00002.safetensors', size: GiB, lfs: { size: GiB } }
    ],
    cardData: { license: 'mit' }
  }

  it('maps gguf and safetensors models with real file sizes', async () => {
    const fetchImpl = hfFetch({
      '/api/models?pipeline_tag=text-generation&sort=downloads&direction=-1&limit=24': LIST_TEXT,
      '/api/models/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF?blobs=true': DETAIL_QWEN,
      '/api/models/openai-community/gpt2?blobs=true': DETAIL_GPT2
    })
    const catalog = await fetchCatalog({ tasks: ['text-generation'], fetchImpl })
    assert.equal(catalog.length, 2)

    const qwen = catalog.find((entry) => entry.id.includes('Qwen'))
    assert.ok(qwen)
    assert.deepEqual(qwen?.formats, ['gguf'])
    assert.equal(qwen?.fileBytes, 4683078144) // largest gguf wins
    assert.equal(qwen?.quantLabel, 'Q4_K_M')
    assert.equal(qwen?.paramsBillions, 7)
    assert.equal(qwen?.license, 'apache-2.0')
    assert.equal(qwen?.label, 'Qwen2.5-Coder-7B-Instruct')
    assert.equal(qwen?.runtimeRamBytes, Math.round(4683078144 * 1.25))

    const gpt2 = catalog.find((entry) => entry.id.includes('gpt2'))
    assert.ok(gpt2)
    assert.deepEqual(gpt2?.formats, ['safetensors'])
    assert.equal(gpt2?.fileBytes, 3 * GiB) // sharded safetensors summed
    assert.equal(gpt2?.quantLabel, null)
    assert.equal(gpt2?.license, 'mit')
  })

  it('wave 1: with gguf-only formats only gguf repos survive', async () => {
    const fetchImpl = hfFetch({
      '/api/models?pipeline_tag=text-generation&sort=downloads&direction=-1&limit=24': LIST_TEXT,
      '/api/models/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF?blobs=true': DETAIL_QWEN
    })
    const catalog = await fetchCatalog({ tasks: ['text-generation'], formats: ['gguf'], fetchImpl })
    assert.equal(catalog.length, 1)
    assert.ok(catalog[0]?.id.includes('Qwen'))
  })

  it('skips a failed task but throws when every task fails', async () => {
    const oneTaskDown = hfFetch({
      '/api/models?pipeline_tag=text-generation&sort=downloads&direction=-1&limit=24': LIST_TEXT,
      '/api/models/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF?blobs=true': DETAIL_QWEN
      // text-to-image list route missing -> 404
    })
    const partial = await fetchCatalog({
      tasks: ['text-generation', 'text-to-image'],
      formats: ['gguf'],
      fetchImpl: oneTaskDown
    })
    assert.equal(partial.length, 1)

    const allDown = hfFetch({})
    await assert.rejects(
      fetchCatalog({ tasks: ['text-generation'], formats: ['gguf'], fetchImpl: allDown }),
      /failed for all tasks/i
    )
  })

  it('falls back to gguf.total for parameter count', async () => {
    const fetchImpl = hfFetch({
      '/api/models?pipeline_tag=text-generation&sort=downloads&direction=-1&limit=24': [
        { id: 'unquantized/phi-4-gguf', pipeline_tag: 'text-generation', tags: ['gguf'], downloads: 10, likes: 1 }
      ],
      '/api/models/unquantized/phi-4-gguf?blobs=true': {
        siblings: [{ rfilename: 'phi-4-q4_k_m.gguf', size: 2 * GiB, lfs: { size: 2 * GiB } }],
        gguf: { total: 14700000000 }
      }
    })
    const catalog = await fetchCatalog({ tasks: ['text-generation'], formats: ['gguf'], fetchImpl })
    assert.equal(catalog[0]?.paramsBillions, 14.7)
  })

  it('drops repos whose weights are too small to be a real model', async () => {
    const fetchImpl = hfFetch({
      '/api/models?pipeline_tag=text-to-speech&sort=downloads&direction=-1&limit=24': [
        { id: 'tiny/config-only', pipeline_tag: 'text-to-speech', tags: ['safetensors'], downloads: 99, likes: 9 }
      ],
      '/api/models/tiny/config-only?blobs=true': {
        siblings: [{ rfilename: 'adapter.safetensors', size: 10 * 1024 * 1024 }]
      }
    })
    const catalog = await fetchCatalog({ tasks: ['text-to-speech'], formats: ['safetensors'], fetchImpl })
    assert.equal(catalog.length, 0)
  })
})
