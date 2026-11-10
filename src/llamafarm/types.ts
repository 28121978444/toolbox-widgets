/**
 * Shared types for the Model Farm feature: a HuggingFace catalog of local
 * models, a profile of the machine they would run on, and fit verdicts.
 */

export type ModelTask =
  | 'text-generation'
  | 'text-to-image'
  | 'text-to-speech'
  | 'image-to-text'
  | 'image-to-image'
  | 'text-to-video'
  | 'any-to-any'
  | 'automatic-speech-recognition'

export interface ModelTaskInfo {
  task: ModelTask
  label: string
  icon: string
  order: number
}

/** Display metadata per pipeline task; `order` drives column layout. */
export const MODEL_TASKS: ModelTaskInfo[] = [
  { task: 'text-generation', label: 'Text Generation', icon: '⌁', order: 0 },
  { task: 'text-to-image', label: 'Text to Image', icon: '▦', order: 1 },
  { task: 'text-to-speech', label: 'Text to Speech', icon: '♪', order: 2 },
  { task: 'image-to-text', label: 'Image to Text', icon: '◉', order: 3 },
  { task: 'image-to-image', label: 'Image to Image', icon: '⇄', order: 4 },
  { task: 'text-to-video', label: 'Text to Video', icon: '▸', order: 5 },
  { task: 'any-to-any', label: 'Any to Any', icon: '✳', order: 6 },
  { task: 'automatic-speech-recognition', label: 'Speech to Text', icon: '◷', order: 7 }
]

export type ModelFormat = 'gguf' | 'safetensors'

export interface InstalledModel {
  name: string
  sizeBytes: number
  modifiedAt: string | null
}

export interface GpuInfo {
  name: string
  vramBytes: number
}

export interface OllamaInfo {
  installed: boolean
  url: string
  models: InstalledModel[]
  error: string | null
}

/** Snapshot of the machine a model would run on. */
export interface MachineProfile {
  totalRamBytes: number
  /** Free RAM at detection time. */
  availableRamBytes: number
  cores: number
  gpus: GpuInfo[]
  /** Free space on the disk models would be downloaded to; null when unknown. */
  freeDiskBytes?: number | null
  /** 'unknown' when no adapter could be read, so VRAM is not graded as zero. */
  gpuProbe?: 'ok' | 'unknown'
  ollama: OllamaInfo
  detectedAt: number
}

/** One model from the catalog with everything needed for fit scoring. */
export interface CatalogModel {
  /** HuggingFace repo id, e.g. 'Qwen/Qwen2.5-Coder-7B-Instruct-GGUF'. */
  id: string
  task: ModelTask
  /** Repo name without the author, '-GGUF' suffix stripped. */
  label: string
  author: string
  formats: ModelFormat[]
  paramsBillions: number | null
  /** Quantization parsed from the weights filename, e.g. 'Q4_K_M'. */
  quantLabel: string | null
  /** Size of the chosen primary weights file. */
  fileBytes: number | null
  /** Estimated RAM needed including runtime overhead (fileBytes x 1.25). */
  runtimeRamBytes: number
  downloads: number
  likes: number
  license: string | null
  tags: string[]
  hfUrl: string
}

export type FitVerdict = 'green' | 'yellow' | 'red'
export type FitScenario = 'now' | 'total'

/** The four hardware axes a model is graded against. */
export type GradeAxis = 'memory' | 'gpu' | 'compute' | 'storage'
export type GradeLetter = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F'

/** One side of the scorecard: how strong this PC is on one axis, 0-100. */
export interface MachineAxisRating {
  axis: GradeAxis
  label: string
  /** 0-100 against a fixed reference ceiling; null when not detectable. */
  score: number | null
  /** The real value behind the score, e.g. '18.6 GB free'. */
  detail: string
}

export interface MachineGrade {
  scenario: FitScenario
  /** Weighted 0-100 summary of the axes that could be measured. */
  score: number
  /** Capability wording ('mid-range', 'strong', …), not a fit verdict. */
  label: string
  axes: MachineAxisRating[]
  weakest: MachineAxisRating | null
}

/** The same axis, with the model's demand laid alongside the PC's capability. */
export interface AxisRating extends MachineAxisRating {
  /** 0-100: how much of the reference ceiling this model consumes. */
  model: number
  /** machine - model. Negative means this axis is short. */
  headroom: number | null
  /** 0-100 fit for this axis alone; null when the PC side is unknown. */
  fit: number | null
  /** The real value behind the demand, e.g. '5.6 GB VRAM'. */
  modelDetail: string
}

export interface GradeBottleneck {
  axis: GradeAxis
  label: string
  /** 'machine' = this PC is the weak link; 'model' = the PC covers it. */
  kind: 'machine' | 'model'
  message: string
  advice: string
}

/** The full scorecard for one model on one machine. */
export interface SetupGrade {
  scenario: FitScenario
  /** Weakest-link weighted 0-100 verdict for the pairing. */
  score: number
  letter: GradeLetter
  label: string
  /** PC summary on the same task weights, so the two numbers compare. */
  machineScore: number
  /** Model demand summary on those weights. */
  modelScore: number
  axes: AxisRating[]
  bottleneck: GradeBottleneck
}

export interface ScoredModel extends CatalogModel {
  verdict: FitVerdict
  fitsNow: boolean
  fitsTotal: boolean
  reason: string
  hints: string[]
  /** Numeric scorecard for this model against the scoring machine. */
  grade: SetupGrade
}

export interface ScoreOptions {
  models: CatalogModel[]
  machine: MachineProfile
  scenario: FitScenario
  /** Fraction of available RAM a model may claim to count as 'now'. Default 0.93. */
  nowThreshold?: number
}
