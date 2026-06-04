import { describe, expect, test } from "bun:test"
import { SessionGovernor } from "../../src/session/governor"
import { SessionCacheDiagnostics } from "../../src/session/cache-diagnostics"
import { SessionReconstruction } from "../../src/session/reconstruction"
import { SessionMetadataLedger } from "../../src/session/metadata-ledger"

describe("SessionGovernor", () => {
  test("estimateTokens sums assistant tokens", () => {
    const msgs: any[] = [
      {
        info: { role: "assistant", tokens: { total: 100, input: 80, output: 20, reasoning: 0, cache: { read: 0, write: 0 } } },
        parts: [],
      },
      {
        info: { role: "user", model: { providerID: "sy", modelID: "m1", variant: undefined } },
        parts: [],
      },
      {
        info: { role: "assistant", tokens: { total: 200, input: 150, output: 50, reasoning: 10, cache: { read: 5, write: 10 } } },
        parts: [],
      },
    ]

    expect(SessionGovernor.estimateTokens(msgs)).toBe(300)
  })

  test("estimateTokens ignores user messages", () => {
    const msgs: any[] = [
      { info: { role: "user", model: { providerID: "sy", modelID: "m1" } }, parts: [] },
    ]

    expect(SessionGovernor.estimateTokens(msgs)).toBe(0)
  })
})

