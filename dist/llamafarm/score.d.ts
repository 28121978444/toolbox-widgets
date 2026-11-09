/**
 * Fit scoring for the Model Farm feature. A model is green when it fits the
 * scenario budget, yellow when it needs resources freed, red otherwise. Reds
 * keep offload hints (e.g. --n-gpu-layers) when a GPU offers a path to them.
 */
import type { CatalogModel, FitScenario, MachineProfile, ScoredModel } from './types.js';
export interface ScoreOptions {
    models: CatalogModel[];
    machine: MachineProfile;
    scenario: FitScenario;
    /** Fraction of available RAM a model may claim to count as 'now'. Default 0.93. */
    nowThreshold?: number;
}
export declare function scoreModels(options: ScoreOptions): ScoredModel[];
/** Verdict order (green, yellow, red), then lightest model first. */
export declare function sortForDisplay(scored: ScoredModel[]): ScoredModel[];
