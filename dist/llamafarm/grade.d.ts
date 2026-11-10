/**
 * Numeric grading for the Model Farm.
 *
 * The PC and the model are rated on the *same* four axes against the same
 * reference ceilings, so the two rows of digits can be subtracted: a negative
 * headroom names the weak link. The setup grade is weakest-link weighted — one
 * short axis drags the whole pairing down, the way a bottleneck actually works.
 *
 * All constants are estimates for a local llama.cpp / Ollama style run. They
 * are gathered here so the arithmetic stays inspectable rather than magic.
 */
import type { CatalogModel, FitScenario, GradeAxis, GradeLetter, MachineGrade, MachineProfile, SetupGrade } from './types.js';
/** What a score of 100 means on each axis. */
export declare const GRADE_REFERENCE: {
    readonly memoryBytes: number;
    readonly vramBytes: number;
    readonly cores: 16;
    readonly diskBytes: number;
};
type AxisWeights = Record<GradeAxis, number>;
export declare const AXIS_LABELS: Record<GradeAxis, string>;
export declare function gradeLetter(score: number): GradeLetter;
export declare function gradeLabel(letter: GradeLetter): string;
/**
 * Capability wording for the machine on its own. A busy machine is not a bad
 * machine, so this deliberately avoids the fit verdicts used for a pairing.
 */
export declare function machineLabel(score: number): string;
/**
 * Rate the machine alone. Unknown axes score null and drop out of the average
 * rather than counting as zero — an unreadable GPU is not a missing GPU.
 */
export declare function gradeMachine(machine: MachineProfile, scenario?: FitScenario, options?: {
    nowThreshold?: number;
    weights?: Partial<AxisWeights>;
}): MachineGrade;
/**
 * Turn a capability/demand ratio into a 0-100 fit. Exactly enough scores 70
 * (it runs, with no room to spare); twice what it needs scores 100.
 */
export declare function axisFit(machineScore: number, demand: number): number;
/** Grade one model against one machine: paired digits, headroom, and a verdict. */
export declare function gradeSetup(machine: MachineProfile, model: CatalogModel, scenario?: FitScenario, options?: {
    nowThreshold?: number;
}): SetupGrade;
export {};
