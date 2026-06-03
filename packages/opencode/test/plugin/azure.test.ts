import { describe, expect, test } from "bun:test"
import { AzureAuthPlugin } from "@/plugin/azure"

describe("Azure auth plugin", () => {
  test("binds the built-in auth method to Synora Foundry", async () => {
    const hooks = await AzureAuthPlugin({} as never)

    expect(hooks.auth?.provider).toBe("synora-foundry")
    expect(hooks.auth?.methods).toEqual([
      {
        type: "api",
        label: "Azure AI Foundry API key",
      },
    ])
  })
})
