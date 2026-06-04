import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { LLM, Message } from "../src"
import { Auth, LLMClient } from "../src/route"
import { AmazonBedrock } from "../src/providers"
import * as OpenAIChat from "../src/protocols/openai-chat"
import { applyCachePolicy } from "../src/cache-policy"
import { it } from "./lib/effect"

const bedrockModel = AmazonBedrock.configure({
  credentials: { region: "us-east-1", accessKeyId: "fixture", secretAccessKey: "fixture" },
}).model("anthropic.claude-3-5-sonnet-20241022-v2:0")

const openaiModel = OpenAIChat.route
  .with({ endpoint: { baseURL: "https://api.openai.test/v1/" }, auth: Auth.bearer("test") })
  .model({ id: "gpt-4o-mini" })

describe("applyCachePolicy", () => {
  it.effect("undefined cache resolves to auto on Bedrock", () =>
    Effect.gen(function* () {
      const prepared = yield* LLMClient.prepare(
        LLM.request({
          model: bedrockModel,
          system: "You are concise.",
          prompt: "hi",
        }),
      )

      expect(prepared.body).toMatchObject({
        system: [{ text: "You are concise." }, { cachePoint: { type: "default" } }],
        messages: [{ role: "user", content: [{ text: "hi" }, { cachePoint: { type: "default" } }] }],
      })
    }),
  )

  it.effect("auto marks the last tool, last system part, and latest user message on Bedrock", () =>
    Effect.gen(function* () {
      const prepared = yield* LLMClient.prepare(
        LLM.request({
          model: bedrockModel,
          system: "Sys A",
          tools: [{ name: "t1", description: "t1", inputSchema: { type: "object", properties: {} } }],
          messages: [Message.user("first user"), Message.assistant("assistant reply"), Message.user("latest user")],
          cache: "auto",
        }),
      )

      expect(prepared.body).toMatchObject({
        toolConfig: { tools: [{ toolSpec: { name: "t1" } }, { cachePoint: { type: "default" } }] },
        system: [{ text: "Sys A" }, { cachePoint: { type: "default" } }],
        messages: [
          { role: "user", content: [{ text: "first user" }] },
          { role: "assistant", content: [{ text: "assistant reply" }] },
          { role: "user", content: [{ text: "latest user" }, { cachePoint: { type: "default" } }] },
        ],
      })
    }),
  )

  it.effect("auto is a no-op on OpenAI routes because caching is implicit", () =>
    Effect.gen(function* () {
      const prepared = yield* LLMClient.prepare(
        LLM.request({ model: openaiModel, system: "Sys", prompt: "hi", cache: "auto" }),
      )

      const flat = JSON.stringify(prepared.body)
      expect(flat).not.toContain("cache_control")
      expect(flat).not.toContain("cachePoint")
    }),
  )

  it.effect("latest-user marks only the latest user message on Bedrock", () =>
    Effect.gen(function* () {
      const prepared = yield* LLMClient.prepare(
        LLM.request({
          model: bedrockModel,
          messages: [Message.user("u1"), Message.assistant("a1"), Message.user("u2")],
          cache: { messages: "latest-user-message" },
        }),
      )

      const body = prepared.body as { messages: Array<{ content: Array<{ cachePoint?: unknown }> }> }
      expect(body.messages[0]?.content.at(-1)?.cachePoint).toBeUndefined()
      expect(body.messages[1]?.content.at(-1)?.cachePoint).toBeUndefined()
      expect(body.messages[2]?.content.at(-1)?.cachePoint).toEqual({ type: "default" })
    }),
  )

  it.effect("latest-assistant marks the last assistant message on Bedrock", () =>
    Effect.gen(function* () {
      const prepared = yield* LLMClient.prepare(
        LLM.request({
          model: bedrockModel,
          messages: [Message.user("u1"), Message.assistant("a1"), Message.user("u2")],
          cache: { messages: "latest-assistant" },
        }),
      )

      const body = prepared.body as { messages: Array<{ content: Array<{ cachePoint?: unknown }> }> }
      expect(body.messages[0]?.content.at(-1)?.cachePoint).toBeUndefined()
      expect(body.messages[1]?.content.at(-1)?.cachePoint).toEqual({ type: "default" })
      expect(body.messages[2]?.content.at(-1)?.cachePoint).toBeUndefined()
    }),
  )

  test("returns the same request reference when policy is a no-op", () => {
    const request = LLM.request({ model: bedrockModel, prompt: "hi", cache: "none" })
    expect(applyCachePolicy(request)).toBe(request)
  })
})
