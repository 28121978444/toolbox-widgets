export * from './types.js'
export { detectMachine, type DetectOptions, type ExecFileLike } from './detect.js'
export {
  fetchCatalog,
  fetchModelById,
  parseParamsBillions,
  parseQuantLabel,
  resolveModelTask,
  choosePrimaryGguf,
  PREFERRED_QUANTS,
  type FetchCatalogOptions,
  type FetchModelOptions
} from './huggingface.js'
export { scoreModels, sortForDisplay, type ScoreOptions } from './score.js'
export {
  buildModelfile,
  normalizeRepoId,
  ollamaModelName,
  ollamaReference,
  planOllamaInstall,
  probeOllamaCli,
  pullIntoOllama,
  runOllamaCommand,
  OLLAMA_HF_HOST,
  type OllamaCliInfo,
  type OllamaInstallPlan,
  type PullResult,
  type SpawnedProcess,
  type SpawnLike
} from './ollama.js'
export {
  catalogCachePath,
  isCatalogFresh,
  readCatalogCache,
  writeCatalogCache,
  DEFAULT_CATALOG_TTL_MS,
  type CatalogCache
} from './cache.js'
