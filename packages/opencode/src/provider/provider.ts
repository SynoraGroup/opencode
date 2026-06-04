import path from "path"
import type { LanguageModelV3 } from "@ai-sdk/provider"
import { NoSuchModelError } from "ai"
import { Context, Effect, Layer, Schema, Types } from "effect"
import { serviceUse } from "@opencode-ai/core/effect/service-use"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { Global } from "@opencode-ai/core/global"
import { optionalOmitUndefined } from "@opencode-ai/core/schema"
import type * as ModelsDev from "@opencode-ai/core/models-dev"
import { Auth } from "@/auth"
import { Config } from "@/config/config"
import { Env } from "@/env"
import { InstanceState } from "@/effect/instance-state"
import { isRecord } from "@/util/record"
import { ModelStatus } from "./model-status"
import { ModelID, ProviderID } from "./schema"
import { SynoraProvider } from "./synora"

const ProviderApiInfo = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  npm: Schema.String,
})

const ProviderModalities = Schema.Struct({
  text: Schema.Boolean,
  audio: Schema.Boolean,
  image: Schema.Boolean,
  video: Schema.Boolean,
  pdf: Schema.Boolean,
})

const ProviderInterleaved = Schema.Union([
  Schema.Boolean,
  Schema.Struct({
    field: Schema.Literals(["reasoning_content", "reasoning_details"]),
  }),
])

const ProviderCapabilities = Schema.Struct({
  temperature: Schema.Boolean,
  reasoning: Schema.Boolean,
  attachment: Schema.Boolean,
  toolcall: Schema.Boolean,
  input: ProviderModalities,
  output: ProviderModalities,
  interleaved: ProviderInterleaved,
})

const ProviderCacheCost = Schema.Struct({
  read: Schema.Finite,
  write: Schema.Finite,
})

const ProviderCostTier = Schema.Struct({
  input: Schema.Finite,
  output: Schema.Finite,
  cache: ProviderCacheCost,
  tier: Schema.Struct({
    type: Schema.Literal("context"),
    size: Schema.Finite,
  }),
})

const ProviderCost = Schema.Struct({
  input: Schema.Finite,
  output: Schema.Finite,
  cache: ProviderCacheCost,
  tiers: optionalOmitUndefined(Schema.Array(ProviderCostTier)),
  experimentalOver200K: optionalOmitUndefined(
    Schema.Struct({
      input: Schema.Finite,
      output: Schema.Finite,
      cache: ProviderCacheCost,
    }),
  ),
})

const ProviderLimit = Schema.Struct({
  context: Schema.Finite,
  input: optionalOmitUndefined(Schema.Finite),
  output: Schema.Finite,
})

export const Model = Schema.Struct({
  id: ModelID,
  providerID: ProviderID,
  api: ProviderApiInfo,
  name: Schema.String,
  family: optionalOmitUndefined(Schema.String),
  capabilities: ProviderCapabilities,
  cost: ProviderCost,
  limit: ProviderLimit,
  status: ModelStatus,
  options: Schema.Record(Schema.String, Schema.Any),
  headers: Schema.Record(Schema.String, Schema.String),
  release_date: Schema.String,
  variants: optionalOmitUndefined(Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Any))),
}).annotate({ identifier: "Model" })
export type Model = Types.DeepMutable<Schema.Schema.Type<typeof Model>>

export const Info = Schema.Struct({
  id: ProviderID,
  name: Schema.String,
  source: Schema.Literals(["env", "config", "custom", "api"]),
  env: Schema.Array(Schema.String),
  key: optionalOmitUndefined(Schema.String),
  options: Schema.Record(Schema.String, Schema.Any),
  models: Schema.Record(Schema.String, Model),
}).annotate({ identifier: "Provider" })
export type Info = Types.DeepMutable<Schema.Schema.Type<typeof Info>>

const DefaultModelIDs = Schema.Record(Schema.String, Schema.String)

export const ListResult = Schema.Struct({
  all: Schema.Array(Info),
  default: DefaultModelIDs,
  connected: Schema.Array(Schema.String),
})
export type ListResult = Types.DeepMutable<Schema.Schema.Type<typeof ListResult>>

export const ConfigProvidersResult = Schema.Struct({
  providers: Schema.Array(Info),
  default: DefaultModelIDs,
})
export type ConfigProvidersResult = Types.DeepMutable<Schema.Schema.Type<typeof ConfigProvidersResult>>

export function toPublicInfo(provider: Info): Info {
  return JSON.parse(
    JSON.stringify(provider, (_, value) => {
      if (typeof value === "function" || typeof value === "symbol" || value === undefined) return undefined
      if (typeof value === "bigint") return value.toString()
      return value
    }),
  )
}

export function defaultModelIDs<T extends { models: Record<string, { id: string }> }>(providers: Record<string, T>) {
  return Object.fromEntries(
    Object.entries(providers).map(([id, item]) => [id, sort(Object.values(item.models))[0]?.id]),
  )
}

