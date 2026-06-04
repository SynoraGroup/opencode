import type { Auth } from "@/auth"
import type { Info, Model } from "./provider"
import { ModelID, ProviderID } from "./schema"

const FOUNDRY_BASE_URL = "https://nps-foundry.services.ai.azure.com/openai/v1"
const BEDROCK_REGION = "eu-central-1"
const ENCRYPTED_REASONING_INCLUDE = ["reasoning.encrypted_content"] as const

type Input = {
  readonly envs: Record<string, string | undefined>
  readonly auths: Record<string, Auth.Info>
}

type ProviderFamily = "foundry" | "bedrock"
type Transport = "responses" | "chat_completions" | "bedrock_converse"
type AuthMode = "azure_api_key" | "aws_sigv4"
type CacheMode = "prompt_cache_key" | "none"
type ReasoningMode = "responses_encrypted" | "reasoning_content" | "bedrock_converse" | "none"
type Provenance = {
  readonly kind: "official-doc" | "deployment-default"
  readonly detail: string
}

type Contract = {
  readonly id: string
  readonly providerID: ProviderID
  readonly providerFamily: ProviderFamily
  readonly transport: Transport
  readonly auth: AuthMode
  readonly cache: CacheMode
  readonly promptCacheRetention?: "in_memory" | "24h"
  readonly reasoning: ReasoningMode
  readonly name: string
  readonly apiID: string
  readonly npm: string
  readonly cost: Model["cost"]
  readonly context: number
  readonly input?: number
  readonly output: number
  readonly temperature?: boolean
  readonly attachment?: boolean
  readonly inputModalities?: Model["capabilities"]["input"]
  readonly interleaved?: Model["capabilities"]["interleaved"]
  readonly releaseDate: string
  readonly sources: {
    readonly transport: Provenance
    readonly auth: Provenance
    readonly reasoning: Provenance
    readonly cache: Provenance
    readonly limits: Provenance
  }
}

const foundryProviderID = ProviderID.make("synora-foundry")
const bedrockProviderID = ProviderID.make("synora-bedrock")

const textOnly = {
  text: true,
  audio: false,
  image: false,
  video: false,
  pdf: false,
}

const textImageInput = {
  ...textOnly,
  image: true,
}

const textImagePdfInput = {
  ...textImageInput,
  pdf: true,
}

const textImageVideoInput = {
  ...textImageInput,
  video: true,
}

const textOutput = textOnly

const DOC_RESPONSE_API = { kind: "official-doc", detail: "azure-openai-responses" } satisfies Provenance
const DOC_CHAT_API = { kind: "official-doc", detail: "azure-openai-chat-completions" } satisfies Provenance
const DOC_REASONING = { kind: "official-doc", detail: "azure-openai-reasoning" } satisfies Provenance
const DOC_PROMPT_CACHE = { kind: "official-doc", detail: "azure-openai-prompt-caching" } satisfies Provenance
const DOC_BEDROCK_CONVERSE = { kind: "official-doc", detail: "aws-bedrock-converse" } satisfies Provenance
const DOC_BEDROCK_MODEL = { kind: "official-doc", detail: "aws-bedrock-anthropic-claude" } satisfies Provenance
const DEFAULT_FOUNDRY = { kind: "deployment-default", detail: "nps-foundry default base url" } satisfies Provenance
const DEFAULT_BEDROCK = { kind: "deployment-default", detail: "eu-central-1 default region" } satisfies Provenance

