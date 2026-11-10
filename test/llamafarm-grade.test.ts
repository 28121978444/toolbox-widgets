import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  axisFit,
  gradeLetter,
  gradeMachine,
  gradeSetup,
  machineLabel,
  scoreModels,
  GRADE_REFERENCE,
  type CatalogModel,
  type MachineProfile,
  type ModelTask
} from '../dist/index.js'

const GiB = 2 ** 30

/** A mid-range box: 32 GB RAM, 16 GB free, 8 GB VRAM, 16 cores, 100 GB free. */
function machine(overrides: Partial<MachineProfile> = {}): MachineProfile {
  return {
    totalRamBytes: 32 * GiB,
    availableRamBytes: 16 * GiB,
    cores: 16,
    gpus: [{ name: 'RTX 4060 Ti', vramBytes: 8 * GiB }],
    freeDiskBytes: 100 * GiB,
    gpuProbe: 'ok',
    ollama: { installed: true, url: 'http://127.0.0.1:11434', models: [], error: null },
    detectedAt: 0,
    ...overrides
  }
}

function model(params: number, fileGib: number, task: ModelTask = 'text-generation'): CatalogModel {
  const fileBytes = Math.round(fileGib * GiB)
  return {
    id: `test/model-${params}b`,
    task,
    label: `Model ${params}B`,
    author: 'test',
    formats: ['gguf'],
    paramsBillions: params,
    quantLabel: 'Q4_K_M',
    fileBytes,
    runtimeRamBytes: Math.round(fileBytes * 1.25),
    downloads: 100,
    likes: 10,
    license: 'mit',
    tags: [],
    hfUrl: 'https://huggingface.co/test/model'
  }
}

describe('grade reference scale', () => {
  it('scores the machine linearly against the reference ceilings', () => {
    const grade = gradeMachine(machine(), 'total')
    const byAxis = Object.fromEntries(grade.axes.map((axis) => [axis.axis, axis.score]))
    assert.equal(byAxis.memory, 50, '32 GB is half of the 64 GB reference')
    assert.equal(byAxis.gpu, 33, '8 GB is a third of the 24 GB reference')
    assert.equal(byAxis.compute, 100, '16 cores saturates the compute reference')
    assert.equal(byAxis.storage, 39, '100 GB of 256 GB')
    assert.equal(GRADE_REFERENCE.memoryBytes, 64 * GiB)
  })

  it('uses free RAM for now and total RAM for total', () => {
    const now = gradeMachine(machine(), 'now')
    const total = gradeMachine(machine(), 'total')
    const ram = (g: typeof now): number | null => g.axes.find((a) => a.axis === 'memory')?.score ?? null
    assert.equal(ram(now), 23, '16 GB x 0.93 = 14.9 GB of 64 GB')
    assert.equal(ram(total), 50)
    assert.ok((now.score as number) < total.score)
  })

  it('names the weakest axis and describes the machine without a fit verdict', () => {
    const grade = gradeMachine(machine(), 'now')
    assert.equal(grade.weakest?.axis, 'memory')
    assert.equal(grade.label, machineLabel(grade.score))
    assert.ok(!('letter' in grade), 'the machine alone is not graded pass/fail')
  })

  it('drops unknown axes instead of scoring them zero', () => {
    const blind = machine({ gpus: [], gpuProbe: 'unknown', freeDiskBytes: null })
    const grade = gradeMachine(blind, 'total')
    assert.equal(grade.axes.find((a) => a.axis === 'gpu')?.score, null)
    assert.equal(grade.axes.find((a) => a.axis === 'storage')?.score, null)
    assert.equal(grade.axes.find((a) => a.axis === 'gpu')?.detail, 'not detected')
    // Only memory (50) and compute (100) remain, weighted 0.35 / 0.20.
    assert.equal(grade.score, Math.round((50 * 0.35 + 100 * 0.2) / 0.55))
    assert.ok(grade.weakest)
  })
})

describe('axis fit', () => {
  it('scores exactly-enough at 70 and double at 100', () => {
    assert.equal(axisFit(50, 50), 70)
    assert.equal(axisFit(100, 50), 100)
    assert.equal(axisFit(25, 50), 35)
    assert.equal(axisFit(0, 50), 0)
  })

  it('treats zero demand as fully covered', () => {
    assert.equal(axisFit(0, 0), 100)
  })
})

