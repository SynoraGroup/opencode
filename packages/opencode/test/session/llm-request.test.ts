import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import type { Plugin } from "@/plugin"
import type { RuntimeFlags } from "@/effect/runtime-flags"
import { ProviderID } from "@/provider/schema"
import { SynoraProvider } from "@/provider/synora"
import { LLMRequestPrep } from "@/session/llm/request"
import { MessageID, SessionID } from "@/session/schema"

const passthroughPlugin: Plugin.Interface = {
  trigger: (_name, _input, output) => Effect.succeed(output),
  list: () => Effect.succeed([]),
  init: () => Effect.void,
}

const flags = {
  autoShare: false,
  pure: false,
  disableDefaultPlugins: true,
  disableChannelDb: false,
  disableEmbeddedWebUi: true,
  disableExternalSkills: false,
  disableLspDownload: false,
  skipMigrations: false,
  disableClaudeCodePrompt: false,
  disableClaudeCodeSkills: false,
  enableExa: false,
  enableParallel: false,
  enableExperimentalModels: false,
  enableQuestionTool: false,
  experimentalScout: false,
  experimentalBackgroundSubagents: false,
  experimentalLspTy: false,
  experimentalLspTool: false,
  experimentalOxfmt: false,
  experimentalPlanMode: false,
  experimentalEventSystem: false,
  experimentalWorkspaces: false,
  experimentalIconDiscovery: false,
  acpNext: false,
  outputTokenMax: undefined,
  bashDefaultTimeoutMs: undefined,
  experimentalNativeLlm: false,
  experimentalWebSockets: false,
  client: "cli",
} satisfies RuntimeFlags.Info

describe("LLMRequestPrep.prepare - Synora contracts", () => {
  test("does not inherit generic sampling defaults for Synora Foundry models", async () => {
    const providerID = ProviderID.make("synora-foundry")
    const provider = SynoraProvider.providers({ envs: {}, auths: {} })[providerID]
    const model = provider.models["Kimi-K2.6"]

    const prepared = await Effect.runPromise(
      LLMRequestPrep.prepare({
        user: {
          id: MessageID.make("msg_synora_1"),
          sessionID: SessionID.make("session-synora-1"),
          role: "user",
          time: { created: Date.now() },
          agent: "build",
          model: {
            providerID,
            modelID: model.id,
          },
        },
        sessionID: "session-synora-1",
        model,
        agent: {
          name: "build",
          mode: "primary",
          options: {},
          permission: [],
        },
        system: ["You are a test harness."],
        messages: [{ role: "user", content: "hello" }],
        tools: {},
        provider,
        auth: undefined,
        plugin: passthroughPlugin,
        flags,
        isWorkflow: false,
      }),
    )

    expect(prepared.params.temperature).toBeUndefined()
    expect(prepared.params.topP).toBeUndefined()
    expect(prepared.params.topK).toBeUndefined()
    expect(prepared.params.options).toEqual({ useCompletionUrls: true })
  })
})