export class ModelNotFoundError extends Schema.TaggedErrorClass<ModelNotFoundError>()("ProviderModelNotFoundError", {
  providerID: ProviderID,
  modelID: ModelID,
  suggestions: Schema.optional(Schema.Array(Schema.String)),
  cause: Schema.optional(Schema.Defect),
}) {
  static isInstance(input: unknown): input is ModelNotFoundError {
    return input instanceof ModelNotFoundError
  }
}

export class InitError extends Schema.TaggedErrorClass<InitError>()("ProviderInitError", {
  providerID: ProviderID,
  cause: Schema.optional(Schema.Defect),
}) {
  static isInstance(input: unknown): input is InitError {
    return input instanceof InitError
  }
}

export class NoProvidersError extends Schema.TaggedErrorClass<NoProvidersError>()("ProviderNoProvidersError", {}) {
  static isInstance(input: unknown): input is NoProvidersError {
    return input instanceof NoProvidersError
  }
}

export class NoModelsError extends Schema.TaggedErrorClass<NoModelsError>()("ProviderNoModelsError", {
  providerID: ProviderID,
}) {
  static isInstance(input: unknown): input is NoModelsError {
    return input instanceof NoModelsError
  }
}

export type DefaultModelError = ModelNotFoundError | NoProvidersError | NoModelsError
export type Error = ModelNotFoundError | InitError | NoProvidersError | NoModelsError

export interface Interface {
  readonly list: () => Effect.Effect<Record<ProviderID, Info>>
  readonly getProvider: (providerID: ProviderID) => Effect.Effect<Info>
  readonly getModel: (providerID: ProviderID, modelID: ModelID) => Effect.Effect<Model, ModelNotFoundError>
  readonly getLanguage: (model: Model) => Effect.Effect<LanguageModelV3, ModelNotFoundError>
  readonly closest: (
    providerID: ProviderID,
    query: string[],
  ) => Effect.Effect<{ providerID: ProviderID; modelID: string } | undefined>
  readonly getSmallModel: (providerID: ProviderID) => Effect.Effect<Model | undefined>
  readonly defaultModel: () => Effect.Effect<{ providerID: ProviderID; modelID: ModelID }, DefaultModelError>
}

type State = {
  readonly providers: Record<ProviderID, Info>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Provider") {}

export const use = serviceUse(Service)

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* AppFileSystem.Service
    const config = yield* Config.Service
    const auth = yield* Auth.Service
    const env = yield* Env.Service

    const state = yield* InstanceState.make<State>(() =>
      Effect.gen(function* () {
        return {
          providers: SynoraProvider.providers({
            envs: yield* env.all(),
            auths: yield* auth.all().pipe(Effect.orDie),
          }),
        }
      }),
    )

    const list = Effect.fn("Provider.list")(() => InstanceState.use(state, (s) => s.providers))

    const getProvider = Effect.fn("Provider.getProvider")(function* (providerID: ProviderID) {
      const provider = (yield* InstanceState.get(state)).providers[providerID]
      if (provider) return provider
      return yield* Effect.die(new Error(`Unknown Synora provider: ${providerID}`))
    })

    const getModel = Effect.fn("Provider.getModel")(function* (providerID: ProviderID, modelID: ModelID) {
      const provider = (yield* InstanceState.get(state)).providers[providerID]
      const model = provider?.models[modelID]
      if (model) return model
      return yield* new ModelNotFoundError({
        providerID,
        modelID,
        suggestions: provider
          ? modelSuggestions(provider, modelID)
          : providerSuggestions(yield* InstanceState.get(state), providerID),
      })
    })

    const getLanguage = Effect.fn("Provider.getLanguage")(function* (model: Model) {
      return yield* new ModelNotFoundError({
        providerID: model.providerID,
        modelID: model.id,
        cause: new NoSuchModelError({ modelId: `${model.providerID}/${model.id}`, modelType: "languageModel" }),
      })
    })

    const closest = Effect.fn("Provider.closest")(function* (providerID: ProviderID, query: string[]) {
      const provider = (yield* InstanceState.get(state)).providers[providerID]
      if (!provider) return undefined
      for (const item of query) {
        const modelID = Object.keys(provider.models).find((id) => id.toLowerCase().includes(item.toLowerCase()))
        if (modelID) return { providerID, modelID }
      }
      return undefined
    })

    const getSmallModel = Effect.fn("Provider.getSmallModel")(function* (providerID: ProviderID) {
      const cfg = yield* config.get()
      if (cfg.small_model) {
        const parsed = parseModel(cfg.small_model)
        return yield* getModel(parsed.providerID, parsed.modelID).pipe(
          Effect.catchTag("ProviderModelNotFoundError", () => Effect.succeed(undefined)),
        )
      }
      return (yield* InstanceState.get(state)).providers[providerID]?.models["claude-sonnet-4.6"]
    })

    const defaultModel = Effect.fn("Provider.defaultModel")(function* () {
      const cfg = yield* config.get()
      if (cfg.model) return parseModel(cfg.model)

      const s = yield* InstanceState.get(state)
      const recent = yield* fs.readJson(path.join(Global.Path.state, "model.json")).pipe(
        Effect.map((x): { providerID: ProviderID; modelID: ModelID }[] => {
          if (!isRecord(x) || !Array.isArray(x.recent)) return []
          return x.recent.flatMap((item) => {
            if (!isRecord(item)) return []
            if (typeof item.providerID !== "string") return []
            if (typeof item.modelID !== "string") return []
            return [{ providerID: ProviderID.make(item.providerID), modelID: ModelID.make(item.modelID) }]
          })
        }),
        Effect.catch(() => Effect.succeed([] as { providerID: ProviderID; modelID: ModelID }[])),
      )
      const restored = recent.find((entry) => s.providers[entry.providerID]?.models[entry.modelID])
      if (restored) return restored

      const provider = s.providers[ProviderID.make("synora-foundry")] ?? Object.values(s.providers)[0]
      if (!provider) return yield* new NoProvidersError()
      const model = provider.models["gpt-5.4"] ?? sort(Object.values(provider.models))[0]
      if (!model) return yield* new NoModelsError({ providerID: provider.id })
      return { providerID: provider.id, modelID: model.id }
    })

    return Service.of({ list, getProvider, getModel, getLanguage, closest, getSmallModel, defaultModel })
  }),
)

