import { Database } from "@/storage/db"
import { desc, eq } from "drizzle-orm"
import type { Provider } from "@/provider/provider"
import { MessageID, SessionID } from "./schema"
import { MessageV2 } from "./message-v2"
import { SessionRuntimeCheckpointTable, SessionRuntimeLedgerTable } from "./session.sql"
import { SessionGovernor } from "./governor"
import { SessionCacheDiagnostics } from "./cache-diagnostics"
import { SessionMetadataLedger } from "./metadata-ledger"
import { SessionReconstruction } from "./reconstruction"
import { Hash } from "@opencode-ai/core/util/hash"
import { Effect, Schema } from "effect"

export type LedgerType =
  | "usage_snapshot"
  | "cache_snapshot"
  | "reasoning_state"
  | "stream_error"
  | "turn_retry"
  | "compaction_checkpoint"
  | "resume_boundary"

export interface LedgerEntryInput {
  readonly sessionID: SessionID
  readonly type: LedgerType
  readonly messageID?: MessageID
  readonly providerID?: string
  readonly modelID?: string
  readonly checkpointID?: string
  readonly data: Record<string, unknown>
}

export interface CheckpointInput {
  readonly sessionID: SessionID
  readonly parentMessageID: MessageID
  readonly summaryMessageID: MessageID
  readonly tailStartID?: MessageID
  readonly model: Provider.Model
  readonly messages: MessageV2.WithParts[]
  readonly tokensBefore: number
  readonly previousSummary?: string
}

export interface Checkpoint {
  readonly id: string
  readonly sessionID: SessionID
  readonly parentMessageID: MessageID
  readonly summaryMessageID: MessageID
  readonly tailStartID?: MessageID
  readonly providerID: string
  readonly modelID: string
  readonly variant?: string
  readonly tokensBefore: number
  readonly tokensAfter: number
  readonly cachePrefixTokens: number
  readonly cachePrefixHash?: string
  readonly created: number
  readonly data: RuntimeCheckpointData
}

export interface RuntimeCheckpointData {
  readonly replacement_messages: MessageV2.WithParts[]
  readonly previous_summary?: string
  readonly diagnostics: {
    readonly message_count: number
    readonly cache_prefix_tokens: number
    readonly cache_prefix_hash: string
  }
}

export interface ReconstructedRequestContext {
  readonly messages: MessageV2.WithParts[]
  readonly checkpoint?: Checkpoint
  readonly tokenEstimate: number
  readonly cachePrefixTokens: number
  readonly cachePrefixHash: string
  readonly restartSafe: boolean
  readonly cacheHealth: ReturnType<typeof SessionCacheDiagnostics.sessionCacheSummary>
  readonly warnings: string[]
}

export const appendLedger = Effect.fn("SessionRuntime.appendLedger")(function* (input: LedgerEntryInput) {
  const now = Date.now()
  yield* Effect.sync(() =>
    Database.use((db) =>
      db
        .insert(SessionRuntimeLedgerTable)
        .values({
          id: runtimeID("rt"),
          session_id: input.sessionID,
          type: input.type,
          message_id: input.messageID,
          provider_id: input.providerID,
          model_id: input.modelID,
          checkpoint_id: input.checkpointID,
          time_created: now,
          time_updated: now,
          data: input.data,
        })
        .run(),
    ),
  )
})

export const createCheckpoint = Effect.fn("SessionRuntime.createCheckpoint")(function* (input: CheckpointInput) {
  const id = runtimeID("chk")
  const now = Date.now()
  const cachePrefixTokens = SessionGovernor.cachePrefixTokens(input.messages, input.model)
  const cachePrefixHash = cacheHash(input.messages, input.model)
  const tokensAfter = SessionGovernor.estimateTokens(input.messages)
  const data: RuntimeCheckpointData = {
    replacement_messages: input.messages,
    previous_summary: input.previousSummary,
    diagnostics: {
      message_count: input.messages.length,
      cache_prefix_tokens: cachePrefixTokens,
      cache_prefix_hash: cachePrefixHash,
    },
  }

  yield* Effect.sync(() =>
    Database.use((db) =>
      db
        .insert(SessionRuntimeCheckpointTable)
        .values({
          id,
          session_id: input.sessionID,
          parent_message_id: input.parentMessageID,
          summary_message_id: input.summaryMessageID,
          tail_start_id: input.tailStartID,
          provider_id: input.model.providerID,
          model_id: input.model.id,
          variant: undefined,
          tokens_before: input.tokensBefore,
          tokens_after: tokensAfter,
          cache_prefix_tokens: cachePrefixTokens,
          cache_prefix_hash: cachePrefixHash,
          time_created: now,
          time_updated: now,
          data: data as unknown as Record<string, unknown>,
        })
        .run(),
    ),
  )

  yield* appendLedger({
    sessionID: input.sessionID,
    type: "compaction_checkpoint",
    messageID: input.summaryMessageID,
    providerID: input.model.providerID,
    modelID: input.model.id,
    checkpointID: id,
    data: {
      parent_message_id: input.parentMessageID,
      summary_message_id: input.summaryMessageID,
      tail_start_id: input.tailStartID,
      tokens_before: input.tokensBefore,
      tokens_after: tokensAfter,
      cache_prefix_tokens: cachePrefixTokens,
      cache_prefix_hash: cachePrefixHash,
    },
  })

  return id
})

