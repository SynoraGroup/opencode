import { describe, expect, test } from "bun:test"
import { ToolFailure } from "@opencode-ai/llm"
import { Auth as RouteAuth, Auth as RuntimeAuth, LLMClient, RequestExecutor, WebSocketExecutor } from "@opencode-ai/llm/route"
import { jsonSchema, tool, type ModelMessage, type Tool } from "ai"
import { Effect, Layer, Stream } from "effect"
import { Headers } from "effect/unstable/http"
import { LLMNative } from "@/session/llm/native-request"
import { LLMNativeRuntime } from "@/session/llm/native-runtime"
import type { Provider } from "@/provider/provider"
import { ModelID, ProviderID } from "@/provider/schema"
import { testEffect } from "../lib/effect"

const baseModel: Provider.Model = {
  id: ModelID.make("gpt-5.4"),
  providerID: ProviderID.make("synora-foundry"),
  api: {
    id: "gpt-5.4",
    url: "https://nps-foundry.services.ai.azure.com/openai/v1",
    npm: "@ai-sdk/azure",
  },
  name: "GPT-5.4",
  capabilities: {
    temperature: true,
    reasoning: true,
    attachment: true,
    toolcall: true,
    input: {
      text: true,
      audio: false,
      image: true,
      video: false,
      pdf: false,
    },
    output: {
      text: true,
      audio: false,
      image: false,
      video: false,
      pdf: false,
    },
    interleaved: false,
  },
  cost: {
    input: 0,
    output: 0,
    cache: {
      read: 0,
      write: 0,
    },
  },
  limit: {
    context: 1_050_000,
    input: undefined,
    output: 128_000,
  },
  status: "active",
  options: {},
  headers: {
    "x-model": "model-header",
  },
  release_date: "2026-01-01",
}

const providerInfo: Provider.Info = {
  id: ProviderID.make("openai"),
  name: "OpenAI",
  source: "config",
  env: ["OPENAI_API_KEY"],
  options: { apiKey: "test-openai-key" },
  models: {},
}

const synoraProviderInfo: Provider.Info = {
  id: ProviderID.make("synora-foundry"),
  name: "Synora Foundry",
  source: "env",
  env: ["SYNORA_FOUNDRY_API_KEY"],
  options: { apiKey: "test-foundry-key", baseURL: "https://nps-foundry.services.ai.azure.com/openai/v1" },
  models: {},
}

const it = testEffect(
  LLMClient.layer.pipe(Layer.provide(Layer.mergeAll(RequestExecutor.defaultLayer, WebSocketExecutor.layer))),
)