const CONTRACTS = {
  "gpt-5.4": {
    id: "gpt-5.4",
    providerID: foundryProviderID,
    providerFamily: "foundry",
    transport: "responses",
    auth: "azure_api_key",
    cache: "prompt_cache_key",
    promptCacheRetention: "24h",
    reasoning: "responses_encrypted",
    name: "GPT-5.4",
    apiID: "gpt-5.4",
    npm: "@ai-sdk/azure",
    cost: {
      input: 2.5,
      output: 15,
      cache: { read: 0.25, write: 0 },
      tiers: [
        {
          input: 5,
          output: 22.5,
          cache: { read: 0.5, write: 0 },
          tier: { type: "context", size: 272_000 },
        },
      ],
      experimentalOver200K: {
        input: 5,
        output: 22.5,
        cache: { read: 0.5, write: 0 },
      },
    },
    context: 1_050_000,
    input: 922_000,
    output: 128_000,
    attachment: true,
    inputModalities: textImagePdfInput,
    releaseDate: "2026-03-05",
    sources: {
      transport: DOC_RESPONSE_API,
      auth: DEFAULT_FOUNDRY,
      reasoning: DOC_REASONING,
      cache: DOC_PROMPT_CACHE,
      limits: DEFAULT_FOUNDRY,
    },
  },
  "gpt-5.3-codex": {
    id: "gpt-5.3-codex",
    providerID: foundryProviderID,
    providerFamily: "foundry",
    transport: "responses",
    auth: "azure_api_key",
    cache: "prompt_cache_key",
    promptCacheRetention: "24h",
    reasoning: "responses_encrypted",
    name: "GPT-5.3 Codex",
    apiID: "gpt-5.3-codex",
    npm: "@ai-sdk/azure",
    cost: {
      input: 1.75,
      output: 14,
      cache: { read: 0.175, write: 0 },
    },
    context: 400_000,
    input: 272_000,
    output: 128_000,
    attachment: true,
    inputModalities: textImagePdfInput,
    releaseDate: "2026-02-24",
    sources: {
      transport: DOC_RESPONSE_API,
      auth: DEFAULT_FOUNDRY,
      reasoning: DOC_REASONING,
      cache: DOC_PROMPT_CACHE,
      limits: DEFAULT_FOUNDRY,
    },
  },
  "DeepSeek-V4-Pro": {
    id: "DeepSeek-V4-Pro",
    providerID: foundryProviderID,
    providerFamily: "foundry",
    transport: "chat_completions",
    auth: "azure_api_key",
    cache: "none",
    reasoning: "reasoning_content",
    name: "DeepSeek V4 Pro",
    apiID: "DeepSeek-V4-Pro",
    npm: "@ai-sdk/azure",
    cost: {
      input: 1.74,
      output: 3.48,
      cache: { read: 0.145, write: 0 },
    },
    context: 1_000_000,
    output: 384_000,
    temperature: true,
    interleaved: { field: "reasoning_content" },
    releaseDate: "2026-04-24",
    sources: {
      transport: DOC_CHAT_API,
      auth: DEFAULT_FOUNDRY,
      reasoning: DOC_CHAT_API,
      cache: DOC_PROMPT_CACHE,
      limits: DEFAULT_FOUNDRY,
    },
  },
  "DeepSeek-V4-Flash": {
    id: "DeepSeek-V4-Flash",
    providerID: foundryProviderID,
    providerFamily: "foundry",
    transport: "chat_completions",
    auth: "azure_api_key",
    cache: "none",
    reasoning: "reasoning_content",
    name: "DeepSeek V4 Flash",
    apiID: "DeepSeek-V4-Flash",
    npm: "@ai-sdk/azure",
    cost: {
      input: 0.14,
      output: 0.28,
      cache: { read: 0.028, write: 0 },
    },
    context: 1_000_000,
    output: 384_000,
    temperature: true,
    interleaved: { field: "reasoning_content" },
    releaseDate: "2026-04-24",
    sources: {
      transport: DOC_CHAT_API,
      auth: DEFAULT_FOUNDRY,
      reasoning: DOC_CHAT_API,
      cache: DOC_PROMPT_CACHE,
      limits: DEFAULT_FOUNDRY,
    },
  },
  "Kimi-K2.6": {
    id: "Kimi-K2.6",
    providerID: foundryProviderID,
    providerFamily: "foundry",
    transport: "chat_completions",
    auth: "azure_api_key",
    cache: "none",
    reasoning: "reasoning_content",
    name: "Kimi K2.6",
    apiID: "Kimi-K2.6",
    npm: "@ai-sdk/azure",
    cost: {
      input: 0.95,
      output: 4,
      cache: { read: 0.16, write: 0 },
    },
    context: 262_144,
    output: 262_144,
    temperature: true,
    attachment: true,
    inputModalities: textImageVideoInput,
    interleaved: { field: "reasoning_content" },
    releaseDate: "2026-04-20",
    sources: {
      transport: DOC_CHAT_API,
      auth: DEFAULT_FOUNDRY,
      reasoning: DOC_CHAT_API,
      cache: DOC_PROMPT_CACHE,
      limits: DEFAULT_FOUNDRY,
    },
  },
  "claude-opus-4.6": {
    id: "claude-opus-4.6",
    providerID: bedrockProviderID,
    providerFamily: "bedrock",
    transport: "bedrock_converse",
    auth: "aws_sigv4",
    cache: "none",
    reasoning: "bedrock_converse",
    name: "Claude Opus 4.6",
    apiID: "eu.anthropic.claude-opus-4-6-v1",
    npm: "@ai-sdk/amazon-bedrock",
    cost: {
      input: 5,
      output: 25,
      cache: { read: 0.5, write: 6.25 },
      tiers: [
        {
          input: 10,
          output: 37.5,
          cache: { read: 1, write: 12.5 },
          tier: { type: "context", size: 200_000 },
        },
      ],
      experimentalOver200K: {
        input: 10,
        output: 37.5,
        cache: { read: 1, write: 12.5 },
      },
    },
    context: 1_000_000,
    output: 128_000,
    temperature: true,
    attachment: true,
    inputModalities: textImagePdfInput,
    releaseDate: "2026-02-05",
    sources: {
      transport: DOC_BEDROCK_CONVERSE,
      auth: DEFAULT_BEDROCK,
      reasoning: DOC_BEDROCK_MODEL,
      cache: DOC_BEDROCK_MODEL,
      limits: DEFAULT_BEDROCK,
    },
  },
  "claude-sonnet-4.6": {
    id: "claude-sonnet-4.6",
    providerID: bedrockProviderID,
    providerFamily: "bedrock",
    transport: "bedrock_converse",
    auth: "aws_sigv4",
    cache: "none",
    reasoning: "bedrock_converse",
    name: "Claude Sonnet 4.6",
    apiID: "eu.anthropic.claude-sonnet-4-6",
    npm: "@ai-sdk/amazon-bedrock",
    cost: {
      input: 3,
      output: 15,
      cache: { read: 0.3, write: 3.75 },
      tiers: [
        {
          input: 6,
          output: 22.5,
          cache: { read: 0.6, write: 7.5 },
          tier: { type: "context", size: 200_000 },
        },
      ],
      experimentalOver200K: {
        input: 6,
        output: 22.5,
        cache: { read: 0.6, write: 7.5 },
      },
    },
    context: 1_000_000,
    output: 64_000,
    temperature: true,
    attachment: true,
    inputModalities: textImagePdfInput,
    releaseDate: "2026-02-17",
    sources: {
      transport: DOC_BEDROCK_CONVERSE,
      auth: DEFAULT_BEDROCK,
      reasoning: DOC_BEDROCK_MODEL,
      cache: DOC_BEDROCK_MODEL,
      limits: DEFAULT_BEDROCK,
    },
  },
} satisfies Record<string, Contract>

