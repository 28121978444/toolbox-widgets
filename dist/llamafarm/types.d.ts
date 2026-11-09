/**
 * Shared types for the Model Farm feature: a HuggingFace catalog of local
 * models, a profile of the machine they would run on, and fit verdicts.
 */
export type ModelTask = 'text-generation' | 'text-to-image' | 'text-to-speech' | 'image-to-text' | 'image-to-image' | 'text-to-video' | 'any-to-any' | 'automatic-speech-recognition';
export interface ModelTaskInfo {
    task: ModelTask;
    label: string;
    icon: string;
    order: number;
}
/** Display metadata per pipeline task; `order` drives column layout. */
export declare const MODEL_TASKS: ModelTaskInfo[];
export type ModelFormat = 'gguf' | 'safetensors';
export interface InstalledModel {
    name: string;
    sizeBytes: number;
    modifiedAt: string | null;
}
export interface GpuInfo {
    name: string;
    vramBytes: number;
}
export interface OllamaInfo {
    installed: boolean;
    url: string;
    models: InstalledModel[];
    error: string | null;
}
/** Snapshot of the machine a model would run on. */
export interface MachineProfile {
    totalRamBytes: number;
    /** Free RAM at detection time. */
    availableRamBytes: number;
    cores: number;
    gpus: GpuInfo[];
    ollama: OllamaInfo;
    detectedAt: number;
}
/** One model from the catalog with everything needed for fit scoring. */
export interface CatalogModel {
    /** HuggingFace repo id, e.g. 'Qwen/Qwen2.5-Coder-7B-Instruct-GGUF'. */
    id: string;
    task: ModelTask;
    /** Repo name without the author, '-GGUF' suffix stripped. */
    label: string;
    author: string;
    formats: ModelFormat[];
    paramsBillions: number | null;
    /** Quantization parsed from the weights filename, e.g. 'Q4_K_M'. */
    quantLabel: string | null;
    /** Size of the chosen primary weights file. */
    fileBytes: number | null;
    /** Estimated RAM needed including runtime overhead (fileBytes x 1.25). */
    runtimeRamBytes: number;
    downloads: number;
    likes: number;
    license: string | null;
    tags: string[];
    hfUrl: string;
}
export type FitVerdict = 'green' | 'yellow' | 'red';
export type FitScenario = 'now' | 'total';
export interface ScoredModel extends CatalogModel {
    verdict: FitVerdict;
    fitsNow: boolean;
    fitsTotal: boolean;
    reason: string;
    hints: string[];
}
export interface ScoreOptions {
    models: CatalogModel[];
    machine: MachineProfile;
    scenario: FitScenario;
    /** Fraction of available RAM a model may claim to count as 'now'. Default 0.93. */
    nowThreshold?: number;
}
