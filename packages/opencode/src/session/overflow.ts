import type { Config } from "@/config/config"
import type { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import type { MessageV2 } from "./message-v2"

const COMPACTION_BUFFER = 20_000
const TOOL_OUTPUT_HEADROOM_FACTOR = 0.05
const SAFETY_MARGIN_FACTOR = 0.02

export function usable(input: { cfg: Config.Info; model: Provider.Model; outputTokenMax?: number }) {
  const context = input.model.limit.context
  if (context === 0) return 0

  const reserved =
    input.cfg.compaction?.reserved ??
    Math.min(COMPACTION_BUFFER, ProviderTransform.maxOutputTokens(input.model, input.outputTokenMax))
  return input.model.limit.input
    ? Math.max(0, input.model.limit.input - reserved)
    : Math.max(0, context - ProviderTransform.maxOutputTokens(input.model, input.outputTokenMax))
}

export function headroom(model: Provider.Model, cfg: Config.Info, outputTokenMax?: number) {
  const available = usable({ cfg, model, outputTokenMax })
  const maxOutput = outputTokenMax ?? ProviderTransform.maxOutputTokens(model, outputTokenMax)
  const toolOutput = Math.floor(model.limit.context * TOOL_OUTPUT_HEADROOM_FACTOR)
  const safetyMargin = Math.floor(model.limit.context * SAFETY_MARGIN_FACTOR)
  return { available, output: maxOutput, toolOutput, safetyMargin }
}

export function isOverflow(input: {
  cfg: Config.Info
  tokens: MessageV2.Assistant["tokens"]
  model: Provider.Model
  outputTokenMax?: number
}) {
  if (input.cfg.compaction?.auto === false) return false
  if (input.model.limit.context === 0) return false

  const h = headroom(input.model, input.cfg, input.outputTokenMax)
  const count =
    input.tokens.total || input.tokens.input + input.tokens.output + input.tokens.cache.read + input.tokens.cache.write

  return count >= Math.max(0, h.available - h.toolOutput - h.safetyMargin)
}
