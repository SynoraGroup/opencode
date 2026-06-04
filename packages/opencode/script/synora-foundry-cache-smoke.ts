#!/usr/bin/env bun

import path from "path"
import { Server } from "../src/server/server"
import * as Log from "@opencode-ai/core/util/log"

process.chdir(path.resolve(import.meta.dirname, ".."))
void Log.init({ print: false })

type ModelCase = {
  readonly providerID: "synora-foundry"
  readonly modelID: string
  readonly expectedCacheFields: boolean
}

type Message = {
  readonly info: {
    readonly id: string
    readonly role: string
    readonly cost?: number
    readonly tokens?: Tokens
    readonly modelID?: string
    readonly providerID?: string
  }
  readonly parts?: ReadonlyArray<{ readonly type: string; readonly tokens?: Tokens; readonly cost?: number }>
}

type Tokens = {
  readonly input: number
  readonly output: number
  readonly reasoning: number
  readonly cache: { readonly read: number; readonly write: number }
}

const models: readonly ModelCase[] = [
  { providerID: "synora-foundry", modelID: "gpt-5.4", expectedCacheFields: true },
  { providerID: "synora-foundry", modelID: "gpt-5.3-codex", expectedCacheFields: true },
  { providerID: "synora-foundry", modelID: "DeepSeek-V4-Pro", expectedCacheFields: false },
  { providerID: "synora-foundry", modelID: "DeepSeek-V4-Flash", expectedCacheFields: false },
  { providerID: "synora-foundry", modelID: "Kimi-K2.6", expectedCacheFields: false },
]

const args = new Map(
  process.argv
    .slice(2)
    .flatMap((arg) => {
      const match = /^--([^=]+)=(.*)$/.exec(arg)
      return match ? [[match[1], match[2]] as const] : []
    }),
)

const directory = path.resolve(args.get("directory") ?? process.cwd())
const tokenBudget = Number(args.get("budget") ?? 100_000)
const prefixTokens = Number(args.get("prefix-tokens") ?? 12_000)
const turns = Number(args.get("turns") ?? 3)
const selectedModels = new Set((args.get("models") ?? models.map((model) => model.modelID).join(",")).split(","))
const promptTokenEstimate = prefixTokens * turns * 2 + 5_000

if (promptTokenEstimate > tokenBudget) {
  throw new Error(
    `Estimated input tokens ${promptTokenEstimate} exceed per-model budget ${tokenBudget}; lower --prefix-tokens or --turns.`,
  )
}

const stablePrefix = Array.from({ length: prefixTokens }, (_, index) => `CACHE${index % 997}`).join(" ")
const listener = await Server.listen({ hostname: "127.0.0.1", port: 0 })
const jsonHeaders = { "content-type": "application/json", "x-opencode-directory": directory }
const results = []

try {
  for (const model of models.filter((item) => selectedModels.has(item.modelID))) {
    const session = await request<{ id: string }>("/session", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        title: `cache-smoke-${model.modelID}-${Date.now()}`,
        model: { providerID: model.providerID, id: model.modelID },
        permission: [{ permission: "*", pattern: "*", action: "deny" }],
      }),
    })

    const turnResults = []
    let budgetExceeded = false
    for (let turn = 1; turn <= turns; turn++) {
      const text =
        turn === 1
          ? [
              "Synora Foundry prompt-cache smoke.",
              "The next block is stable deterministic cache material. Do not analyze it.",
              stablePrefix,
              "Reply with exactly CACHE_SMOKE_OK.",
            ].join("\n")
          : `Cache smoke turn ${turn}. Reply with exactly CACHE_SMOKE_OK.`

      const before = await messages(session.id)
      await request(`/session/${session.id}/message`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          model: { providerID: model.providerID, modelID: model.modelID },
          system: "You are a cache smoke responder. Do not call tools. Reply with exactly CACHE_SMOKE_OK.",
          parts: [{ type: "text", text }],
        }),
      })
      const after = await messages(session.id)
      const assistant = after
        .filter((message) => !before.some((existing) => existing.info.id === message.info.id))
        .findLast((message) => message.info.role === "assistant" && message.info.modelID === model.modelID)
      const tokens = assistant?.info.tokens ?? sumStepTokens(assistant)
      const result = {
        turn,
        messageID: assistant?.info.id,
        input: tokens?.input ?? 0,
        output: tokens?.output ?? 0,
        reasoning: tokens?.reasoning ?? 0,
        cacheRead: tokens?.cache.read ?? 0,
        cacheWrite: tokens?.cache.write ?? 0,
        cost: assistant?.info.cost ?? 0,
      }
      turnResults.push(result)
      const actualInput = turnResults.reduce((sum, item) => sum + item.input + item.cacheRead + item.cacheWrite, 0)
      const lastInput = result.input + result.cacheRead + result.cacheWrite
      if (actualInput >= tokenBudget || actualInput + lastInput > tokenBudget) {
        budgetExceeded = true
        break
      }
      await Bun.sleep(2_000)
    }

    const totalInput = turnResults.reduce((sum, turn) => sum + turn.input + turn.cacheRead + turn.cacheWrite, 0)
    const totalCacheRead = turnResults.reduce((sum, turn) => sum + turn.cacheRead, 0)
    const totalCacheWrite = turnResults.reduce((sum, turn) => sum + turn.cacheWrite, 0)
    const verdict = model.expectedCacheFields
      ? totalCacheRead > 0 || totalCacheWrite > 0
        ? "pass"
        : "fail-no-cache-accounting"
      : totalCacheRead > 0 || totalCacheWrite > 0
        ? "unexpected-cache-accounting"
        : "unsupported-by-contract"

    results.push({
      model: model.modelID,
      expectedCacheFields: model.expectedCacheFields,
      verdict,
      totalInput,
      totalCacheRead,
      totalCacheWrite,
      budgetExceeded,
      turns: turnResults,
    })
  }
} finally {
  await listener.stop(true)
}

console.log(JSON.stringify({ directory, tokenBudget, prefixTokens, turns, results }, null, 2))

async function request<T = unknown>(pathname: string, init: RequestInit) {
  const response = await fetch(new URL(pathname, listener.url), init)
  const body = await response.text()
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${pathname} failed ${response.status}: ${body}`)
  return body.length > 0 ? (JSON.parse(body) as T) : (undefined as T)
}

async function messages(sessionID: string) {
  return request<Message[]>(`/session/${sessionID}/message`, { headers: jsonHeaders })
}

function sumStepTokens(message: Message | undefined): Tokens | undefined {
  const parts = message?.parts?.filter((part) => part.tokens)
  if (!parts?.length) return
  return parts.reduce(
    (sum, part) => ({
      input: sum.input + (part.tokens?.input ?? 0),
      output: sum.output + (part.tokens?.output ?? 0),
      reasoning: sum.reasoning + (part.tokens?.reasoning ?? 0),
      cache: {
        read: sum.cache.read + (part.tokens?.cache.read ?? 0),
        write: sum.cache.write + (part.tokens?.cache.write ?? 0),
      },
    }),
    { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  )
}
