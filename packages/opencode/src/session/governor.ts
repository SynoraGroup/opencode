import type { Provider } from "@/provider/provider"
import type { Config } from "@/config/config"
import type { MessageV2 } from "./message-v2"
import { SynoraProvider } from "@/provider/synora"
import { headroom } from "./overflow"

const CHARS_PER_TOKEN = 4

export function estimateTokens(msgs: MessageV2.WithParts[]): number {
  let total = 0
  for (const msg of msgs) {
    const info = msg.info
    if (info.role === "assistant") {
      total += info.tokens.total ?? info.tokens.input + info.tokens.output + info.tokens.cache.read + info.tokens.cache.write
      continue
    }
    total += estimatePartTokens(msg.parts)
  }
  return total
}

export function wouldOverflow(input: {
  cfg: Config.Info
  model: Provider.Model
  estimatedTokens: number
  outputTokenMax?: number
  cachePrefixTokens?: number
}): boolean {
  if (input.cfg.compaction?.auto === false) return false
  if (input.model.limit.context === 0) return false

  const h = headroom(input.model, input.cfg, input.outputTokenMax)
  const effectiveAvailable = Math.max(0, h.available - h.safetyMargin - h.toolOutput - h.output)

  if (input.cachePrefixTokens) {
    const cacheUsable = Math.max(0, h.available - input.cachePrefixTokens - h.safetyMargin)
    return input.estimatedTokens >= cacheUsable
  }

  return input.estimatedTokens >= effectiveAvailable
}

export function cachePrefixTokens(msgs: MessageV2.WithParts[], model: Provider.Model): number {
  const contract = SynoraProvider.contract(model)
  if (!contract || contract.cache === "none") return 0

  const firstUser = msgs.find((msg) => msg.info.role === "user")
  return firstUser ? estimatePartTokens(firstUser.parts) : 0
}

function estimatePartTokens(parts: MessageV2.Part[]) {
  return Math.ceil(
    parts
      .filter((part): part is MessageV2.TextPart | MessageV2.ToolPart => part.type === "text" || part.type === "tool")
      .map((part) => (part.type === "text" ? part.text : part.state.status === "completed" ? part.state.output : ""))
      .join("\n").length / CHARS_PER_TOKEN,
  )
}

export * as SessionGovernor from "./governor"
