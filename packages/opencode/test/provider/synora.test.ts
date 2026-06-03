import { describe, expect, test } from "bun:test"
import { SynoraProvider } from "../../src/provider/synora"
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

  test("keeps Synora variants empty until a documented control is encoded explicitly", () => {
    const providers = SynoraProvider.providers({ envs: {}, auths: {} })

    expect(providers[foundryID].models["gpt-5.4"].variants).toEqual({})
    expect(providers[foundryID].models["DeepSeek-V4-Pro"].variants).toEqual({})
    expect(providers[bedrockID].models["claude-opus-4.6"].variants).toEqual({})
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
})
