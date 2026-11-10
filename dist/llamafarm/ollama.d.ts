import type { ExecFileLike } from './detect.js';
import type { CatalogModel } from './types.js';
/** Ollama accepts both hosts; the short one is what its own docs use. */
export declare const OLLAMA_HF_HOST = "hf.co";
export interface OllamaInstallPlan {
    /** What `ollama pull` and `ollama run` accept, e.g. 'hf.co/owner/repo:Q4_K_M'. */
    reference: string;
    /** Short local name for the pulled model, e.g. 'qwen2-5-coder-7b-instruct'. */
    modelName: string;
    /** Arguments for `ollama pull`. */
    pullArgs: string[];
    /** Arguments for `ollama run`. */
    runArgs: string[];
    /** Ordered instructions for the user. */
    steps: string[];
}
/** Strip a HuggingFace URL down to 'owner/repo'. */
export declare function normalizeRepoId(repoId: string): string;
/** Build the Ollama reference for a HuggingFace repo, optionally with a quant tag. */
export declare function ollamaReference(repoId: string, quantLabel?: string | null): string;
/** A safe local Ollama model name derived from the catalog label. */
export declare function ollamaModelName(label: string): string;
/**
 * Plan the Ollama import for a catalog entry. GGUF only — safetensors
 * checkpoints need a conversion step Ollama cannot do.
 */
export declare function planOllamaInstall(model: CatalogModel, quantLabel?: string | null): OllamaInstallPlan;
/** Build a Modelfile that pins the reference and the GPU offload split. */
export declare function buildModelfile(reference: string, options?: {
    numGpu?: number;
    systemPrompt?: string;
}): string;
export interface OllamaCliInfo {
    installed: boolean;
    version: string | null;
    error: string | null;
}
/** Probe the `ollama` binary; never throws. */
export declare function probeOllamaCli(execFileImpl: ExecFileLike): Promise<OllamaCliInfo>;
export interface SpawnedProcess {
    stdout: {
        on(event: 'data', listener: (chunk: Buffer | string) => void): void;
    } | null;
    stderr: {
        on(event: 'data', listener: (chunk: Buffer | string) => void): void;
    } | null;
    on(event: 'error', listener: (error: Error) => void): void;
    on(event: 'close', listener: (code: number | null) => void): void;
}
export type SpawnLike = (file: string, args: string[]) => SpawnedProcess;
export interface PullResult {
    ok: boolean;
    code: number | null;
    /** Everything the runtime printed (progress bars live on stderr). */
    output: string;
    error: string | null;
}
/** Pull a reference into the local Ollama runtime, streaming progress. */
export declare function pullIntoOllama(reference: string, options?: {
    spawnImpl?: SpawnLike;
    onOutput?: (chunk: string) => void;
}): Promise<PullResult>;
