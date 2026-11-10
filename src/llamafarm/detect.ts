/**
 * Machine profile detection for the Model Farm feature: RAM, cores, GPUs
 * (Windows, via CIM) and the local Ollama install. Never throws — partial
 * profiles are more useful than none.
 */
import { execFile } from 'node:child_process'
import os from 'node:os'
import type { FetchLike } from '../widgets/crypto-watch.js'
import type { GpuInfo, InstalledModel, MachineProfile, OllamaInfo } from './types.js'

export type ExecFileLike = (
  file: string,
  args: string[],
  options: { timeout: number; windowsHide: boolean },
  cb: (error: Error | null, stdout: string) => void
) => void

export interface DetectOptions {
  fetchImpl?: FetchLike
  ollamaUrl?: string
  execFileImpl?: ExecFileLike
  timeoutMs?: number
}

const GPU_CIM_SCRIPT =
  'Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json -Compress'

// CIM's AdapterRAM is uint32 and caps at 4 GiB; the display-class registry
// key carries the true 64-bit size. Prefer it, fall back to CIM.
const GPU_REGISTRY_SCRIPT =
  "Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0*' -ErrorAction SilentlyContinue | Where-Object { $_.'HardwareInformation.qwMemorySize' } | Select-Object @{n='Name';e={$_.DriverDesc}},@{n='AdapterRAM';e={$_.'HardwareInformation.qwMemorySize'}} | ConvertTo-Json -Compress"

async function probeGpus(execFileImpl: ExecFileLike, script: string, timeoutMs: number): Promise<GpuInfo[]> {
  const stdout = await new Promise<string | null>((resolve) => {
    execFileImpl(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: timeoutMs, windowsHide: true },
      (error, out) => resolve(error ? null : out)
    )
  })
  if (!stdout) return []
  try {
    const parsed: unknown = JSON.parse(stdout)
    const rows = (Array.isArray(parsed) ? parsed : [parsed]) as Array<Record<string, unknown>>
    return rows
      .map((row) => ({ name: String(row.Name ?? 'Unknown GPU'), vramBytes: Number(row.AdapterRAM ?? 0) }))
      .filter((gpu) => gpu.vramBytes > 0)
  } catch {
    return []
  }
}

async function detectGpus(execFileImpl: ExecFileLike, timeoutMs: number): Promise<GpuInfo[]> {
  if (os.platform() !== 'win32') return []
  const fromRegistry = await probeGpus(execFileImpl, GPU_REGISTRY_SCRIPT, timeoutMs)
  if (fromRegistry.length > 0) return fromRegistry
  return probeGpus(execFileImpl, GPU_CIM_SCRIPT, timeoutMs)
}

async function detectOllama(fetchImpl: FetchLike, url: string, timeoutMs: number): Promise<OllamaInfo> {
  const absent: OllamaInfo = { installed: false, url, models: [], error: null }
  try {
    const response = await fetchImpl(`${url}/api/tags`, { signal: AbortSignal.timeout(timeoutMs) })
    if (!response.ok) return { ...absent, error: `HTTP ${response.status}` }
    const body = (await response.json()) as { models?: Array<Record<string, unknown>> }
    const models: InstalledModel[] = (body.models ?? []).map((row) => ({
      name: String(row.name ?? 'unknown'),
      sizeBytes: Number(row.size ?? 0),
      modifiedAt: typeof row.modified_at === 'string' ? row.modified_at : null
    }))
    return { installed: true, url, models, error: null }
  } catch (cause) {
    return { ...absent, error: cause instanceof Error ? cause.message : String(cause) }
  }
}

/** Best-effort snapshot of the machine; every field degrades gracefully. */
export async function detectMachine(options: DetectOptions = {}): Promise<MachineProfile> {
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as FetchLike)
  const execFileImpl = options.execFileImpl ?? (execFile as unknown as ExecFileLike)
  const timeoutMs = options.timeoutMs ?? 1500
  const [gpus, ollama] = await Promise.all([
    detectGpus(execFileImpl, Math.max(timeoutMs, 5000)),
    detectOllama(fetchImpl, options.ollamaUrl ?? 'http://127.0.0.1:11434', timeoutMs)
  ])
  return {
    totalRamBytes: os.totalmem(),
    availableRamBytes: os.freemem(),
    cores: os.cpus().length,
    gpus,
    ollama,
    detectedAt: Date.now()
  }
}