function responsesStream(chunks: unknown[]) {
  return new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}`).join("\n\n") + "\n\n", {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  })
}

type NativeRequestInput = Parameters<typeof LLMNative.request>[0]

const sessionText = (text: string) => ({ type: "text" as const, text })

const sessionOpenAIReasoning = (
  text: string,
  options: {
    readonly storedAs: "providerMetadata" | "providerOptions"
    readonly itemId: string
    readonly encryptedContent: string | null
  },
) => {
  const metadata = {
    openai: { itemId: options.itemId, reasoningEncryptedContent: options.encryptedContent },
  }
  if (options.storedAs === "providerMetadata")
    return Object.assign({ type: "reasoning" as const, text }, { providerMetadata: metadata })
  return Object.assign({ type: "reasoning" as const, text }, { providerOptions: metadata })
}

type SessionAssistantPart = ReturnType<typeof sessionText> | ReturnType<typeof sessionOpenAIReasoning>

const storedSession = {
  user: (content: string): ModelMessage => ({ role: "user", content }),
  assistant: (content: SessionAssistantPart[]): ModelMessage => ({ role: "assistant", content }),
  text: sessionText,
  openaiReasoning: sessionOpenAIReasoning,
}

const openAIResponses = {
  user: (text: string) => ({ role: "user", content: [{ type: "input_text", text }] }),
  assistant: (text: string) => ({ role: "assistant", content: [{ type: "output_text", text }] }),
  openaiReasoning: (text: string, options: { readonly itemId: string; readonly encryptedContent: string }) => ({
    type: "reasoning",
    id: options.itemId,
    encrypted_content: options.encryptedContent,
    summary: [{ type: "summary_text", text }],
  }),
}

const prepareNativeRequest = (input: NativeRequestInput) => LLMClient.prepare(LLMNative.request(input))

const expectOpenAIResponsesRequest = (input: {
  readonly history: NativeRequestInput["messages"]
  readonly providerOptions?: NativeRequestInput["providerOptions"]
  readonly maxOutputTokens?: NativeRequestInput["maxOutputTokens"]
  readonly headers?: NativeRequestInput["headers"]
  readonly expectedBody: unknown
}) =>
  Effect.gen(function* () {
    expect(
      yield* prepareNativeRequest({
        model: baseModel,
        apiKey: "test-openai-key",
        messages: input.history,
        providerOptions: input.providerOptions,
        maxOutputTokens: input.maxOutputTokens,
        headers: input.headers,
      }),
    ).toMatchObject({
      route: "azure-openai-responses",
      protocol: "openai-responses",
      body: input.expectedBody,
    })
  })

describe("session.llm-native.request", () => {
  test("maps normalized stream inputs to a native LLM request", () => {
    const messages: ModelMessage[] = [
      {
        role: "system",
        content: "system from messages",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "hello", providerOptions: { openai: { cacheControl: { type: "ephemeral" } } } },
          { type: "file", mediaType: "image/png", filename: "img.png", data: "data:image/png;base64,Zm9v" },
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "thinking", providerOptions: { openai: { encryptedContent: "secret" } } },
          { type: "text", text: "I'll run it" },
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "bash",
            input: { command: "ls" },
            providerOptions: { openai: { itemId: "item-1" } },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "bash",
            output: { type: "text", value: "ok" },
            providerOptions: { openai: { outputId: "output-1" } },
          },
        ],
      },
    ]

    const request = LLMNative.request({
      model: baseModel,
      system: ["agent system"],
      messages,
      tools: {
        bash: tool({
          description: "Run a shell command",
          inputSchema: jsonSchema({
            type: "object",
            properties: {
              command: { type: "string" },
            },
            required: ["command"],
          }),
        }),
      },
      toolChoice: "required",
      temperature: 0.2,
      topP: 0.9,
      topK: 40,
      maxOutputTokens: 1024,
      providerOptions: { openai: { store: false } },
      headers: { "x-request": "request-header" },
    })

    expect(request.model).toMatchObject({
      id: "gpt-5.4",
      provider: "azure",
      route: { id: "azure-openai-responses" },
    })
    expect(request.model.route.endpoint.baseURL).toBe("https://nps-foundry.services.ai.azure.com/openai/v1")
    expect(request.model.route.defaults.headers).toEqual({
      "x-model": "model-header",
      "x-request": "request-header",
    })
    expect(request.model.route.defaults.limits).toMatchObject({
      context: 1_050_000,
      output: 128_000,
    })
    expect(request.system).toEqual([
      { type: "text", text: "agent system" },
      { type: "text", text: "system from messages" },
    ])
    expect(request.generation).toMatchObject({
      temperature: 0.2,
      topP: 0.9,
      topK: 40,
      maxTokens: 1024,
    })
    expect(request.providerOptions).toEqual({ openai: { store: false } })
    expect(request.toolChoice).toMatchObject({ type: "required" })
    expect(request.tools).toMatchObject([
      {
        name: "bash",
        description: "Run a shell command",
        inputSchema: {
          type: "object",
          properties: {
            command: { type: "string" },
          },
          required: ["command"],
        },
      },
    ])
    expect(request.messages).toMatchObject([
      {
        role: "user",
        content: [
          { type: "text", text: "hello", providerMetadata: { openai: { cacheControl: { type: "ephemeral" } } } },
          { type: "media", mediaType: "image/png", filename: "img.png", data: "data:image/png;base64,Zm9v" },
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "thinking", providerMetadata: { openai: { encryptedContent: "secret" } } },
          { type: "text", text: "I'll run it" },
          {
            type: "tool-call",
            id: "call-1",
            name: "bash",
            input: { command: "ls" },
            providerMetadata: { openai: { itemId: "item-1" } },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            id: "call-1",
            name: "bash",
            result: { type: "text", value: "ok" },
            providerMetadata: { openai: { outputId: "output-1" } },
          },
        ],
      },
    ])
  })

  test("maps stored provider metadata to native content metadata", () => {
    const reasoning = Object.assign(
      { type: "reasoning" as const, text: "thinking" },
      {
        providerMetadata: {
          openai: {
            itemId: "rs_1",
            reasoningEncryptedContent: "encrypted-state",
          },
        },
      },
    )
    const request = LLMNative.request({
      model: baseModel,
      messages: [
        {
          role: "assistant",
          content: [reasoning],
        },
      ],
    })

    expect(request.messages).toMatchObject([
      {
        role: "assistant",
        content: [
          {
            type: "reasoning",
            text: "thinking",
            providerMetadata: { openai: { itemId: "rs_1", reasoningEncryptedContent: "encrypted-state" } },
          },
        ],
      },
    ])
  })

  test("selects native request routes for Synora provider families", () => {
    const synoraResponses = LLMNative.model({
      model: baseModel,
      apiKey: "test-key",
      messages: [],
    })
    expect(synoraResponses.route.id).toBe("azure-openai-responses")
    expect(synoraResponses.route.endpoint.baseURL).toBe("https://nps-foundry.services.ai.azure.com/openai/v1")

    const synoraChat = LLMNative.model({
      model: {
        ...baseModel,
        id: ModelID.make("DeepSeek-V4-Pro"),
        api: {
          id: "DeepSeek-V4-Pro",
          url: "https://nps-foundry.services.ai.azure.com/openai/v1",
          npm: "@ai-sdk/azure",
        },
        options: { useCompletionUrls: true },
      },
      apiKey: "test-key",
      messages: [],
    })
    expect(synoraChat.route.id).toBe("azure-openai-chat")

    const bedrock = LLMNative.model({
      model: {
        ...baseModel,
        id: ModelID.make("claude-sonnet-4.6"),
        providerID: ProviderID.make("synora-bedrock"),
        api: { id: "eu.anthropic.claude-sonnet-4-6", url: "", npm: "@ai-sdk/amazon-bedrock" },
        options: { region: "eu-central-1" },
      },
      messages: [],
    })
    expect(bedrock.route.id).toBe("bedrock-converse")
  })

  it.effect("threads Synora Foundry bearer auth through the Azure native route", () =>
    Effect.gen(function* () {
      const request = LLMNative.request({
        model: {
          ...baseModel,
          id: ModelID.make("gpt-5.4"),
          providerID: ProviderID.make("synora-foundry"),
          api: {
            id: "gpt-5.4",
            url: "https://nps-foundry.services.ai.azure.com/openai/v1",
            npm: "@ai-sdk/azure",
          },
          options: {},
        },
        auth: RuntimeAuth.bearer("entra-access-token"),
        messages: [{ role: "user", content: "hello" }],
      })

      const headers = yield* request.model.route.auth.apply({
        request,
        method: "POST",
        url: "https://nps-foundry.services.ai.azure.com/openai/v1/responses?api-version=v1",
        body: "{}",
        headers: Headers.empty,
      })

      expect(headers.authorization).toBe("Bearer entra-access-token")
      expect(headers["api-key"]).toBeUndefined()
    }),
  )

  test("fails fast for unsupported provider packages", () => {
    expect(() =>
      LLMNative.request({
        model: { ...baseModel, api: { ...baseModel.api, npm: "unknown-provider" } },
        messages: [],
      }),
    ).toThrow("Native LLM request adapter does not support provider package unknown-provider")
  })

  test("only enables native runtime for supported Synora models, rejects non-Synora providers", () => {
    const synoraFoundry = {
      ...baseModel,
      id: ModelID.make("gpt-5.4"),
      providerID: ProviderID.make("synora-foundry"),
      api: { id: "gpt-5.4", url: "https://nps-foundry.services.ai.azure.com/openai/v1", npm: "@ai-sdk/azure" },
      options: {},
    }
    expect(LLMNativeRuntime.status({ model: synoraFoundry, provider: synoraProviderInfo, auth: undefined })).toMatchObject({
      type: "supported",
      apiKey: "test-foundry-key",
    })
    expect(
      LLMNativeRuntime.status({
        model: { ...baseModel, providerID: ProviderID.make("openai") },
        provider: { ...providerInfo, id: ProviderID.make("openai") },
        auth: undefined,
      }),
    ).toEqual({ type: "unsupported", reason: "provider is not a synora provider" })
    expect(
      LLMNativeRuntime.status({
        model: { ...baseModel, providerID: ProviderID.make("opencode") },
        provider: { ...providerInfo, id: ProviderID.make("opencode") },
        auth: undefined,
      }),
    ).toEqual({ type: "unsupported", reason: "provider is not a synora provider" })
    expect(
      LLMNativeRuntime.status({
        model: { ...baseModel, providerID: ProviderID.make("google") },
        provider: { ...providerInfo, id: ProviderID.make("google") },
        auth: undefined,
      }),
    ).toEqual({ type: "unsupported", reason: "provider is not a synora provider" })
    expect(
      LLMNativeRuntime.status({
        model: {
          ...baseModel,
          id: ModelID.make("claude-sonnet-4.6"),
          providerID: ProviderID.make("synora-bedrock"),
          api: { id: "eu.anthropic.claude-sonnet-4-6", url: "", npm: "@ai-sdk/amazon-bedrock" },
          options: { region: "eu-central-1" },
        },
        provider: { ...synoraProviderInfo, id: ProviderID.make("synora-bedrock"), options: {} },
        auth: { type: "oauth", refresh: "refresh", access: "access", expires: 1 },
      }),
    ).toEqual({ type: "unsupported", reason: "OAuth auth requires a synora provider with azure sdk" })

    const synoraOauth = LLMNativeRuntime.status({
      model: {
        ...baseModel,
        id: ModelID.make("gpt-5.4"),
        providerID: ProviderID.make("synora-foundry"),
        api: {
          id: "gpt-5.4",
          url: "https://nps-foundry.services.ai.azure.com/openai/v1",
          npm: "@ai-sdk/azure",
        },
      },
      provider: {
        id: ProviderID.make("synora-foundry"),
        name: "Synora Foundry",
        source: "custom",
        env: [],
        options: { baseURL: "https://nps-foundry.services.ai.azure.com/openai/v1" },
        models: {},
      },
      auth: { type: "oauth", refresh: "refresh", access: "entra-access-token", expires: 1 },
    })
    expect(synoraOauth.type).toBe("supported")
    if (synoraOauth.type === "supported") {
      expect(synoraOauth.apiKey).toBeUndefined()
      expect(synoraOauth.routeAuth).toBeDefined()
    }

    expect(
      LLMNativeRuntime.status({
        model: { ...baseModel, api: { ...baseModel.api, npm: "@ai-sdk/google" }, providerID: ProviderID.make("synora-foundry") },
        provider: synoraProviderInfo,
        auth: undefined,
      }),
    ).toEqual({ type: "unsupported", reason: "provider package does not match Synora contract: @ai-sdk/google" })

    expect(
      LLMNativeRuntime.status({
        model: synoraFoundry,
        provider: { ...synoraProviderInfo, options: {} },
        auth: undefined,
      }),
    ).toEqual({ type: "unsupported", reason: "API key is not configured" })
  })

  test("rejects Synora models that do not match an approved contract", () => {
    expect(
      LLMNativeRuntime.status({
        model: {
          ...baseModel,
          id: ModelID.make("gpt-5.4"),
          providerID: ProviderID.make("synora-foundry"),
          api: { id: "gpt-5.4", url: "https://nps-foundry.services.ai.azure.com/openai/v1", npm: "@ai-sdk/azure" },
          options: { useCompletionUrls: true },
        },
        provider: synoraProviderInfo,
        auth: undefined,
      }),
    ).toEqual({
      type: "unsupported",
      reason: "transport does not match Synora contract: gpt-5.4 must use OpenAI Responses",
    })

    expect(
      LLMNativeRuntime.status({
        model: {
          ...baseModel,
          id: ModelID.make("gpt-5.4-shadow"),
          providerID: ProviderID.make("synora-foundry"),
          api: { id: "gpt-5.4-shadow", url: "https://nps-foundry.services.ai.azure.com/openai/v1", npm: "@ai-sdk/azure" },
          options: {},
        },
        provider: synoraProviderInfo,
        auth: undefined,
      }),
    ).toEqual({
      type: "unsupported",
      reason: "model is not an approved Synora contract: synora-foundry/gpt-5.4-shadow",
    })
  })

  test("enables native runtime for Synora Bedrock models", () => {
    expect(
      LLMNativeRuntime.status({
        model: {
          ...baseModel,
          id: ModelID.make("claude-sonnet-4.6"),
          providerID: ProviderID.make("synora-bedrock"),
          api: { id: "eu.anthropic.claude-sonnet-4-6", url: "", npm: "@ai-sdk/amazon-bedrock" },
          options: { region: "eu-central-1" },
        },
        provider: {
          ...providerInfo,
          id: ProviderID.make("synora-bedrock"),
          name: "Synora Bedrock",
          env: ["AWS_REGION"],
          options: { region: "eu-central-1" },
        },
        auth: undefined,
      }),
    ).toMatchObject({ type: "supported" })
  })

  test("prefers provider options api key over stored auth key", () => {
    const synoraFoundry = {
      ...baseModel,
      id: ModelID.make("gpt-5.4"),
      providerID: ProviderID.make("synora-foundry"),
      api: { id: "gpt-5.4", url: "https://nps-foundry.services.ai.azure.com/openai/v1", npm: "@ai-sdk/azure" },
      options: {},
    }
    expect(
      LLMNativeRuntime.status({
        model: synoraFoundry,
        provider: {
          ...synoraProviderInfo,
          options: { apiKey: "console-token", baseURL: "https://nps-foundry.services.ai.azure.com/openai/v1" },
          key: "stored-key",
        },
        auth: { type: "api", key: "stored-key" },
      }),
    ).toMatchObject({
      type: "supported",
      apiKey: "console-token",
    })
    expect(
      LLMNativeRuntime.status({
        model: synoraFoundry,
        provider: { ...synoraProviderInfo, options: {}, key: "provider-key" },
        auth: undefined,
      }),
    ).toMatchObject({
      type: "supported",
      apiKey: "provider-key",
    })
  })

  test("constructs Synora Foundry responses request", () => {
    const request = LLMNative.request({
      model: {
        ...baseModel,
        id: ModelID.make("gpt-5.4"),
        providerID: ProviderID.make("synora-foundry"),
        api: { id: "gpt-5.4", url: "https://nps-foundry.services.ai.azure.com/openai/v1", npm: "@ai-sdk/azure" },
        options: {},
      },
      messages: [{ role: "user", content: "hello" }],
      headers: {},
    })

    expect(request.model.route.id).toContain("azure")
    expect(request.model.route.endpoint.baseURL).toBe("https://nps-foundry.services.ai.azure.com/openai/v1")
  })
})
