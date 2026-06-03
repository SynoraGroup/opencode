import { describe, expect, test } from "bun:test"
import { providerOptions } from "../../../../src/cli/cmd/tui/component/dialog-provider"

describe("providerOptions", () => {
  test("orders Synora providers ahead of anything else", () => {
    expect(
      providerOptions([
        { id: "synora-bedrock", name: "Synora Bedrock" },
        { id: "synora-foundry", name: "Synora Foundry" },
      ]).map((option) => option.value),
    ).toEqual(["synora-foundry", "synora-bedrock"])
  })

  test("marks provider options as Synora-only categories", () => {
    expect(providerOptions([{ id: "synora-foundry", name: "Synora Foundry" }])[0]).toMatchObject({
      category: "Synora",
      description: "Azure AI Foundry",
    })
  })

  test("does not synthesize custom provider entries", () => {
    expect(providerOptions([{ id: "synora-bedrock", name: "Synora Bedrock" }])).toHaveLength(1)
  })
})
