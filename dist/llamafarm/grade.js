const GiB = 2 ** 30;
/** What a score of 100 means on each axis. */
export const GRADE_REFERENCE = {
    memoryBytes: 64 * GiB,
    vramBytes: 24 * GiB,
    cores: 16,
    diskBytes: 256 * GiB
};
/** Params that would saturate the compute axis on their own. */
const REFERENCE_PARAMS_BILLIONS = 70;
/** Weights plus KV cache for text-ish models. */
const VRAM_OVERHEAD_TEXT = 1.2;
/** Diffusion/video also hold latents and activations on the card. */
const VRAM_OVERHEAD_VISUAL = 1.6;
/** Sampling a diffusion model is compute-heavy regardless of param count. */
const COMPUTE_FLOOR = {
    'text-to-image': 35,
    'image-to-image': 35,
    'text-to-video': 60
};
const VISUAL_TASKS = new Set(['text-to-image', 'image-to-image', 'text-to-video']);
/** How much each axis matters for a given kind of work. */
const TASK_WEIGHTS = {
    'text-generation': { memory: 0.4, gpu: 0.25, compute: 0.2, storage: 0.15 },
    'text-to-image': { memory: 0.25, gpu: 0.45, compute: 0.2, storage: 0.1 },
    'image-to-image': { memory: 0.25, gpu: 0.45, compute: 0.2, storage: 0.1 },
    'text-to-video': { memory: 0.25, gpu: 0.45, compute: 0.2, storage: 0.1 },
    'text-to-speech': { memory: 0.35, gpu: 0.2, compute: 0.3, storage: 0.15 },
    'automatic-speech-recognition': { memory: 0.35, gpu: 0.2, compute: 0.3, storage: 0.15 },
    'image-to-text': { memory: 0.35, gpu: 0.3, compute: 0.2, storage: 0.15 },
    'any-to-any': { memory: 0.35, gpu: 0.3, compute: 0.2, storage: 0.15 }
};
/** Model-independent weighting, used when grading the PC on its own. */
const GENERAL_WEIGHTS = { memory: 0.35, gpu: 0.3, compute: 0.2, storage: 0.15 };
export const AXIS_LABELS = {
    memory: 'Memory',
    gpu: 'GPU',
    compute: 'Compute',
    storage: 'Storage'
};
const AXIS_ORDER = ['memory', 'gpu', 'compute', 'storage'];
const DEFAULT_NOW_THRESHOLD = 0.93;
function clampScore(value) {
    if (!Number.isFinite(value))
        return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
}
/** Linear against the reference ceiling: half the ceiling scores 50. */
function scale(value, ceiling) {
    return clampScore((value / ceiling) * 100);
}
function gb(bytes) {
    const value = bytes / GiB;
    const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return `${value.toFixed(decimals)} GB`;
}
export function gradeLetter(score) {
    if (score >= 95)
        return 'A+';
    if (score >= 85)
        return 'A';
    if (score >= 70)
        return 'B';
    if (score >= 55)
        return 'C';
    if (score >= 40)
        return 'D';
    return 'F';
}
export function gradeLabel(letter) {
    switch (letter) {
        case 'A+':
            return 'excellent';
        case 'A':
            return 'comfortable';
        case 'B':
            return 'workable';
        case 'C':
            return 'tight';
        case 'D':
            return 'poor';
        default:
            return "won't run well";
    }
}
/**
 * Capability wording for the machine on its own. A busy machine is not a bad
 * machine, so this deliberately avoids the fit verdicts used for a pairing.
 */
export function machineLabel(score) {
    if (score >= 85)
        return 'high-end';
    if (score >= 70)
        return 'strong';
    if (score >= 55)
        return 'capable';
    if (score >= 40)
        return 'mid-range';
    if (score >= 25)
        return 'entry-level';
    return 'limited';
}
/** RAM the scenario lets a model claim. */
function budgetRam(machine, scenario, nowThreshold) {
    return scenario === 'now' ? machine.availableRamBytes * nowThreshold : machine.totalRamBytes;
}
function gpuKnown(machine) {
    return (machine.gpuProbe ?? (machine.gpus.length > 0 ? 'ok' : 'unknown')) === 'ok';
}
function maxVram(machine) {
    return machine.gpus.reduce((max, gpu) => Math.max(max, gpu.vramBytes), 0);
}
/**
 * Rate the machine alone. Unknown axes score null and drop out of the average
 * rather than counting as zero — an unreadable GPU is not a missing GPU.
 */
