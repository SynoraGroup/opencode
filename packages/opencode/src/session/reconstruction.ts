import type { MessageV2 } from "./message-v2"
import type { Provider } from "@/provider/provider"
import { SessionGovernor } from "./governor"
import { SessionMetadataLedger } from "./metadata-ledger"

export interface ReconstructedPayload {
  modelProviderID: string
  modelID: string
  messageCount: number
  totalTokens: number
  cachePrefixTokens: number
  messages: Array<{
    role: string
    tokenCount: number
    parts: number
  }>
  metadataLedger: SessionMetadataLedger.LedgerEntry[]
}

export function reconstruct(
  msgs: MessageV2.WithParts[],
  model: Provider.Model,
  ledger?: SessionMetadataLedger.Ledger,
): ReconstructedPayload {
  const totalTokens = SessionGovernor.estimateTokens(msgs)
  const cachePrefixTokens = SessionGovernor.cachePrefixTokens(msgs, model)

  const messages = msgs.map((msg) => {
    const info = msg.info
    let tokenCount = 0
    if (info.role === "assistant") {
      tokenCount = info.tokens.total ?? info.tokens.input + info.tokens.output + info.tokens.cache.read + info.tokens.cache.write
    }
    return {
      role: info.role,
      tokenCount,
      parts: msg.parts.length,
    }
  })

  return {
    modelProviderID: model.providerID,
    modelID: model.id,
    messageCount: msgs.length,
    totalTokens,
    cachePrefixTokens,
    messages,
    metadataLedger: ledger?.entries ?? persistedLedger(msgs),
  }
}

function persistedLedger(msgs: MessageV2.WithParts[]): SessionMetadataLedger.LedgerEntry[] {
  return msgs.flatMap((msg) =>
    msg.parts.flatMap((part) => {
      if (part.type !== "step-finish") return []
      const entry = part.metadata?.ledger
      return isLedgerEntry(entry) ? [entry] : []
    }),
  )
}

function isLedgerEntry(input: unknown): input is SessionMetadataLedger.LedgerEntry {
  if (!input || typeof input !== "object") return false
  const entry = input as Partial<SessionMetadataLedger.LedgerEntry>
  return typeof entry.messageID === "string" && typeof entry.providerID === "string" && typeof entry.requestID === "string"
}

export function isDeterministic(a: ReconstructedPayload, b: ReconstructedPayload): boolean {
  if (a.modelProviderID !== b.modelProviderID) return false
  if (a.modelID !== b.modelID) return false
  if (a.messageCount !== b.messageCount) return false
  if (a.totalTokens !== b.totalTokens) return false
  if (a.messages.length !== b.messages.length) return false

  for (let i = 0; i < a.messages.length; i++) {
    if (a.messages[i].role !== b.messages[i].role) return false
    if (a.messages[i].parts !== b.messages[i].parts) return false
  }

  return true
}

export function compactedTokenReduction(before: ReconstructedPayload, after: ReconstructedPayload): number {
  return Math.max(0, before.totalTokens - after.totalTokens)
}

export * as SessionReconstruction from "./reconstruction"
