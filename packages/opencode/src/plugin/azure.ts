import type { Hooks, PluginInput } from "@opencode-ai/plugin"

export async function AzureAuthPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      provider: "synora-foundry",
      methods: [
        {
          type: "api",
          label: "Azure AI Foundry API key",
        },
      ],
    },
  }
}