export const latestCheckpoint = Effect.fn("SessionRuntime.latestCheckpoint")(function* (sessionID: SessionID) {
  return yield* Effect.sync(() =>
    Database.use((db) => {
      const row = db
        .select()
        .from(SessionRuntimeCheckpointTable)
        .where(eq(SessionRuntimeCheckpointTable.session_id, sessionID))
        .orderBy(desc(SessionRuntimeCheckpointTable.time_created), desc(SessionRuntimeCheckpointTable.id))
        .limit(1)
        .get()
      if (!row) return undefined
      const data = parseCheckpointData(row.data)
      if (!data) return undefined
      return {
        id: row.id,
        sessionID: row.session_id,
        parentMessageID: row.parent_message_id,
        summaryMessageID: row.summary_message_id,
        tailStartID: row.tail_start_id ?? undefined,
        providerID: row.provider_id,
        modelID: row.model_id,
        variant: row.variant ?? undefined,
        tokensBefore: row.tokens_before,
        tokensAfter: row.tokens_after,
        cachePrefixTokens: row.cache_prefix_tokens,
        cachePrefixHash: row.cache_prefix_hash ?? undefined,
        created: row.time_created,
        data,
      } satisfies Checkpoint
    }),
  )
})

export const reconstructForRequest = Effect.fn("SessionRuntime.reconstructForRequest")(function* (input: {
  readonly sessionID: SessionID
  readonly model: Provider.Model
  readonly messages?: MessageV2.WithParts[]
}) {
  const all = input.messages ?? (yield* MessageV2.filterCompactedEffect(input.sessionID))
  const checkpoint = yield* latestCheckpoint(input.sessionID)
  const messages = checkpoint ? checkpointedMessages(checkpoint, all) : all
  const tokenEstimate = SessionGovernor.estimateTokens(messages)
  const cachePrefixTokens = SessionGovernor.cachePrefixTokens(messages, input.model)
  const cachePrefixHash = cacheHash(messages, input.model)
  const metadataLedger = SessionReconstruction.reconstruct(messages, input.model).metadataLedger
  const restartSafe = SessionMetadataLedger.isRestartSafe({
    entries: metadataLedger,
    sessionID: input.sessionID,
    model: input.model,
  })
  const cacheHealth = SessionCacheDiagnostics.sessionCacheSummary({
    model: input.model,
    steps: messages.flatMap((message) =>
      message.parts.flatMap((part) => (part.type === "step-finish" ? [SessionCacheDiagnostics.fromStepTokens(part.tokens)] : [])),
    ),
  })
  const warnings = [
    ...(checkpoint && checkpoint.cachePrefixHash && checkpoint.cachePrefixHash !== cachePrefixHash
      ? ["checkpoint cache prefix hash differs from reconstructed request prefix"]
      : []),
    ...(!restartSafe ? ["reconstructed context has unsafe reasoning/cache ledger entries"] : []),
    ...(cacheHealth.isDegraded ? ["provider cache appears degraded for recent large requests"] : []),
  ]

  if (checkpoint) {
    yield* appendLedger({
      sessionID: input.sessionID,
      type: "resume_boundary",
      checkpointID: checkpoint.id,
      providerID: input.model.providerID,
      modelID: input.model.id,
      data: {
        messages: messages.length,
        token_estimate: tokenEstimate,
        cache_prefix_tokens: cachePrefixTokens,
        cache_prefix_hash: cachePrefixHash,
        restart_safe: restartSafe,
        cache_health: cacheHealth,
        warnings,
      },
    })
  }

  return {
    messages,
    checkpoint,
    tokenEstimate,
    cachePrefixTokens,
    cachePrefixHash,
    restartSafe,
    cacheHealth,
    warnings,
  } satisfies ReconstructedRequestContext
})

function runtimeID(prefix: string) {
  return `${prefix}_${MessageID.ascending()}`
}

function checkpointedMessages(checkpoint: Checkpoint, all: MessageV2.WithParts[]) {
  const seen = new Set(checkpoint.data.replacement_messages.map((message) => message.info.id))
  return [
    ...checkpoint.data.replacement_messages,
    ...all.filter((message) => message.info.id > checkpoint.summaryMessageID && !seen.has(message.info.id)),
  ]
}

function cacheHash(messages: MessageV2.WithParts[], model: Provider.Model) {
  const cachePrefixTokens = SessionGovernor.cachePrefixTokens(messages, model)
  if (cachePrefixTokens === 0) return Hash.fast("")
  const firstUser = messages.find((message) => message.info.role === "user")
  return Hash.fast(JSON.stringify(firstUser?.parts ?? []))
}

function parseCheckpointData(data: Record<string, unknown>): RuntimeCheckpointData | undefined {
  if (!Array.isArray(data.replacement_messages)) return undefined
  const messages = data.replacement_messages.filter(Schema.is(MessageV2.WithParts))
  if (messages.length !== data.replacement_messages.length) return undefined
  const diagnostics = data.diagnostics
  if (!diagnostics || typeof diagnostics !== "object") return undefined
  const parsed = diagnostics as Partial<RuntimeCheckpointData["diagnostics"]>
  if (typeof parsed.message_count !== "number") return undefined
  if (typeof parsed.cache_prefix_tokens !== "number") return undefined
  if (typeof parsed.cache_prefix_hash !== "string") return undefined
  return {
    replacement_messages: messages,
    previous_summary: typeof data.previous_summary === "string" ? data.previous_summary : undefined,
    diagnostics: {
      message_count: parsed.message_count,
      cache_prefix_tokens: parsed.cache_prefix_tokens,
      cache_prefix_hash: parsed.cache_prefix_hash,
    },
  }
}

export * as SessionRuntime from "./runtime"
