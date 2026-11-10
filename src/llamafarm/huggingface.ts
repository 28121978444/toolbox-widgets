/**
 * HuggingFace catalog fetch for the Model Farm feature. Lists the top models
 * per pipeline task, then resolves per-model file sizes (GGUF/safetensors)
 * from the detail endpoint so fit scoring uses real bytes, not guesses.
 */
import type { FetchLike } from '../widgets/crypto-watch.js'
import { MODEL_TASKS, type CatalogModel, type ModelFormat, type ModelTask } from './types.js'

export interface FetchCatalogOptions {
  tasks?: ModelTask[]
  formats?: ModelFormat[]
  perTask?: number
  fetchImpl?: FetchLike
  baseUrl?: string
  timeoutMs?: number
}

const RUNTIME_OVERHEAD = 1.25
const DETAIL_CONCURRENCY = 6
/** Repos whose weights are smaller than this are configs/components, not models. */
const MIN_WEIGHTS_BYTES = 50 * 1024 * 1024

const QUANT_BITS: Array<[RegExp, number]> = [
  [/q2_k/i, 2.5],
  [/q3/i, 3.5],
  [/q4/i, 4.5],
  [/q5/i, 5.5],
  [/q6/i, 6.5],
  [/q7/i, 7.5],
  [/q8/i, 8.5],
  [/bf16/i, 16],
  [/fp16|f16/i, 16],
  [/f32|fp32/i, 32]
]

/** Parse a parameter count from a weights filename ('...-7B-...' -> 7, '1.5B' -> 1.5). */
export function parseParamsBillions(fileName: string): number | null {
  const match = /(\d+(?:\.\d+)?)\s*B\b/i.exec(fileName)
  return match ? Number(match[1]) : null
}

/** Parse a quantization label from a weights filename ('Q4_K_M', 'Q8_0', 'F16'). */
export function parseQuantLabel(fileName: string): string | null {
  const match = /\b(Q[2-8](?:_K_[A-Z0-9]+)?|Q8_0|BF16|FP16|F16|FP32|F32)\b/i.exec(fileName)
  return match ? match[1].toUpperCase() : null
}

function quantBits(quantLabel: string | null): number {
  if (!quantLabel) return 4.5
  for (const [pattern, bits] of QUANT_BITS) {
    if (pattern.test(quantLabel)) return bits
  }
  return 4.5
}

interface HfListItem {
  id: string
  pipeline_tag?: string
  tags?: string[]
  downloads?: number
  likes?: number
}

interface HfSibling {
  rfilename: string
  size?: number
  lfs?: { size?: number }
}

interface HfDetail {
  id?: string
  pipeline_tag?: string
  siblings?: HfSibling[]
  cardData?: { license?: unknown }
  gguf?: { total?: number }
  tags?: string[]
  downloads?: number
  likes?: number
}

function siblingBytes(sibling: HfSibling): number {
  return Number(sibling.lfs?.size ?? sibling.size ?? 0)
}

function encodeRepoId(id: string): string {
  // HF wants the author/name slash literal; only the segments get encoded.
  return id.split('/').map(encodeURIComponent).join('/')
}

function mapModel(
  task: ModelTask,
  item: HfListItem,
  detail: HfDetail,
  wanted: ReadonlySet<ModelFormat>
): CatalogModel | null {
  const siblings = detail.siblings ?? []
  const ggufFiles = siblings.filter((s) => s.rfilename.toLowerCase().endsWith('.gguf'))
  const safeFiles = siblings.filter((s) => s.rfilename.toLowerCase().endsWith('.safetensors'))

  const formats: ModelFormat[] = []
  if (ggufFiles.length > 0) formats.push('gguf')
  if (safeFiles.length > 0) formats.push('safetensors')
  if (!formats.some((format) => wanted.has(format))) return null

  const primary = ggufFiles.length > 0
  const chosen = primary ? ggufFiles.reduce((a, b) => (siblingBytes(a) >= siblingBytes(b) ? a : b)) : null
  const fileBytes = primary
    ? siblingBytes(chosen as HfSibling)
    : safeFiles.reduce((sum, s) => sum + siblingBytes(s), 0)
  if (fileBytes > 0 && fileBytes < MIN_WEIGHTS_BYTES) return null
  const quantLabel = chosen ? parseQuantLabel(chosen.rfilename) : null

  const paramsBillions =
    (chosen && parseParamsBillions(chosen.rfilename)) ??
    siblings.map((s) => parseParamsBillions(s.rfilename)).find((value) => value !== null) ??
    (typeof detail.gguf?.total === 'number' ? Math.round((detail.gguf.total / 1e9) * 100) / 100 : null)

  let runtimeRamBytes: number
  if (fileBytes > 0) {
    runtimeRamBytes = Math.round(fileBytes * RUNTIME_OVERHEAD)
  } else if (paramsBillions !== null) {
    runtimeRamBytes = Math.round(paramsBillions * 1e9 * (quantBits(quantLabel) / 8) * RUNTIME_OVERHEAD)
  } else {
    return null
  }

  const licenseTag = (item.tags ?? []).find((tag) => tag.startsWith('license:'))
  const license =
    typeof detail.cardData?.license === 'string'
      ? detail.cardData.license
      : licenseTag
        ? licenseTag.slice('license:'.length)
        : null

  const [author, name] = item.id.split('/')
  return {
    id: item.id,
    task,
    label: (name ?? item.id).replace(/-gguf$/i, ''),
    author: author ?? '',
    formats,
    paramsBillions,
    quantLabel,
    fileBytes: fileBytes > 0 ? fileBytes : null,
    runtimeRamBytes,
    downloads: Number(item.downloads ?? 0),
    likes: Number(item.likes ?? 0),
    license,
    tags: item.tags ?? [],
    hfUrl: `https://huggingface.co/${item.id}`
  }
}

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next++
      results[index] = await worker(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return results
}