export const defaultLayer = Layer.suspend(() =>
  layer.pipe(
    Layer.provide(AppFileSystem.defaultLayer),
    Layer.provide(Env.defaultLayer),
    Layer.provide(Config.defaultLayer),
    Layer.provide(Auth.defaultLayer),
  ),
)

const priority = ["gpt-5.4", "gpt-5.3-codex", "claude-opus-4.6", "claude-sonnet-4.6"]

export function sort<T extends { id: string }>(models: T[]) {
  return [...models].sort((a, b) => {
    const aPriority = priority.findIndex((item) => a.id.includes(item))
    const bPriority = priority.findIndex((item) => b.id.includes(item))
    if (aPriority !== bPriority) return normalizePriority(aPriority) - normalizePriority(bPriority)
    return b.id.localeCompare(a.id)
  })
}

export function parseModel(model: string) {
  const [providerID, ...rest] = model.split("/")
  return {
    providerID: ProviderID.make(providerID),
    modelID: ModelID.make(rest.join("/")),
  }
}

export function fromModelsDevProvider(provider: ModelsDev.Provider): Info {
  const models = Object.fromEntries(
    Object.entries(provider.models).map(([id, item]) => [
      id,
      {
        id: ModelID.make(id),
        providerID: ProviderID.make(provider.id),
        api: {
          id,
          url: item.provider?.api ?? provider.api ?? "",
          npm: item.provider?.npm ?? provider.npm ?? "",
        },
        name: item.name,
        family: item.family,
        capabilities: {
          temperature: item.temperature ?? false,
          reasoning: item.reasoning ?? false,
          attachment: item.attachment ?? false,
          toolcall: item.tool_call ?? true,
          input: modalities(item.modalities?.input ?? []),
          output: modalities(item.modalities?.output ?? []),
          interleaved: item.interleaved ?? false,
        },
        cost: {
          input: item.cost?.input ?? 0,
          output: item.cost?.output ?? 0,
          cache: {
            read: item.cost?.cache_read ?? 0,
            write: item.cost?.cache_write ?? 0,
          },
        },
        limit: {
          context: item.limit.context,
          input: item.limit.input,
          output: item.limit.output,
        },
        status: item.status ?? "active",
        options: {},
        headers: {},
        release_date: item.release_date ?? "",
        variants: {},
      } satisfies Model,
    ]),
  )
  return {
    id: ProviderID.make(provider.id),
    name: provider.name,
    source: "custom",
    env: [...(provider.env ?? [])],
    options: {},
    models,
  }
}

export function enrichAzureFoundryCatalog(providers: Record<string, ModelsDev.Provider>) {
  return providers
}

function normalizePriority(value: number) {
  return value === -1 ? Number.MAX_SAFE_INTEGER : value
}

function providerSuggestions(state: State, providerID: ProviderID) {
  return Object.keys(state.providers).filter((id) => id.includes(providerID))
}

function modelSuggestions(provider: Info, modelID: ModelID) {
  return Object.keys(provider.models)
    .filter((id) => id.toLowerCase().includes(modelID.toLowerCase()))
    .slice(0, 3)
}

function modalities(items: readonly string[]) {
  return {
    text: items.includes("text"),
    audio: items.includes("audio"),
    image: items.includes("image"),
    video: items.includes("video"),
    pdf: items.includes("pdf"),
  }
}

export * as Provider from "./provider"
