import type { Provider } from "@/provider/provider"

export interface LedgerEntry {
  messageID: string
  timestamp: number
  providerID: string
  modelID: string
  tokens: {
    input: number
    output: number
    reasoning: number
    cache: { read: number; write: number }
  }
  reasoning: {
    mode: string
    encrypted: boolean
    hasContent: boolean
  }
  cache: {
    keyUsed: boolean
    readTokens: number
    writeTokens: number
  }
  requestID: string
}

export interface Ledger {
  entries: LedgerEntry[]
  sessionID: string
  model: Provider.Model
}

export function create(sessionID: string, model: Provider.Model): Ledger {
  return { entries: [], sessionID, model }
}

export function append(
  ledger: Ledger,
  entry: LedgerEntry,
): Ledger {
  return { ...ledger, entries: [...ledger.entries, entry] }
}

export function tokensSum(ledger: Ledger) {
  return ledger.entries.reduce(
    (acc, e) => ({
      input: acc.input + e.tokens.input,
      output: acc.output + e.tokens.output,
      reasoning: acc.reasoning + e.tokens.reasoning,
      cache: {
        read: acc.cache.read + e.tokens.cache.read,
        write: acc.cache.write + e.tokens.cache.write,
      },
    }),
    { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  )
}

export function lastReasoningState(ledger: Ledger): LedgerEntry | undefined {
  for (let i = ledger.entries.length - 1; i >= 0; i--) {
    if (ledger.entries[i].reasoning.encrypted) return ledger.entries[i]
  }
}

export function isRestartSafe(ledger: Ledger): boolean {
  for (const entry of ledger.entries) {
    if (entry.reasoning.encrypted && !entry.reasoning.hasContent) return false
    if (entry.cache.keyUsed && entry.cache.readTokens === 0 && entry.cache.writeTokens === 0) return false
  }
  return true
}

export function requestSequence(ledger: Ledger): string[] {
  return ledger.entries.map((e) => e.requestID)
}

export * as SessionMetadataLedger from "./metadata-ledger"