/**
 * Fetch the catalog: top-downloaded models per task with real file sizes.
 * A task whose list request fails is skipped; if every task fails, throws.
 */
export async function fetchCatalog(options: FetchCatalogOptions = {}): Promise<CatalogModel[]> {
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as FetchLike)
  const baseUrl = (options.baseUrl ?? 'https://huggingface.co').replace(/\/+$/, '')
  const tasks = options.tasks ?? MODEL_TASKS.map((entry) => entry.task)
  const formats = options.formats ?? ['gguf', 'safetensors']
  const perTask = options.perTask ?? 24
  const timeoutMs = options.timeoutMs ?? 15000
  const wanted = new Set(formats)

  async function getJson(path: string): Promise<unknown> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'application/json' }
    })
    if (!response.ok) throw new Error(`HuggingFace returned HTTP ${response.status} for ${path}`)
    return response.json()
  }

  const listed = await Promise.allSettled(
    tasks.map(async (task) => {
      const list = (await getJson(
        `/api/models?pipeline_tag=${encodeURIComponent(task)}&sort=downloads&direction=-1&limit=${perTask}`
      )) as HfListItem[]
      return { task, items: Array.isArray(list) ? list : [] }
    })
  )

  const candidates: Array<{ task: ModelTask; item: HfListItem }> = []
  const failures: string[] = []
  for (const result of listed) {
    if (result.status === 'rejected') {
      failures.push(result.reason instanceof Error ? result.reason.message : String(result.reason))
      continue
    }
    for (const item of result.value.items) {
      const tags = item.tags ?? []
      const matches =
        (wanted.has('gguf') && tags.includes('gguf')) ||
        (wanted.has('safetensors') && (tags.includes('safetensors') || tags.includes('diffusers')))
      if (matches) candidates.push({ task: result.value.task, item })
    }
  }
  if (candidates.length === 0 && failures.length > 0) {
    throw new Error(`Model catalog fetch failed for all tasks: ${failures.join('; ')}`)
  }

  const mapped = await mapLimit(candidates, DETAIL_CONCURRENCY, async ({ task, item }) => {
    try {
      const detail = (await getJson(`/api/models/${encodeRepoId(item.id)}?blobs=true`)) as HfDetail
      return mapModel(task, item, detail, wanted)
    } catch {
      return null
    }
  })
  return mapped.filter((model): model is CatalogModel => model !== null)
}

/** Map a HuggingFace pipeline tag onto a Model Farm task, defaulting to text. */
export function resolveModelTask(pipelineTag?: string): ModelTask {
  const match = MODEL_TASKS.find((entry) => entry.task === pipelineTag)
  return match ? match.task : 'text-generation'
}

export interface FetchModelOptions {
  formats?: ModelFormat[]
  fetchImpl?: FetchLike
  baseUrl?: string
  timeoutMs?: number
}

/**
 * Fetch a single model by its HuggingFace repo id — used when the user names
 * a repo directly instead of picking one from the catalog.
 */
export async function fetchModelById(repoId: string, options: FetchModelOptions = {}): Promise<CatalogModel | null> {
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as FetchLike)
  const baseUrl = (options.baseUrl ?? 'https://huggingface.co').replace(/\/+$/, '')
  const timeoutMs = options.timeoutMs ?? 15000
  const wanted = new Set<ModelFormat>(options.formats ?? ['gguf', 'safetensors'])

  const response = await fetchImpl(`${baseUrl}/api/models/${encodeRepoId(repoId)}?blobs=true`, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: 'application/json' }
  })
  if (!response.ok) throw new Error(`HuggingFace returned HTTP ${response.status} for ${repoId}`)

  const detail = (await response.json()) as HfDetail
  const task = resolveModelTask(detail.pipeline_tag)
  const item: HfListItem = {
    id: detail.id ?? repoId,
    pipeline_tag: detail.pipeline_tag,
    tags: detail.tags ?? [],
    downloads: Number(detail.downloads ?? 0),
    likes: Number(detail.likes ?? 0)
  }
  return mapModel(task, item, detail, wanted)
}
