/**
 * Ollama helpers for the Model Farm.
 *
 * Ollama can serve any GGUF straight from the Hugging Face Hub:
 *   ollama run hf.co/{owner}/{repo}:{quant}
 * These helpers turn a catalog entry into that reference, probe the local
 * runtime and pull the weights in.
 */
import { spawn } from 'node:child_process'
import type { ExecFileLike } from './detect.js'
import type { CatalogModel } from './types.js'

/** Ollama accepts both hosts; the short one is what its own docs use. */
export const OLLAMA_HF_HOST = 'hf.co'
const OLLAMA_HF_HOST_ALIASES = ['hf.co', 'huggingface.co']
const TAG_PATTERN = /^[A-Za-z0-9_.-]{2,32}$/

export interface OllamaInstallPlan {
  /** What `ollama pull` and `ollama run` accept, e.g. 'hf.co/owner/repo:Q4_K_M'. */
  reference: string
  /** Short local name for the pulled model, e.g. 'qwen2-5-coder-7b-instruct'. */
  modelName: string
  /** Arguments for `ollama pull`. */
  pullArgs: string[]
  /** Arguments for `ollama run`. */
  runArgs: string[]
  /** Ordered instructions for the user. */
  steps: string[]
}

/** Strip a HuggingFace URL down to 'owner/repo'. */
export function normalizeRepoId(repoId: string): string {
  return repoId
    .trim()
    .replace(/^https?:\/\/[^/]+\//i, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

/** Build the Ollama reference for a HuggingFace repo, optionally with a quant tag. */
export function ollamaReference(repoId: string, quantLabel?: string | null): string {
  const id = normalizeRepoId(repoId)
  const tag = quantLabel && TAG_PATTERN.test(quantLabel.trim()) ? quantLabel.trim() : ''
  return tag ? `${OLLAMA_HF_HOST}/${id}:${tag}` : `${OLLAMA_HF_HOST}/${id}`
}

/** A safe local Ollama model name derived from the catalog label. */
export function ollamaModelName(label: string): string {
  const cleaned = label
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'model'
}

/**
 * Plan the Ollama import for a catalog entry. GGUF only — safetensors
 * checkpoints need a conversion step Ollama cannot do.
 */
export function planOllamaInstall(model: CatalogModel, quantLabel?: string | null): OllamaInstallPlan {
  if (!model.formats.includes('gguf')) {
    throw new Error(`"${model.label}" is not published as GGUF, so Ollama cannot import it directly.`)
  }
  const reference = ollamaReference(model.id, quantLabel ?? model.quantLabel)
  const modelName = ollamaModelName(model.label)
  return {
    reference,
    modelName,
    pullArgs: ['pull', reference],
    runArgs: ['run', reference],
    steps: [
      `ollama pull ${reference}`,
      `ollama run ${reference}`
    ]
  }
}

/** Build a Modelfile that pins the reference and the GPU offload split. */
export function buildModelfile(reference: string, options: { numGpu?: number; systemPrompt?: string } = {}): string {
  const lines = [`FROM ${reference}`]
  if (options.systemPrompt) lines.push(`SYSTEM """${options.systemPrompt}"""`)
  if (typeof options.numGpu === 'number' && Number.isFinite(options.numGpu)) {
    lines.push(`PARAMETER num_gpu ${Math.max(0, Math.floor(options.numGpu))}`)
  }
  return `${lines.join('\n')}\n`
}

export interface OllamaCliInfo {
  installed: boolean
  version: string | null
  error: string | null
}

/** Probe the `ollama` binary; never throws. */
export async function probeOllamaCli(execFileImpl: ExecFileLike): Promise<OllamaCliInfo> {
  const stdout = await new Promise<string | null>((resolve) => {
    try {
      execFileImpl('ollama', ['--version'], { timeout: 5000, windowsHide: true }, (error, out) =>
        resolve(error ? null : out)
      )
    } catch {
      resolve(null)
    }
  })
  if (stdout === null) return { installed: false, version: null, error: 'ollama command not found' }
  const match = /(\d+\.\d+\.\d+)/.exec(stdout)
  return { installed: true, version: match ? match[1] : stdout.trim() || null, error: null }
}

export interface SpawnedProcess {
  stdout: { on(event: 'data', listener: (chunk: Buffer | string) => void): void } | null
  stderr: { on(event: 'data', listener: (chunk: Buffer | string) => void): void } | null
  on(event: 'error', listener: (error: Error) => void): void
  on(event: 'close', listener: (code: number | null) => void): void
}

export type SpawnLike = (file: string, args: string[]) => SpawnedProcess

const defaultSpawn: SpawnLike = (file, args) =>
  spawn(file, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }) as unknown as SpawnedProcess

export interface PullResult {
  ok: boolean
  code: number | null
  /** Everything the runtime printed (progress bars live on stderr). */
  output: string
  error: string | null
}

/** Pull a reference into the local Ollama runtime, streaming progress. */
export function pullIntoOllama(
  reference: string,
  options: { spawnImpl?: SpawnLike; onOutput?: (chunk: string) => void } = {}
): Promise<PullResult> {
  const spawnImpl = options.spawnImpl ?? defaultSpawn
  return new Promise<PullResult>((resolve) => {
    let output = ''
    let settled = false
    const finish = (result: PullResult): void => {
      if (settled) return
      settled = true
      resolve(result)
    }
    let child: SpawnedProcess
    try {
      child = spawnImpl('ollama', ['pull', reference])
    } catch (cause) {
      finish({ ok: false, code: null, output: '', error: cause instanceof Error ? cause.message : String(cause) })
      return
    }
    const collect = (chunk: Buffer | string): void => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      output += text
      options.onOutput?.(text)
    }
    child.stdout?.on('data', collect)
    child.stderr?.on('data', collect)
    child.on('error', (error) => finish({ ok: false, code: null, output, error: error.message }))
    child.on('close', (code) =>
      finish({ ok: code === 0, code, output, error: code === 0 ? null : `ollama pull exited with code ${code}` })
    )
  })
}