describe('setup grade', () => {
  it('pairs the PC and the model on every axis with signed headroom', () => {
    const grade = gradeSetup(machine(), model(7, 4.36), 'total')
    assert.deepEqual(grade.axes.map((a) => a.axis), ['memory', 'gpu', 'compute', 'storage'])
    for (const axis of grade.axes) {
      assert.equal(axis.headroom, (axis.score as number) - axis.model)
      assert.ok(axis.model >= 0 && axis.model <= 100)
      assert.ok(axis.detail.length > 0)
      assert.ok(axis.modelDetail.length > 0)
    }
    assert.ok(grade.score >= 0 && grade.score <= 100)
    assert.equal(grade.letter, gradeLetter(grade.score))
  })

  it('grades a light model well and a huge model badly on the same PC', () => {
    const small = gradeSetup(machine(), model(3, 1.88), 'total')
    const huge = gradeSetup(machine(), model(70, 39.6), 'total')
    assert.ok(small.score >= 85, `small model scored ${small.score}`)
    assert.ok(huge.score < 40, `70B scored ${huge.score}`)
    assert.equal(huge.letter, 'F')
  })

  it('points at the PC when an axis is short', () => {
    const grade = gradeSetup(machine(), model(70, 39.6), 'total')
    assert.equal(grade.bottleneck.kind, 'machine')
    assert.match(grade.bottleneck.message, /Weak link:/)
    assert.match(grade.bottleneck.message, /points short/)
    assert.ok(grade.bottleneck.advice.length > 0)
    const axis = grade.axes.find((a) => a.axis === grade.bottleneck.axis)
    assert.ok((axis?.headroom as number) < 0)
  })

  it('points at the model when the PC covers every axis', () => {
    const grade = gradeSetup(machine(), model(3, 1.88), 'total')
    assert.equal(grade.bottleneck.kind, 'model')
    assert.match(grade.bottleneck.message, /This PC covers the model/)
    assert.ok(grade.axes.every((a) => (a.headroom as number) >= 0))
  })

  it('weights GPU hardest for image and video work', () => {
    const beefyRam = machine({ totalRamBytes: 64 * GiB, availableRamBytes: 64 * GiB })
    const video = gradeSetup(beefyRam, model(5, 11, 'text-to-video'), 'total')
    assert.equal(video.bottleneck.axis, 'gpu')
    assert.equal(video.bottleneck.kind, 'machine')
    assert.match(video.bottleneck.advice, /whole model on the card/)
    // Diffusion holds activations too, so it wants more VRAM than a text model of the same size.
    const text = gradeSetup(beefyRam, model(5, 11, 'text-generation'), 'total')
    const vram = (g: typeof video): number => g.axes.find((a) => a.axis === 'gpu')?.model as number
    assert.ok(vram(video) > vram(text))
  })

  it('flags a download that will not fit on disk', () => {
    const tight = machine({ freeDiskBytes: 2 * GiB })
    const grade = gradeSetup(tight, model(70, 39.6), 'total')
    const storage = grade.axes.find((a) => a.axis === 'storage')
    assert.ok((storage?.headroom as number) < 0)
    assert.equal(grade.bottleneck.axis, 'storage')
    assert.match(grade.bottleneck.advice, /Free about .* on disk/)
  })

  it('lets the weakest link drag the grade below the plain average', () => {
    const grade = gradeSetup(machine({ freeDiskBytes: 2 * GiB }), model(70, 39.6), 'total')
    const known = grade.axes.filter((a) => a.fit !== null)
    const average = known.reduce((sum, a) => sum + (a.fit as number), 0) / known.length
    assert.ok(grade.score <= average, `grade ${grade.score} should not exceed the average ${average}`)
  })

  it('ignores unknown axes in the setup grade too', () => {
    const blind = machine({ gpus: [], gpuProbe: 'unknown', freeDiskBytes: null })
    const grade = gradeSetup(blind, model(7, 4.36), 'total')
    assert.equal(grade.axes.find((a) => a.axis === 'gpu')?.fit, null)
    assert.equal(grade.axes.find((a) => a.axis === 'gpu')?.headroom, null)
    assert.ok(grade.score > 0)
    assert.notEqual(grade.bottleneck.axis, 'gpu')
  })
})

describe('scoreModels integration', () => {
  it('attaches a grade to every scored model', () => {
    const scored = scoreModels({
      models: [model(3, 1.88), model(70, 39.6)],
      machine: machine(),
      scenario: 'now'
    })
    assert.equal(scored.length, 2)
    for (const entry of scored) {
      assert.ok(entry.grade)
      assert.equal(entry.grade.scenario, 'now')
      assert.equal(entry.grade.axes.length, 4)
    }
    assert.ok(scored[0].grade.score > scored[1].grade.score)
    assert.equal(scored[1].grade.bottleneck.kind, 'machine')
  })
})