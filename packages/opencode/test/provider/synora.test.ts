import { describe, expect, test } from "bun:test"
import { SynoraProvider } from "../../src/provider/synora"
import { ProviderTransform } from "../../src/provider/transform"
import { ProviderID } from "../../src/provider/schema"

const foundryID = ProviderID.make("synora-foundry")
const bedrockID = ProviderID.make("synora-bedrock")

describe("Synora provider contract", () => {
  test("exposes only approved Foundry and Bedrock providers", () => {
    const providers = SynoraProvider.providers({
      envs: {
        SYNORA_FOUNDRY_API_KEY: "foundry-key",
        SYNORA_BEDROCK_REGION: "eu-central-1",
      },
      auths: {},
    })

    expect(Object.keys(providers).sort()).toEqual(["synora-bedrock", "synora-foundry"])
    expect(Object.keys(providers[foundryID].models).sort()).toEqual([
      "DeepSeek-V4-Flash",
      "DeepSeek-V4-Pro",
      "Kimi-K2.6",
      "gpt-5.3-codex",
      "gpt-5.4",
    ])
    expect(Object.keys(providers[bedrockID].models).sort()).toEqual(["claude-opus-4.6", "claude-sonnet-4.6"])
  })

  test("publishes nonzero pricing, cache costs, limits, and modality metadata", () => {
    const providers = SynoraProvider.providers({ envs: {}, auths: {} })
    const foundry = providers[foundryID]
    const bedrock = providers[bedrockID]

    expect(foundry.models["gpt-5.4"].cost).toMatchObject({
      input: 2.5,
      output: 15,
      cache: { read: 0.25, write: 0 },
    })
    expect(foundry.models["gpt-5.4"].cost.tiers?.[0]).toMatchObject({
      input: 5,
      output: 22.5,
      cache: { read: 0.5, write: 0 },
      tier: { type: "context", size: 272_000 },
    })
    expect(foundry.models["gpt-5.4"].limit).toEqual({ context: 1_050_000, input: 922_000, output: 128_000 })
    expect(foundry.models["gpt-5.4"].capabilities.input.pdf).toBe(true)

    expect(foundry.models["DeepSeek-V4-Pro"].cost).toMatchObject({
      input: 1.74,
      output: 3.48,
      cache: { read: 0.145, write: 0 },
    })
    expect(foundry.models["DeepSeek-V4-Pro"].limit.output).toBe(384_000)
    expect(foundry.models["DeepSeek-V4-Pro"].capabilities.temperature).toBe(true)

    expect(foundry.models["Kimi-K2.6"].cost).toMatchObject({
      input: 0.95,
      output: 4,
      cache: { read: 0.16, write: 0 },
    })
    expect(foundry.models["Kimi-K2.6"].limit.output).toBe(262_144)
    expect(foundry.models["Kimi-K2.6"].capabilities.input.video).toBe(true)

    expect(bedrock.models["claude-opus-4.6"].cost).toMatchObject({
      input: 5,
      output: 25,
      cache: { read: 0.5, write: 6.25 },
    })
    expect(bedrock.models["claude-opus-4.6"].cost.tiers?.[0]).toMatchObject({
      input: 10,
      output: 37.5,
      cache: { read: 1, write: 12.5 },
      tier: { type: "context", size: 200_000 },
    })
    expect(bedrock.models["claude-sonnet-4.6"].cost).toMatchObject({
      input: 3,
      output: 15,
      cache: { read: 0.3, write: 3.75 },
    })
  })

  test("routes Foundry GPT deployments to Responses and partner deployments to chat completions", () => {
    const foundry = SynoraProvider.providers({ envs: {}, auths: {} })[foundryID]

    expect(foundry.models["gpt-5.4"].options.useCompletionUrls).toBeUndefined()
    expect(foundry.models["gpt-5.3-codex"].options.useCompletionUrls).toBeUndefined()
    expect(foundry.models["DeepSeek-V4-Pro"].options.useCompletionUrls).toBe(true)
    expect(foundry.models["DeepSeek-V4-Flash"].options.useCompletionUrls).toBe(true)
    expect(foundry.models["Kimi-K2.6"].options.useCompletionUrls).toBe(true)
  })

  test("emits only explicit Responses options for approved Foundry GPT models", () => {
    const foundry = SynoraProvider.providers({ envs: {}, auths: {} })[foundryID]

    expect(
      SynoraProvider.options({
        model: foundry.models["gpt-5.4"],
        sessionID: "session-1",
      }),
    ).toEqual({
      store: false,
      promptCacheKey: "session-1",
      promptCacheRetention: "24h",
      include: ["reasoning.encrypted_content"],
    })
    expect(
      SynoraProvider.options({
        model: foundry.models["gpt-5.3-codex"],
        sessionID: "session-2",
      }),
    ).toEqual({
      store: false,
      promptCacheKey: "session-2",
      promptCacheRetention: "24h",
      include: ["reasoning.encrypted_content"],
    })
  })

  test("does not invent cache or reasoning options for Foundry chat models and Bedrock Converse models", () => {
    const providers = SynoraProvider.providers({ envs: {}, auths: {} })

    expect(
      SynoraProvider.options({
        model: providers[foundryID].models["DeepSeek-V4-Pro"],
        sessionID: "session-3",
      }),
    ).toEqual({})
    expect(
      SynoraProvider.options({
        model: providers[foundryID].models["Kimi-K2.6"],
        sessionID: "session-4",
      }),
    ).toEqual({})
    expect(
      SynoraProvider.options({
        model: providers[bedrockID].models["claude-sonnet-4.6"],
        sessionID: "session-5",
      }),
    ).toEqual({})
  })

  test("publishes documented reasoning and thinking variants", () => {
    const providers = SynoraProvider.providers({ envs: {}, auths: {} })

    expect(Object.keys(providers[foundryID].models["gpt-5.4"].variants ?? {})).toEqual([
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
    ])
    expect(providers[foundryID].models["gpt-5.4"].variants?.xhigh).toEqual({
      reasoningEffort: "xhigh",
      reasoningSummary: "auto",
    })

    expect(providers[foundryID].models["DeepSeek-V4-Pro"].variants).toEqual({
      disabled: { thinking: { type: "disabled" } },
      high: { thinking: { type: "enabled" }, reasoningEffort: "high" },
      max: { thinking: { type: "enabled" }, reasoningEffort: "max" },
    })
    expect(providers[foundryID].models["Kimi-K2.6"].variants).toEqual({
      disabled: { thinking: { type: "disabled" } },
    })

    expect(providers[bedrockID].models["claude-opus-4.6"].variants?.max).toEqual({
      bedrock: { thinking: { type: "adaptive" }, output_config: { effort: "max" } },
    })
    expect(providers[bedrockID].models["claude-sonnet-4.6"].variants).not.toHaveProperty("max")

    expect(
      ProviderTransform.providerOptions(
        providers[foundryID].models["DeepSeek-V4-Pro"],
        providers[foundryID].models["DeepSeek-V4-Pro"].variants?.max ?? {},
      ),
    ).toEqual({ openai: { thinking: { type: "enabled" }, reasoningEffort: "max" } })
    expect(
      ProviderTransform.providerOptions(
        providers[bedrockID].models["claude-opus-4.6"],
        providers[bedrockID].models["claude-opus-4.6"].variants?.high ?? {},
      ),
    ).toEqual({ bedrock: { thinking: { type: "adaptive" }, output_config: { effort: "high" } } })
  })

  test("tracks per-contract provenance for transport, auth, reasoning, cache, and limits", () => {
    const foundry = SynoraProvider.providers({ envs: {}, auths: {} })[foundryID]
    const sources = SynoraProvider.sources(foundry.models["gpt-5.4"])

    expect(sources).toEqual({
      transport: { kind: "official-doc", detail: "azure-openai-responses" },
      auth: { kind: "deployment-default", detail: "nps-foundry default base url" },
      reasoning: { kind: "official-doc", detail: "azure-openai-reasoning" },
      cache: { kind: "official-doc", detail: "azure-openai-prompt-caching" },
      limits: { kind: "deployment-default", detail: "nps-foundry default base url" },
    })
  })

  test("rejects unapproved model IDs", () => {
    const providers = SynoraProvider.providers({ envs: {}, auths: {} })

    expect(SynoraProvider.contract({ providerID: foundryID, id: "claude-opus-4.7" })).toBeUndefined()
    expect(SynoraProvider.contract({ providerID: bedrockID, id: "claude-sonnet-4-7" })).toBeUndefined()
    expect(SynoraProvider.contract({ providerID: foundryID, id: "unknown-model" })).toBeUndefined()
    expect(SynoraProvider.contract({ providerID: bedrockID, id: "unknown-model" })).toBeUndefined()
  })

  test("rejects right model on wrong provider", () => {
    expect(SynoraProvider.contract({ providerID: foundryID, id: "claude-sonnet-4.6" })).toBeUndefined()
    expect(SynoraProvider.contract({ providerID: bedrockID, id: "gpt-5.4" })).toBeUndefined()
  })

  test("smallOptions preserves store:false and encrypted reasoning for Foundry GPT", () => {
    const foundry = SynoraProvider.providers({ envs: {}, auths: {} })[foundryID]

    const opts = SynoraProvider.smallOptions({ model: foundry.models["gpt-5.4"] })
    expect(opts).toEqual({
      store: false,
      include: ["reasoning.encrypted_content"],
    })
  })

  test("smallOptions returns empty for Foundry chat models and Bedrock models", () => {
    const providers = SynoraProvider.providers({ envs: {}, auths: {} })

    expect(SynoraProvider.smallOptions({ model: providers[foundryID].models["DeepSeek-V4-Pro"] })).toEqual({})
    expect(SynoraProvider.smallOptions({ model: providers[bedrockID].models["claude-sonnet-4.6"] })).toEqual({})
  })
})
