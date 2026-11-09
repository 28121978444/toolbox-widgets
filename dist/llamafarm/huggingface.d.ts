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
/**
 * Fetch the catalog: top-downloaded models per task with real file sizes.
 * A task whose list request fails is skipped; if every task fails, throws.
 */
export declare function fetchCatalog(options?: FetchCatalogOptions): Promise<CatalogModel[]>;
