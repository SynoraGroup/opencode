import type { ModelMessage } from "ai"
import type { JSONSchema7 } from "@ai-sdk/provider"
import type * as Provider from "./provider"
import { SynoraProvider } from "./synora"

export const OUTPUT_TOKEN_MAX = 32_000

type JSONValue = string | number | boolean | null | JSONValue[] | { readonly [key: string]: JSONValue }
type ProviderOptions = Record<string, Record<string, JSONValue>>

export function sanitizeSurrogates(content: string) {
  return content.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD")
}

export function options(input: {
  readonly model: Provider.Model
  readonly sessionID: string
  readonly providerOptions: Record<string, unknown>
}): Record<string, unknown> {
  if (!SynoraProvider.isSynoraProvider(input.model.providerID)) return {}
  return SynoraProvider.options({ model: input.model, sessionID: input.sessionID })
}

export function smallOptions(model: Provider.Model): Record<string, unknown> {
  if (!SynoraProvider.isSynoraProvider(model.providerID)) return {}
  return SynoraProvider.smallOptions({ model })
}

export function temperature(_model: Provider.Model): undefined {
  return undefined
}

export function topP(_model: Provider.Model): undefined {
  return undefined
}

export function topK(_model: Provider.Model): undefined {
  return undefined
}

export function maxOutputTokens(model: Provider.Model, outputTokenMax?: number) {
  return Math.min(outputTokenMax ?? OUTPUT_TOKEN_MAX, model.limit.output || OUTPUT_TOKEN_MAX)
}

export function schema(_model: Provider.Model, value: JSONSchema7): JSONSchema7 {
  return value
}

export function providerOptions(model: Provider.Model, options: Record<string, unknown>): ProviderOptions | undefined {
  if (model.api.npm === "@ai-sdk/azure") return openAIProviderOptions(options)
  if (model.api.npm === "@ai-sdk/amazon-bedrock") return bedrockProviderOptions(options)
  return undefined
}

export function message(msgs: ModelMessage[], _model: Provider.Model, _options: Record<string, unknown>): ModelMessage[] {
  return msgs.map((msg) => {
    if (typeof msg.content === "string") return { ...msg, content: sanitizeSurrogates(msg.content) } as ModelMessage
    return { ...msg, content: msg.content.map((part) => sanitizeContentPart(part)) } as ModelMessage
  })
}

export function variants(model: Provider.Model) {
  return model.variants ?? {}
}

function openAIProviderOptions(options: Record<string, unknown>): ProviderOptions | undefined {
  const openai = defined({
    store: booleanValue(options.store),
    promptCacheKey: stringValue(options.promptCacheKey),
    promptCacheRetention: stringValue(options.promptCacheRetention),
    reasoningEffort: stringValue(options.reasoningEffort),
    reasoningSummary: stringValue(options.reasoningSummary),
    include: stringArray(options.include),
    textVerbosity: stringValue(options.textVerbosity),
  })
  return Object.keys(openai).length === 0 ? undefined : { openai: openai as Record<string, JSONValue> }
}

function bedrockProviderOptions(options: Record<string, unknown>): ProviderOptions | undefined {
  return isRecord(options.bedrock) ? { bedrock: jsonRecord(options.bedrock) } : undefined
}

function sanitizeContentPart(part: unknown): unknown {
  if (!isRecord(part)) return part
  if (part.type === "text" && typeof part.text === "string") return { ...part, text: sanitizeSurrogates(part.text) }
  if (part.type === "reasoning" && typeof part.text === "string") return { ...part, text: sanitizeSurrogates(part.text) }
  if (part.type !== "tool-result") return part
  if (!isRecord(part.output)) return part
  if ((part.output.type === "text" || part.output.type === "error-text") && typeof part.output.value === "string") {
    return { ...part, output: { ...part.output, value: sanitizeSurrogates(part.output.value) } }
  }
  if (part.output.type === "content" && Array.isArray(part.output.value)) {
    return {
      ...part,
      output: {
        ...part.output,
        value: part.output.value.map((item) =>
          isRecord(item) && item.type === "text" && typeof item.text === "string"
            ? { ...item, text: sanitizeSurrogates(item.text) }
            : item,
        ),
      },
    }
  }
  return part
}

function defined(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter((entry) => entry[1] !== undefined))
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : undefined
}

function stringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined
}

function jsonRecord(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, JSONValue] => isJSONValue(entry[1])))
}

function isJSONValue(value: unknown): value is JSONValue {
  if (value === null) return true
  if (["string", "number", "boolean"].includes(typeof value)) return true
  if (Array.isArray(value)) return value.every(isJSONValue)
  return isRecord(value) && Object.values(value).every(isJSONValue)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export * as ProviderTransform from "./transform"
