/**
 * Resource monitor widget core: CPU, memory and disk usage plus a top-process
 * list. Host-agnostic — works on the desktop, a NAS or an MCP server.
 */
import { execFile } from 'node:child_process'
import { statfs } from 'node:fs/promises'
import os from 'node:os'

export interface ResourceStats {
  cpuPercent: number
  memUsed: number
  memTotal: number
  diskFree: number
  diskTotal: number
  diskName: string
  uptime: number
  hostname: string
  platform: string
  cpuModel: string
  cores: number
}

export interface TopProcess {
  name: string
  pid: number
  cpu: number | null
  memMb: number
}

export interface ResourceMonitorOptions {
  /** Disk to report on, e.g. 'C:\\' on Windows or '/' on Linux. */
  diskPath?: string
  /** How many top processes to return (Windows only). Default 10. */
  topProcessCount?: number
}

export interface ResourceMonitorSettings {
  diskPath?: string
  showProcesses?: boolean
}

function totalTicks(times: os.CpuInfo['times']): number {
  return times.user + times.nice + times.sys + times.idle + times.irq
}

export function createResourceMonitor(options: ResourceMonitorOptions = {}) {
  let previous = os.cpus().map((cpu) => ({
    idle: cpu.times.idle,
    total: totalTicks(cpu.times)
  }))

  let processCache: { at: number; data: TopProcess[] } = { at: 0, data: [] }
  let previousProcesses: { at: number; cpuByPid: Map<number, number> } | null = null

  function sampleCpuPercent(): number {
    const current = os.cpus()
    let idleDelta = 0
    let totalDelta = 0

    current.forEach((cpu, index) => {
      const before = previous[index]
      if (!before) return
      const now = { idle: cpu.times.idle, total: totalTicks(cpu.times) }
      idleDelta += now.idle - before.idle
      totalDelta += now.total - before.total
    })

    previous = current.map((cpu) => ({ idle: cpu.times.idle, total: totalTicks(cpu.times) }))

    if (totalDelta <= 0) return 0
    const used = (1 - idleDelta / totalDelta) * 100
    return Math.min(100, Math.max(0, used))
  }

  async function getStats(): Promise<ResourceStats> {
    const diskPath =
      options.diskPath ?? (process.platform === 'win32' ? `${process.env.SystemDrive || 'C:'}\\` : '/')
    let diskTotal = 0
    let diskFree = 0

    try {
      const stats = await statfs(diskPath)
      diskTotal = stats.bsize * stats.blocks
      diskFree = stats.bsize * stats.bavail
    } catch {
      // Disk info is best-effort; other stats still render.
    }

    const totalMem = os.totalmem()

    return {
      cpuPercent: Math.round(sampleCpuPercent() * 10) / 10,
      memUsed: totalMem - os.freemem(),
      memTotal: totalMem,
      diskFree,
      diskTotal,
      diskName: diskPath,
      uptime: os.uptime(),
      hostname: os.hostname(),
      platform: `${os.platform()} ${os.release()}`,
      cpuModel: os.cpus()[0]?.model.trim() ?? 'Unknown CPU',
      cores: os.cpus().length
    }
  }

  const PROCESS_SCRIPT =
    'Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First {0} Name,Id,CPU,@{n=\'MemMB\';e={[math]::Round($_.WorkingSet64/1MB)}} | ConvertTo-Json -Compress'

  async function getTopProcesses(): Promise<TopProcess[]> {
    if (process.platform !== 'win32') return []
    if (Date.now() - processCache.at < 2000) return processCache.data

    try {
      const stdout = await new Promise<string>((resolve, reject) => {
        execFile(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            PROCESS_SCRIPT.replace('{0}', String(options.topProcessCount ?? 10))
          ],
          { timeout: 6000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
          (error, output) => (error ? reject(error) : resolve(output))
        )
      })

      const parsed: unknown = JSON.parse(stdout || '[]')
      const rows = (Array.isArray(parsed) ? parsed : [parsed]) as Array<Record<string, unknown>>

      const now = Date.now()
      const elapsedSeconds = previousProcesses ? (now - previousProcesses.at) / 1000 : 0
      const cores = os.cpus().length
      const cpuByPid = new Map<number, number>()

      const data: TopProcess[] = rows
        .map((row) => {
          const pid = Number(row.Id ?? 0)
          const totalCpu = typeof row.CPU === 'number' ? row.CPU : null
          if (totalCpu !== null) cpuByPid.set(pid, totalCpu)

          let cpuPercent: number | null = null
          if (totalCpu !== null && previousProcesses && elapsedSeconds > 0) {
            const before = previousProcesses.cpuByPid.get(pid)
            if (typeof before === 'number') {
              const delta = totalCpu - before
              if (delta >= 0) {
                cpuPercent = Math.round((delta / (elapsedSeconds * cores)) * 1000) / 10
              }
            }
          }

          return {
            name: String(row.Name ?? 'unknown'),
            pid,
            cpu: cpuPercent,
            memMb: Number(row.MemMB ?? 0)
          }
        })
        .filter((row) => row.pid > 0)

      previousProcesses = { at: now, cpuByPid }
      processCache = { at: now, data }
      return data
    } catch {
      return processCache.data
    }
  }

  return { getStats, getTopProcesses }
}

/** Validate portable settings for the bundle format. */
export function validateResourceSettings(value: unknown): ResourceMonitorSettings {
  if (!value || typeof value !== 'object') throw new Error('Resource monitor settings are missing.')
  const settings = value as { diskPath?: unknown; showProcesses?: unknown }
  const result: ResourceMonitorSettings = {}
  if (settings.diskPath !== undefined) {
    if (typeof settings.diskPath !== 'string' || settings.diskPath.length === 0) {
      throw new Error('The resource monitor disk path must be a non-empty string.')
    }
    result.diskPath = settings.diskPath
  }
  if (settings.showProcesses !== undefined) {
    if (typeof settings.showProcesses !== 'boolean') {
      throw new Error('The resource monitor showProcesses flag must be true or false.')
    }
    result.showProcesses = settings.showProcesses
  }
  return result
}
