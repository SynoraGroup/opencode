import type { Auth } from "@/auth"
import type { Provider } from "@/provider/provider"
import { SynoraProvider } from "@/provider/synora"
import { ProviderTransform } from "@/provider/transform"
import { errorMessage } from "@/util/error"
import { isRecord } from "@/util/record"
import { asSchema, type ModelMessage, type Tool } from "ai"
import { Effect } from "effect"
import * as Stream from "effect/Stream"
import { tool as nativeTool, ToolFailure, type JsonSchema, type LLMEvent } from "@opencode-ai/llm"
import { Auth as RouteAuth, type AuthShape, type LLMClientShape } from "@opencode-ai/llm/route"
import { LLMNative } from "./native-request"

export type RuntimeStatus =
  | { readonly type: "supported"; readonly apiKey?: string; readonly baseURL?: string; readonly routeAuth?: AuthShape }
  | { readonly type: "unsupported"; readonly reason: string }
export type StreamResult =
  | { readonly type: "supported"; readonly stream: Stream.Stream<LLMEvent, unknown> }
  | { readonly type: "unsupported"; readonly reason: string }

type StreamInput = {
  readonly model: Provider.Model
  readonly provider: Provider.Info
  readonly auth: Auth.Info | undefined
  readonly llmClient: LLMClientShape
  readonly messages: ModelMessage[]
  readonly tools: Record<string, Tool>
  readonly toolChoice?: "auto" | "required" | "none"
  readonly temperature?: number
  readonly topP?: number
  readonly topK?: number
  readonly maxOutputTokens?: number
  readonly providerOptions?: Record<string, any>
  readonly headers: Record<string, string>
  readonly abort: AbortSignal
}

export function status(input: Pick<StreamInput, "model" | "provider" | "auth">): RuntimeStatus {
  const providerID = input.model.providerID
  if (providerID !== "synora-foundry" && providerID !== "synora-bedrock")
    return { type: "unsupported", reason: "provider is not a synora provider" }
  const contractError = SynoraProvider.validationError(input.model)
  if (contractError) return { type: "unsupported", reason: contractError }
  const npm = input.model.api.npm
  if (npm !== "@ai-sdk/azure" && npm !== "@ai-sdk/amazon-bedrock")
    return { type: "unsupported", reason: "provider package is not supported by native runtime" }
  const routeAuth =
    input.auth?.type !== "oauth"
      ? undefined
      : input.provider.id === "synora-foundry" && npm === "@ai-sdk/azure"
        ? RouteAuth.bearer(input.auth.access)
        : undefined
  if (input.auth?.type === "oauth" && !routeAuth) {
    return { type: "unsupported", reason: "OAuth auth requires a synora provider with azure sdk" }
  }

  const apiKey = typeof input.provider.options.apiKey === "string" ? input.provider.options.apiKey : input.provider.key
  if (!apiKey && !routeAuth && npm !== "@ai-sdk/amazon-bedrock")
    return { type: "unsupported", reason: "API key is not configured" }

  return {
    type: "supported",
    ...(apiKey ? { apiKey } : {}),
    ...(routeAuth ? { routeAuth } : {}),
    baseURL: typeof input.provider.options.baseURL === "string" ? input.provider.options.baseURL : undefined,
  }
}

export function stream(input: StreamInput): StreamResult {
  const current = status(input)
  if (current.type === "unsupported") return current

  const stream = input.llmClient.stream({
    request: LLMNative.request({
      model: input.model,
      apiKey: current.apiKey,
      auth: current.routeAuth,
      baseURL: current.baseURL,
      messages: ProviderTransform.message(input.messages, input.model, input.providerOptions ?? {}),
      toolChoice: input.toolChoice,
      temperature: input.temperature,
      topP: input.topP,
      topK: input.topK,
      maxOutputTokens: input.maxOutputTokens,
      providerOptions: ProviderTransform.providerOptions(input.model, input.providerOptions ?? {}),
      headers: { ...providerHeaders(input.provider.options.headers), ...input.headers },
    }),
    tools: nativeTools(input.tools, input),
  })

  return {
    ...current,
    stream,
  }
}

function providerHeaders(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  )
}

function nativeSchema(value: unknown): JsonSchema {
  if (!value || typeof value !== "object") return { type: "object", properties: {} }
  if ("jsonSchema" in value && value.jsonSchema && typeof value.jsonSchema === "object")
    return value.jsonSchema as JsonSchema
  return asSchema(value as Parameters<typeof asSchema>[0]).jsonSchema as JsonSchema
}

export function nativeTools(tools: Record<string, Tool>, input: Pick<StreamInput, "messages" | "abort">) {
  return Object.fromEntries(
    Object.entries(tools).map(([name, item]) => [
      name,
      // Tool execution remains opencode-owned. The native runtime only adapts
      // the @opencode-ai/llm tool call back into the AI SDK Tool.execute shape.
      nativeTool({
        description: item.description ?? "",
        jsonSchema: nativeSchema(item.inputSchema),
        execute: (args: unknown, ctx) =>
          Effect.tryPromise({
            try: () => {
              if (!item.execute) throw new Error(`Tool has no execute handler: ${name}`)
              return item.execute(args, {
                toolCallId: ctx?.id ?? name,
                messages: input.messages,
                abortSignal: input.abort,
              })
            },
            catch: (error) => new ToolFailure({ message: errorMessage(error), error }),
          }),
      }),
    ]),
  )
}

export * as LLMNativeRuntime from "./native-runtime"
