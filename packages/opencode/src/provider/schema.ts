import { Schema } from "effect"

import { withStatics } from "@opencode-ai/core/schema"

const providerIdSchema = Schema.String.pipe(Schema.brand("ProviderID"))

export type ProviderID = typeof providerIdSchema.Type

export const ProviderID = providerIdSchema.pipe(
  withStatics((schema: typeof providerIdSchema) => ({
    // Well-known providers retained for Synora Phase 1 and local fallback metadata.
    opencode: schema.make("opencode"),
    amazonBedrock: schema.make("amazon-bedrock"),
    azure: schema.make("azure"),
  })),
)

const modelIdSchema = Schema.String.pipe(Schema.brand("ModelID"))

export type ModelID = typeof modelIdSchema.Type

export const ModelID = modelIdSchema
