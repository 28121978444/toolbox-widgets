/**
 * HuggingFace catalog fetch for the Model Farm feature. Lists the top models
 * per pipeline task, then resolves per-model file sizes (GGUF/safetensors)
 * from the detail endpoint so fit scoring uses real bytes, not guesses.
 */
import type { FetchLike } from '../widgets/crypto-watch.js';
import { type CatalogModel, type ModelFormat, type ModelTask } from './types.js';
export interface FetchCatalogOptions {
    tasks?: ModelTask[];
    formats?: ModelFormat[];
    perTask?: number;
    fetchImpl?: FetchLike;
    baseUrl?: string;
    timeoutMs?: number;
}
/** Parse a parameter count from a weights filename ('...-7B-...' -> 7, '1.5B' -> 1.5). */
export declare function parseParamsBillions(fileName: string): number | null;
/** Parse a quantization label from a weights filename ('Q4_K_M', 'Q8_0', 'F16'). */
export declare function parseQuantLabel(fileName: string): string | null;
interface HfSibling {
    rfilename: string;
    size?: number;
    lfs?: {
        size?: number;
    };
}
/**
 * Quants in the order a local run prefers them. Q4_K_M is the Ollama default,
 * so a repo that ships it is measured at that size instead of the F16 copy.
 */
export declare const PREFERRED_QUANTS: string[];
/**
 * Pick the GGUF a local run would actually use: the preferred quant when the
 * repo has one, otherwise the largest file available.
 */
export declare function choosePrimaryGguf(files: HfSibling[]): HfSibling;
/**
 * Fetch the catalog: top-downloaded models per task with real file sizes.
 * A task whose list request fails is skipped; if every task fails, throws.
 */
export declare function fetchCatalog(options?: FetchCatalogOptions): Promise<CatalogModel[]>;
/** Map a HuggingFace pipeline tag onto a Model Farm task, defaulting to text. */
export declare function resolveModelTask(pipelineTag?: string): ModelTask;
export interface FetchModelOptions {
    formats?: ModelFormat[];
    fetchImpl?: FetchLike;
    baseUrl?: string;
    timeoutMs?: number;
}
/**
 * Fetch a single model by its HuggingFace repo id — used when the user names
 * a repo directly instead of picking one from the catalog.
 */
export declare function fetchModelById(repoId: string, options?: FetchModelOptions): Promise<CatalogModel | null>;
export {};
