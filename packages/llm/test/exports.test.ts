import { describe, expect, test } from "bun:test"
import { LLM, LLMClient, Provider } from "@opencode-ai/llm"
import { Protocol, Route } from "@opencode-ai/llm/route"
import { Provider as ProviderSubpath } from "@opencode-ai/llm/provider"
import { AmazonBedrock, Azure, OpenAI } from "@opencode-ai/llm/providers"
import { BedrockConverse, OpenAIChat, OpenAIResponses } from "@opencode-ai/llm/protocols"

describe("public exports", () => {
  test("root exposes app-facing runtime APIs", () => {
    expect(LLM.request).toBeFunction()
    expect(LLMClient.Service).toBeFunction()
    expect(LLMClient.layer).toBeDefined()
    expect(Provider.make).toBeFunction()
    expect(ProviderSubpath.make).toBe(Provider.make)
  })

  test("route barrel exposes route-authoring APIs", () => {
    expect(Route.make).toBeFunction()
    expect(Protocol.make).toBeFunction()
  })

  test("provider barrel exposes retained Synora protocol facades", () => {
    expect(Azure.configure({ apiKey: "fixture", baseURL: "https://foundry.test/openai/v1" }).responses).toBeFunction()
    expect(Azure.configure({ apiKey: "fixture", baseURL: "https://foundry.test/openai/v1" }).chat).toBeFunction()
    expect(AmazonBedrock.configure({ apiKey: "fixture" }).model).toBeFunction()
    expect(OpenAI.model).toBeFunction()
  })

  test("protocol barrels expose retained low-level routes", () => {
    expect(OpenAIChat.route.id).toBe("openai-chat")
    expect(OpenAIResponses.route.id).toBe("openai-responses")
    expect(OpenAIResponses.webSocketRoute.id).toBe("openai-responses-websocket")
    expect(BedrockConverse.route.id).toBe("bedrock-converse")
  })
})