export function gradeMachine(machine, scenario = 'now', options = {}) {
    const nowThreshold = options.nowThreshold ?? DEFAULT_NOW_THRESHOLD;
    const ram = budgetRam(machine, scenario, nowThreshold);
    const vram = maxVram(machine);
    const disk = machine.freeDiskBytes ?? null;
    const weights = { ...GENERAL_WEIGHTS, ...options.weights };
    const axes = [
        {
            axis: 'memory',
            label: AXIS_LABELS.memory,
            score: scale(ram, GRADE_REFERENCE.memoryBytes),
            detail: scenario === 'now' ? `${gb(ram)} usable now` : `${gb(ram)} total`
        },
        {
            axis: 'gpu',
            label: AXIS_LABELS.gpu,
            score: gpuKnown(machine) ? scale(vram, GRADE_REFERENCE.vramBytes) : null,
            detail: gpuKnown(machine) ? `${gb(vram)} VRAM` : 'not detected'
        },
        {
            axis: 'compute',
            label: AXIS_LABELS.compute,
            score: scale(machine.cores, GRADE_REFERENCE.cores),
            detail: `${machine.cores} cores`
        },
        {
            axis: 'storage',
            label: AXIS_LABELS.storage,
            score: disk === null ? null : scale(disk, GRADE_REFERENCE.diskBytes),
            detail: disk === null ? 'not detected' : `${gb(disk)} free`
        }
    ];
    const known = axes.filter((axis) => axis.score !== null);
    const weightSum = known.reduce((sum, axis) => sum + weights[axis.axis], 0);
    const score = weightSum > 0
        ? clampScore(known.reduce((sum, axis) => sum + axis.score * weights[axis.axis], 0) / weightSum)
        : 0;
    const weakest = known.length > 0
        ? known.reduce((worst, axis) => (axis.score < worst.score ? axis : worst))
        : null;
    return { scenario, score, label: machineLabel(score), axes, weakest };
}
/** What the model consumes on each axis, on the same reference ceilings. */
function modelDemand(model) {
    const fileBytes = model.fileBytes ?? model.runtimeRamBytes;
    const visual = VISUAL_TASKS.has(model.task);
    const vramNeeded = Math.round(fileBytes * (visual ? VRAM_OVERHEAD_VISUAL : VRAM_OVERHEAD_TEXT));
    const params = model.paramsBillions ?? 0;
    const compute = Math.max(scale(params, REFERENCE_PARAMS_BILLIONS), COMPUTE_FLOOR[model.task] ?? 0);
    return {
        memory: { score: scale(model.runtimeRamBytes, GRADE_REFERENCE.memoryBytes), detail: `${gb(model.runtimeRamBytes)} RAM` },
        gpu: { score: scale(vramNeeded, GRADE_REFERENCE.vramBytes), detail: `${gb(vramNeeded)} VRAM` },
        compute: {
            score: clampScore(compute),
            detail: model.paramsBillions !== null ? `${model.paramsBillions}B params` : 'params unknown'
        },
        storage: { score: scale(fileBytes, GRADE_REFERENCE.diskBytes), detail: `${gb(fileBytes)} download` }
    };
}
/**
 * Turn a capability/demand ratio into a 0-100 fit. Exactly enough scores 70
 * (it runs, with no room to spare); twice what it needs scores 100.
 */