function contractModel(input: Contract, baseURL: string, region: string): Model {
  const result: Model = {
    id: ModelID.make(input.id),
    providerID: input.providerID,
    name: input.name,
    family: input.providerFamily,
    api: {
      id: input.apiID,
      url: input.providerFamily === "foundry" ? baseURL : "",
      npm: input.npm,
    },
    status: "active",
    headers: {},
    options: {
      ...(input.transport === "chat_completions" ? { useCompletionUrls: true } : {}),
      ...(input.providerFamily === "bedrock" ? { region } : {}),
    },
    cost: input.cost,
    limit: {
      context: input.context,
      input: input.input,
      output: input.output,
    },
    capabilities: {
      temperature: input.temperature ?? false,
      reasoning: input.reasoning !== "none",
      attachment: input.attachment ?? false,
      toolcall: true,
      input: input.inputModalities ?? (input.attachment ? textImageInput : textOnly),
      output: textOutput,
      interleaved: input.interleaved ?? false,
    },
    release_date: input.releaseDate,
    variants: {},
  }
  return result
}

export function contract(
  model: Pick<Model, "providerID" | "id"> | { providerID: string; id: string },
): Contract | undefined {
  const match = CONTRACTS[model.id as keyof typeof CONTRACTS]
  if (!match) return
  return match.providerID === model.providerID ? match : undefined
}