describe("SessionCacheDiagnostics", () => {
  test("supportsCacheDiagnostics for synora-foundry without completion urls", () => {
    expect(SessionCacheDiagnostics.supportsCacheDiagnostics({
      providerID: "synora-foundry",
      options: { useCompletionUrls: undefined },
    } as any)).toBe(true)
  })

  test("supportsCacheDiagnostics rejects synora-foundry with completion urls", () => {
    expect(SessionCacheDiagnostics.supportsCacheDiagnostics({
      providerID: "synora-foundry",
      options: { useCompletionUrls: true },
    } as any)).toBe(false)
  })

  test("supportsCacheDiagnostics for synora-bedrock", () => {
    expect(SessionCacheDiagnostics.supportsCacheDiagnostics({
      providerID: "synora-bedrock",
      options: {},
    } as any)).toBe(true)
  })

  test("consecutiveZeroCacheCount detects repeated misses", () => {
    const model = { providerID: "synora-foundry", options: {} } as any
    const steps = [
      { input: 100_000, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
      { input: 80_000, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
      { input: 60_000, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
    ]

    expect(SessionCacheDiagnostics.consecutiveZeroCacheCount({ model, steps })).toBe(3)
  })

  test("consecutiveZeroCacheCount breaks on cache hit", () => {
    const model = { providerID: "synora-foundry", options: {} } as any
    const steps = [
      { input: 100_000, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
      { input: 80_000, output: 0, reasoning: 0, cacheRead: 50_000, cacheWrite: 0 },
      { input: 60_000, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
    ]

    expect(SessionCacheDiagnostics.consecutiveZeroCacheCount({ model, steps })).toBe(1)
  })

  test("sessionCacheSummary detects degraded cache", () => {
    const model = { providerID: "synora-foundry", options: {} } as any
    const steps = [
      { input: 100_000, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
      { input: 100_000, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
      { input: 100_000, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
      { input: 100_000, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
    ]

    const summary = SessionCacheDiagnostics.sessionCacheSummary({ model, steps })
    expect(summary.hitRatio).toBe(0)
    expect(summary.consecutiveMisses).toBe(4)
    expect(summary.isDegraded).toBe(true)
  })

  test("sessionCacheSummary healthy cache", () => {
    const model = { providerID: "synora-foundry", options: {} } as any
    const steps = [
      { input: 100_000, output: 0, reasoning: 0, cacheRead: 80_000, cacheWrite: 10_000 },
      { input: 100_000, output: 0, reasoning: 0, cacheRead: 90_000, cacheWrite: 0 },
    ]

    const summary = SessionCacheDiagnostics.sessionCacheSummary({ model, steps })
    expect(summary.hitRatio).toBeCloseTo(0.85, 1)
    expect(summary.isDegraded).toBe(false)
  })
})

describe("SessionMetadataLedger", () => {
  test("creates empty ledger", () => {
    const model = { providerID: "synora-foundry", id: "gpt-5.4" } as any
    const ledger = SessionMetadataLedger.create("session-1", model)
    expect(ledger.entries).toEqual([])
    expect(ledger.sessionID).toBe("session-1")
  })

  test("appends entries and sums tokens", () => {
    const model = { providerID: "synora-foundry", id: "gpt-5.4" } as any
    let ledger = SessionMetadataLedger.create("session-1", model)

    const entry: SessionMetadataLedger.LedgerEntry = {
      messageID: "msg-1",
      timestamp: 1000,
      providerID: "synora-foundry",
      modelID: "gpt-5.4",
      tokens: { input: 100, output: 50, reasoning: 20, cache: { read: 10, write: 5 } },
      reasoning: { mode: "responses_encrypted", encrypted: true, hasContent: true },
      cache: { keyUsed: true, readTokens: 10, writeTokens: 5 },
      requestID: "req-1",
    }

    ledger = SessionMetadataLedger.append(ledger, entry)
    expect(ledger.entries.length).toBe(1)

    const sum = SessionMetadataLedger.tokensSum(ledger)
    expect(sum.input).toBe(100)
    expect(sum.output).toBe(50)
    expect(sum.reasoning).toBe(20)
    expect(sum.cache.read).toBe(10)
    expect(sum.cache.write).toBe(5)
  })

  test("restartSafe false when encrypted reasoning missing content", () => {
    const model = { providerID: "synora-foundry", id: "gpt-5.4" } as any
    let ledger = SessionMetadataLedger.create("session-1", model)
    ledger = SessionMetadataLedger.append(ledger, {
      messageID: "msg-1", timestamp: 1000, providerID: "sy", modelID: "gpt-5.4",
      tokens: { input: 10, output: 10, reasoning: 0, cache: { read: 0, write: 0 } },
      reasoning: { mode: "responses_encrypted", encrypted: true, hasContent: false },
      cache: { keyUsed: false, readTokens: 0, writeTokens: 0 },
      requestID: "req-1",
    })

    expect(SessionMetadataLedger.isRestartSafe(ledger)).toBe(false)
  })

  test("restartSafe true for healthy entries", () => {
    const model = { providerID: "synora-foundry", id: "gpt-5.4" } as any
    let ledger = SessionMetadataLedger.create("session-1", model)
    ledger = SessionMetadataLedger.append(ledger, {
      messageID: "msg-1", timestamp: 1000, providerID: "sy", modelID: "gpt-5.4",
      tokens: { input: 10, output: 10, reasoning: 0, cache: { read: 0, write: 0 } },
      reasoning: { mode: "none", encrypted: false, hasContent: false },
      cache: { keyUsed: false, readTokens: 0, writeTokens: 0 },
      requestID: "req-1",
    })

    expect(SessionMetadataLedger.isRestartSafe(ledger)).toBe(true)
  })
})

describe("SessionReconstruction", () => {
  test("reconstructs payload from messages", () => {
    const model = { providerID: "synora-foundry", id: "gpt-5.4" } as any
    const msgs: any[] = [
      {
        info: { role: "assistant", tokens: { total: 100, input: 80, output: 20, reasoning: 0, cache: { read: 0, write: 0 } } },
        parts: [{ type: "text" }, { type: "tool" }],
      },
      {
        info: { role: "user", model: { providerID: "s", modelID: "m" } },
        parts: [{ type: "text" }],
      },
    ]

    const payload = SessionReconstruction.reconstruct(msgs, model)
    expect(payload.modelProviderID).toBe("synora-foundry")
    expect(payload.messageCount).toBe(2)
    expect(payload.totalTokens).toBe(100)
    expect(payload.messages[0].parts).toBe(2)
    expect(payload.messages[0].role).toBe("assistant")
  })

  test("reconstructs persisted metadata ledger from step-finish parts", () => {
    const model = { providerID: "synora-foundry", id: "gpt-5.4" } as any
    const entry: SessionMetadataLedger.LedgerEntry = {
      messageID: "msg-1",
      timestamp: 1000,
      providerID: "synora-foundry",
      modelID: "gpt-5.4",
      tokens: { input: 100, output: 50, reasoning: 20, cache: { read: 10, write: 5 } },
      reasoning: { mode: "responses_encrypted", encrypted: true, hasContent: true },
      cache: { keyUsed: true, readTokens: 10, writeTokens: 5 },
      requestID: "req-1",
    }
    const payload = SessionReconstruction.reconstruct([
      {
        info: { role: "assistant", tokens: { total: 150, input: 100, output: 50, reasoning: 20, cache: { read: 10, write: 5 } } },
        parts: [{ type: "step-finish", metadata: { ledger: entry } }],
      },
    ] as any[], model)

    expect(payload.metadataLedger).toEqual([entry])
  })

  test("isDeterministic returns true for identical payloads", () => {
    const p1: any = { modelProviderID: "synora-foundry", modelID: "gpt-5.4", messageCount: 2, totalTokens: 100, messages: [{ role: "assistant", tokenCount: 50, parts: 1 }, { role: "user", tokenCount: 0, parts: 1 }], metadataLedger: [] }
    const p2 = { ...p1 }

    expect(SessionReconstruction.isDeterministic(p1, p2)).toBe(true)
  })

  test("isDeterministic returns false for different payloads", () => {
    const p1: any = { modelProviderID: "synora-foundry", modelID: "gpt-5.4", messageCount: 2, totalTokens: 100, messages: [{ role: "assistant", tokenCount: 50, parts: 1 }], metadataLedger: [] }
    const p2 = { ...p1, messageCount: 3 }

    expect(SessionReconstruction.isDeterministic(p1, p2)).toBe(false)
  })
})