export function axisFit(machineScore, demand) {
    if (demand <= 0)
        return 100;
    const ratio = machineScore / demand;
    return clampScore(ratio >= 1 ? 70 + 30 * Math.min(ratio - 1, 1) : 70 * ratio);
}
function bottleneckFor(axes, model, machine, scenario) {
    const known = axes.filter((axis) => axis.fit !== null);
    const unknown = axes.filter((axis) => axis.fit === null);
    const worst = known.length > 0
        ? known.reduce((a, b) => (a.fit <= b.fit ? a : b))
        : null;
    // Only compare axes we could actually measure on both sides.
    const heaviest = (known.length > 0 ? known : axes).reduce((a, b) => (a.model >= b.model ? a : b));
    // Every measured axis covered: the PC is not the problem, so point at the model's appetite.
    if (!worst || worst.fit >= 70) {
        const coverage = unknown.length === 0
            ? 'This PC covers the model.'
            : `Measured axes are covered; ${unknown.map((axis) => axis.label.toLowerCase()).join(' and ')} could not be read.`;
        return {
            axis: heaviest.axis,
            label: heaviest.label,
            kind: 'model',
            message: `${coverage} Heaviest demand: ${heaviest.label.toLowerCase()} ${heaviest.model}/100 (${heaviest.modelDetail}).`,
            advice: heaviest.model >= 70
                ? 'The model itself is heavy — a smaller quant or a smaller sibling would leave more room.'
                : 'Nothing to fix; there is headroom on every measured axis.'
        };
    }
    const short = (worst.model - (worst.score ?? 0)).toFixed(0);
    const message = `Weak link: ${worst.label.toLowerCase()} — this PC scores ${worst.score}/100, the model wants ${worst.model}/100 (${short} points short).`;
    let advice;
    switch (worst.axis) {
        case 'memory': {
            const ram = budgetRam(machine, scenario, DEFAULT_NOW_THRESHOLD);
            const gap = Math.max(0, model.runtimeRamBytes - ram);
            advice =
                scenario === 'now' && model.runtimeRamBytes <= machine.totalRamBytes
                    ? `Free about ${gb(gap)} of RAM, or use the 'total' scenario to see the whole machine.`
                    : `More RAM, or step down to a smaller quant / smaller model.`;
            break;
        }
        case 'gpu':
            advice = VISUAL_TASKS.has(model.task)
                ? 'More VRAM, or a smaller/turbo variant — image and video models want the whole model on the card.'
                : model.formats.includes('gguf')
                    ? 'More VRAM, or offload part of the model with --n-gpu-layers and let RAM carry the rest.'
                    : 'More VRAM, or pick a model built for CPU inference.';
            break;
        case 'compute':
            advice = 'More cores, or expect slow generation — a smaller model will feel much faster.';
            break;
        default: {
            const disk = machine.freeDiskBytes ?? 0;
            const gap = Math.max(0, (model.fileBytes ?? 0) - disk);
            advice = `Free about ${gb(gap)} on disk before downloading.`;
        }
    }
    return { axis: worst.axis, label: worst.label, kind: 'machine', message, advice };
}
/** Grade one model against one machine: paired digits, headroom, and a verdict. */
export function gradeSetup(machine, model, scenario = 'now', options = {}) {
    const nowThreshold = options.nowThreshold ?? DEFAULT_NOW_THRESHOLD;
    const weights = TASK_WEIGHTS[model.task] ?? GENERAL_WEIGHTS;
    const pc = gradeMachine(machine, scenario, { nowThreshold, weights });
    const demand = modelDemand(model);
    const axes = pc.axes.map((axis) => {
        const want = demand[axis.axis];
        const fit = axis.score === null ? null : axisFit(axis.score, want.score);
        return {
            ...axis,
            model: want.score,
            modelDetail: want.detail,
            headroom: axis.score === null ? null : axis.score - want.score,
            fit
        };
    });
    const known = axes.filter((axis) => axis.fit !== null);
    const weightSum = known.reduce((sum, axis) => sum + weights[axis.axis], 0);
    const weighted = weightSum > 0
        ? known.reduce((sum, axis) => sum + axis.fit * weights[axis.axis], 0) / weightSum
        : 0;
    const worstFit = known.length > 0 ? Math.min(...known.map((axis) => axis.fit)) : 0;
    // 40% breadth, 60% weakest link: hardware is a chain, and a model that does
    // not fit in RAM does not run no matter how many cores are idle.
    const score = clampScore(0.4 * weighted + 0.6 * worstFit);
    const modelWeightSum = AXIS_ORDER.reduce((sum, axis) => sum + weights[axis], 0);
    const modelScore = clampScore(AXIS_ORDER.reduce((sum, axis) => sum + demand[axis].score * weights[axis], 0) / modelWeightSum);
    const letter = gradeLetter(score);
    return {
        scenario,
        score,
        letter,
        label: gradeLabel(letter),
        machineScore: pc.score,
        modelScore,
        axes,
        bottleneck: bottleneckFor(axes, model, machine, scenario)
    };
}
//# sourceMappingURL=grade.js.map