export function validationError(model: Pick<Model, "providerID" | "id" | "api" | "options">): string | undefined {
  const resolved = contract(model)
  if (!resolved) return `model is not an approved Synora contract: ${model.providerID}/${model.id}`
  if (model.api.id !== resolved.apiID) return `model API id does not match Synora contract: ${model.api.id}`
  if (model.api.npm !== resolved.npm) return `provider package does not match Synora contract: ${model.api.npm}`
  if (resolved.transport === "responses" && model.options.useCompletionUrls === true) {
    return `transport does not match Synora contract: ${model.id} must use OpenAI Responses`
  }
  if (resolved.transport === "chat_completions" && model.options.useCompletionUrls !== true) {
    return `transport does not match Synora contract: ${model.id} must use OpenAI Chat Completions`
  }
  if (resolved.transport === "bedrock_converse" && model.api.npm !== "@ai-sdk/amazon-bedrock") {
    return `transport does not match Synora contract: ${model.id} must use Bedrock Converse`
  }
}

export function providers(input: Input): Record<ProviderID, Info> {
  const foundryKey =
    input.envs.SYNORA_FOUNDRY_API_KEY ??
    input.envs.AZURE_OPENAI_API_KEY ??
    (input.auths[foundryProviderID]?.type === "api" ? input.auths[foundryProviderID].key : undefined) ??
    (input.auths.azure?.type === "api" ? input.auths.azure.key : undefined)
  const foundryBaseURL = input.envs.SYNORA_FOUNDRY_BASE_URL ?? FOUNDRY_BASE_URL
  const bedrockRegion =
    input.envs.SYNORA_BEDROCK_REGION ?? input.envs.AWS_REGION ?? input.envs.AWS_DEFAULT_REGION ?? BEDROCK_REGION

  const foundry: Info = {
    id: foundryProviderID,
    name: "Synora Foundry",
    source: foundryKey ? "env" : "custom",
    env: ["SYNORA_FOUNDRY_API_KEY", "AZURE_OPENAI_API_KEY"],
    key: foundryKey,
    options: {
      baseURL: foundryBaseURL,
    },
    models: Object.fromEntries(
      Object.values(CONTRACTS)
        .filter((item) => item.providerID === foundryProviderID)
        .map((item) => [item.id, contractModel(item, foundryBaseURL, bedrockRegion)]),
    ),
  }

  const bedrock: Info = {
    id: bedrockProviderID,
    name: "Synora Bedrock",
    source: "custom",
    env: ["AWS_REGION", "AWS_DEFAULT_REGION", "SYNORA_BEDROCK_REGION"],
    options: {
      region: bedrockRegion,
    },
    models: Object.fromEntries(
      Object.values(CONTRACTS)
        .filter((item) => item.providerID === bedrockProviderID)
        .map((item) => [item.id, contractModel(item, foundryBaseURL, bedrockRegion)]),
    ),
  }

  return {
    [foundryProviderID]: foundry,
    [bedrockProviderID]: bedrock,
  }
}

export function options(input: {
  readonly model: Pick<Model, "providerID" | "id">
  readonly sessionID: string
}): Record<string, unknown> {
  const resolved = contract(input.model)
  if (!resolved) return {}

  const result: Record<string, unknown> = {}
  if (resolved.transport === "responses") {
    result.store = false
  }
  if (resolved.cache === "prompt_cache_key") {
    result.promptCacheKey = input.sessionID
  }
  if (resolved.promptCacheRetention) {
    result.promptCacheRetention = resolved.promptCacheRetention
  }
  if (resolved.reasoning === "responses_encrypted") {
    result.include = [...ENCRYPTED_REASONING_INCLUDE]
  }
  return result
}

export function smallOptions(input: { readonly model: Pick<Model, "providerID" | "id"> }) {
  const resolved = contract(input.model)
  if (!resolved) return {}
  const result: Record<string, unknown> = {}
  if (resolved.transport === "responses") {
    result.store = false
  }
  if (resolved.reasoning === "responses_encrypted") {
    result.include = [...ENCRYPTED_REASONING_INCLUDE]
  }
  return result
}

export function sources(input: Pick<Model, "providerID" | "id"> | { providerID: string; id: string }) {
  return contract(input)?.sources
}

export function isSynoraProvider(providerID: string) {
  return providerID === foundryProviderID || providerID === bedrockProviderID
}

export * as SynoraProvider from "./synora"
