const DEFAULT_NOW_THRESHOLD = 0.93;
const GiB = 2 ** 30;
const VERDICT_RANK = { green: 0, yellow: 1, red: 2 };
/** Rough layer count used to translate spare VRAM into a --n-gpu-layers hint. */
const ASSUMED_LAYERS = 32;
export function scoreModels(options) {
    const threshold = options.nowThreshold ?? DEFAULT_NOW_THRESHOLD;
    const { machine, scenario } = options;
    const available = machine.availableRamBytes * threshold;
    const maxVram = machine.gpus.reduce((max, gpu) => Math.max(max, gpu.vramBytes), 0);
    return options.models.map((model) => {
        const fitsNow = model.runtimeRamBytes <= available;
        const fitsTotal = model.runtimeRamBytes <= machine.totalRamBytes;
        const verdict = scenario === 'now' ? (fitsNow ? 'green' : fitsTotal ? 'yellow' : 'red') : fitsTotal ? 'green' : 'red';
        const gapGb = Math.ceil(Math.abs(model.runtimeRamBytes - available) / GiB);
        const reason = verdict === 'green'
            ? scenario === 'now'
                ? 'runs now'
                : 'fits this machine'
            : fitsTotal
                ? `needs ${gapGb} GB freed to run now`
                : 'exceeds total RAM';
        const hints = [];
        if (verdict === 'yellow')
            hints.push(`free ~${gapGb} GB (close apps) to run it now`);
        if (verdict === 'red' && maxVram > 0) {
            const perLayerBytes = (model.fileBytes ?? model.runtimeRamBytes) / ASSUMED_LAYERS;
            const layers = Math.floor((maxVram * 0.9) / perLayerBytes);
            if (layers >= 1) {
                hints.push(`try --n-gpu-layers ${layers} (llama.cpp) to split across GPU + RAM`);
            }
        }
        if (model.formats.includes('gguf') && machine.ollama.installed) {
            hints.push('GGUF: import into Ollama, then run with ollama run');
        }
        return { ...model, verdict, fitsNow, fitsTotal, reason, hints };
    });
}
/** Verdict order (green, yellow, red), then lightest model first. */
export function sortForDisplay(scored) {
    return [...scored].sort((a, b) => VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict] || a.runtimeRamBytes - b.runtimeRamBytes);
}
//# sourceMappingURL=score.js.map