import { Effect } from "effect"
import type { Provider } from "@/provider/provider"
import type { MessageV2 } from "./message-v2"

const ZERO_CACHE_INPUT_MIN = 50_000
const CONSECUTIVE_MISS_THRESHOLD = 3

export interface CacheSnapshot {
  readonly input: number
  readonly output: number
  readonly reasoning: number
  readonly cacheRead: number
  readonly cacheWrite: number
}

export function supportsCacheDiagnostics(model: Provider.Model) {
  if (model.providerID === "synora-foundry") return model.options.useCompletionUrls !== true
  if (model.providerID === "synora-bedrock") return true
  return false
}

export function cacheHitRatio(snapshots: CacheSnapshot[]): number {
  if (!snapshots.length) return 0
  let totalInput = 0
  let cachedInput = 0
  for (const s of snapshots) {
    totalInput += s.input
    cachedInput += s.cacheRead
  }
  if (totalInput === 0) return 0
  return cachedInput / totalInput
}

export function consecutiveZeroCacheCount(input: {
  model: Provider.Model
  steps: CacheSnapshot[]
}): number {
  if (!supportsCacheDiagnostics(input.model)) return 0
  let count = 0
  for (let i = input.steps.length - 1; i >= 0; i--) {
    const step = input.steps[i]
    const isZeroCache = step.input >= ZERO_CACHE_INPUT_MIN && step.cacheRead === 0 && step.cacheWrite === 0
    if (isZeroCache) {
      count++
    } else {
      break
    }
  }
  return count
}

export function sessionCacheSummary(input: {
  model: Provider.Model
  steps: CacheSnapshot[]
}): { hitRatio: number; consecutiveMisses: number; totalSteps: number; isDegraded: boolean } {
  const hitRatio = cacheHitRatio(input.steps)
  const consecutiveMisses = consecutiveZeroCacheCount(input)
  const isDegraded =
    supportsCacheDiagnostics(input.model) &&
    hitRatio < 0.1 &&
    consecutiveMisses >= CONSECUTIVE_MISS_THRESHOLD &&
    input.steps.length >= CONSECUTIVE_MISS_THRESHOLD

  return {
    hitRatio,
    consecutiveMisses,
    totalSteps: input.steps.length,
    isDegraded,
  }
}

export function fromStepTokens(tokens: MessageV2.StepFinishPart["tokens"]): CacheSnapshot {
  return {
    input: tokens.input,
    output: tokens.output,
    reasoning: tokens.reasoning ?? 0,
    cacheRead: tokens.cache.read,
    cacheWrite: tokens.cache.write,
  }
}

export function fromAssistantTokens(tokens: MessageV2.Assistant["tokens"]): CacheSnapshot {
  return {
    input: tokens.input,
    output: tokens.output,
    reasoning: tokens.reasoning,
    cacheRead: tokens.cache.read,
    cacheWrite: tokens.cache.write,
  }
}

export * as SessionCacheDiagnostics from "./cache-diagnostics"
