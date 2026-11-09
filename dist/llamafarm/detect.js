/**
 * Machine profile detection for the Model Farm feature: RAM, cores, GPUs
 * (Windows, via CIM) and the local Ollama install. Never throws — partial
 * profiles are more useful than none.
 */
import { execFile } from 'node:child_process';
import os from 'node:os';
const GPU_SCRIPT = 'Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json -Compress';
async function detectGpus(execFileImpl, timeoutMs) {
    if (os.platform() !== 'win32')
        return [];
    const stdout = await new Promise((resolve) => {
        execFileImpl('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', GPU_SCRIPT], { timeout: timeoutMs, windowsHide: true }, (error, out) => resolve(error ? null : out));
    });
    if (!stdout)
        return [];
    try {
        const parsed = JSON.parse(stdout);
        const rows = (Array.isArray(parsed) ? parsed : [parsed]);
        return rows
            .map((row) => ({ name: String(row.Name ?? 'Unknown GPU'), vramBytes: Number(row.AdapterRAM ?? 0) }))
            .filter((gpu) => gpu.vramBytes > 0);
    }
    catch {
        return [];
    }
}
async function detectOllama(fetchImpl, url, timeoutMs) {
    const absent = { installed: false, url, models: [], error: null };
    try {
        const response = await fetchImpl(`${url}/api/tags`, { signal: AbortSignal.timeout(timeoutMs) });
        if (!response.ok)
            return { ...absent, error: `HTTP ${response.status}` };
        const body = (await response.json());
        const models = (body.models ?? []).map((row) => ({
            name: String(row.name ?? 'unknown'),
            sizeBytes: Number(row.size ?? 0),
            modifiedAt: typeof row.modified_at === 'string' ? row.modified_at : null
        }));
        return { installed: true, url, models, error: null };
    }
    catch (cause) {
        return { ...absent, error: cause instanceof Error ? cause.message : String(cause) };
    }
}
/** Best-effort snapshot of the machine; every field degrades gracefully. */
export async function detectMachine(options = {}) {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const execFileImpl = options.execFileImpl ?? execFile;
    const timeoutMs = options.timeoutMs ?? 1500;
    const [gpus, ollama] = await Promise.all([
        detectGpus(execFileImpl, Math.max(timeoutMs, 5000)),
        detectOllama(fetchImpl, options.ollamaUrl ?? 'http://127.0.0.1:11434', timeoutMs)
    ]);
    return {
        totalRamBytes: os.totalmem(),
        availableRamBytes: os.freemem(),
        cores: os.cpus().length,
        gpus,
        ollama,
        detectedAt: Date.now()
    };
}
//# sourceMappingURL=detect.js.map