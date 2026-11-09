import type { FetchLike } from '../widgets/crypto-watch.js';
import type { MachineProfile } from './types.js';
export type ExecFileLike = (file: string, args: string[], options: {
    timeout: number;
    windowsHide: boolean;
}, cb: (error: Error | null, stdout: string) => void) => void;
export interface DetectOptions {
    fetchImpl?: FetchLike;
    ollamaUrl?: string;
    execFileImpl?: ExecFileLike;
    timeoutMs?: number;
}
/** Best-effort snapshot of the machine; every field degrades gracefully. */
export declare function detectMachine(options?: DetectOptions): Promise<MachineProfile>;
