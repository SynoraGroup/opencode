# Synora opencode Framework

Date: 2026-06-02  
Location: `/home/k-petrov/dev/synora/experiments/opencode`

## Purpose

This document captures the operating idea for turning the local opencode fork into the Synora coding harness.

It is not a code audit, not a provider reference, and not a model specification. The existing audit remains separate. This document describes the agreed direction, boundaries, phases, and engineering rules for the project.

The central idea is simple: preserve the parts of opencode that already work well, remove the parts that create unnecessary operational surface area for Synora, and make Synora infrastructure first-class instead of treating it as a patched provider configuration.

## Product Direction

Synora Code should be a custom coding harness based on opencode.

The reason for using opencode as the basis is not only the TUI. The TUI is important, but the backend already contains meaningful harness machinery: session state, provider routing, request preparation, streaming, tool execution, usage accounting, retry behavior, compaction, and model selection mechanics.

The target is not a public general-provider client. The target is a curated Synora harness:

- the user starts the harness;
- selects an approved model;
- selects the model's official reasoning or thinking mode where applicable;
- works normally;
- routing, cache behavior, accounting, context management, and provider protocol details happen internally.

The operator should not need to choose between Chat Completions, Responses, Bedrock Converse, Azure variants, provider profiles, or diagnostic modes during normal work.

## Non-Negotiable Rules

No invented model metadata.

Model limits, output limits, reasoning modes, thinking controls, cache fields, prices, and transport capabilities must come from one of these sources:

- existing opencode/models.dev metadata when it is already correct;
- the live deployment metadata for Synora-owned Azure Foundry or AWS Bedrock resources;
- official vendor documentation;
- existing verified opencode implementation behavior.

If a value is not known, it must not be guessed into the runtime contract.

No heuristic model mechanics.

Reasoning and thinking controls must be per model or per officially documented vendor family. Broad string matching such as "model name contains X, therefore use Y" is not acceptable for Synora-critical models unless it is only preserving existing upstream behavior outside the Synora path.

Preserve what is good.

opencode already has useful code for model selection, variants, provider loading, Bedrock credential handling, request shaping, stream processing, tool execution, usage accounting, and compaction. Phase 1 should reuse that machinery where it is correct.

Remove what is operationally wrong for Synora.

The public provider/model catalogue is not the product. The Synora fork should not expose a broad provider zoo by default. It should expose only approved model groups and approved routes.

Do not hide correctness problems behind flags.

The intended user experience is `synora code`, not a collection of debug profiles. Diagnostics can exist for development, but production behavior should be automatic and correct by default.

## What Stays

The opencode TUI should stay.

The model selector should stay, but with a curated Synora surface.

The variant selector should stay. This is the right place to expose official per-model reasoning or thinking modes.

The thinking display toggle should stay as a display control only. It should not become a reasoning-effort control.

The session and tool loop should stay protocol-agnostic.

The provider/runtime boundary should remain the place where protocol-specific details are normalized.

The existing opencode mechanics for opencode Go/Zen should be preserved where they are already working.

The existing Bedrock credential and profile handling should be preserved and hardened, not replaced with a Claude-only shortcut.

The existing model metadata should be preserved where correct. Synora custom behavior should route around that metadata, not overwrite it with hand-written guesses.

## What Changes

The visible model catalogue becomes curated.

The selector should not expose every upstream provider and model by default. It should expose:

- opencode-hosted models that are intentionally retained;
- Synora Foundry models;
- Synora Bedrock models;
- any future provider only after it becomes an intentional Synora contract.

Synora infrastructure becomes first-class.

Azure Foundry and AWS Bedrock should not be treated as incidental OpenAI-compatible endpoints. They should be explicit provider families in the Synora fork, with internal routing rules and provider-specific request/accounting behavior.

Routing becomes automatic.

Selecting a Synora model should internally resolve:

- vendor family;
- deployment or model id;
- transport;
- auth source;
- supported reasoning or thinking controls;
- cache behavior;
- usage accounting normalization;
- context and compaction limits.

The user should see model names and official variant names, not protocol switches.

Cache behavior becomes a runtime invariant.

If a vendor supports prompt caching, the harness should use it correctly. Cache keys, cache checkpoints, deterministic prompt prefix behavior, and cache usage accounting belong in the provider/runtime layer, not in user workflow instructions.

Context management becomes proactive.

The harness should use known model limits to avoid context blowups before they become failed requests or runaway costs. Existing opencode compaction should be strengthened using proven ideas already present in opencode, Codex, Pi, and Aider-like tools, but without transplanting another backend blindly.

## Provider Families

### Synora Foundry

Synora Foundry is the primary route for Azure-hosted models.

The Foundry path must support both model families that use Responses and model families that use Chat Completions. The selected model decides the transport internally.

The Foundry implementation must preserve deployment-specific metadata. It must not assume that all Foundry models share the same capabilities, limits, cache fields, or reasoning controls.

The Foundry implementation must not strip cache keys or provider fields that are officially required for the selected model.

### Synora Bedrock

Synora Bedrock is an AWS vendor family, not a Claude-only proxy.

The first important Bedrock use case is Claude, but the design must allow future Bedrock models without rewriting the harness. Model-specific controls should come from Bedrock model metadata and official AWS/vendor documentation.

For Claude models, the implementation should preserve existing opencode Bedrock handling where correct, including credential chain behavior, inference profile support, streaming, tool use, reasoning blocks, signatures, cache accounting, and context limits.

### opencode Hosted

opencode Go/Zen can remain as a retained provider group if it is useful operationally.

These routes should not dictate Synora Foundry or Synora Bedrock behavior. They can serve as working references for good adapter mechanics, but Synora infrastructure should have its own first-class route contracts.

## Model Controls

The model selector chooses the model.

The variant selector chooses official model-specific reasoning or thinking modes.

The thinking display command controls whether reasoning blocks are shown or collapsed in the UI.

These three controls must not be conflated.

Variant names should be official model names or exact official control values where possible. If the vendor exposes numeric budgets, the UI should not invent qualitative labels unless those labels already exist officially for that model or adapter surface.

Adding future models should usually be a catalogue or contract expansion, provided the required transport and provider family already exist. If a future model requires a new protocol, cache strategy, or accounting scheme, that protocol work must be added explicitly.

## Cache And Cost Discipline

The harness should be designed to avoid expensive accidental uncached loops.

The cache strategy should be automatic and vendor-aware:

- use stable session or task cache identity where the vendor supports it;
- keep cache-sensitive prompt prefixes deterministic;
- place volatile runtime information where it does not break cache prefix rules;
- preserve provider-specific cache checkpoints where supported;
- normalize cache read and cache write tokens into the TUI and persisted usage data;
- surface suspicious zero-cache behavior on large repeated contexts as an operational signal.

This should not become a user-facing profile system. The user should not need to know whether caching is done through prompt cache keys, cache checkpoints, Bedrock cache points, or provider-native automatic caching.

## Context And Long Sessions

Long-session behavior is part of Phase 1 because it directly affects cost, reliability, and coding usefulness.

The harness should use actual model context and output limits to decide when to compact or summarize. It should not rely only on provider errors after a request fails.

The desired behavior:

- track token usage consistently;
- reserve output and tool-call headroom;
- compact before unsafe boundaries;
- preserve tool-call correctness across compaction;
- avoid replaying unnecessary reasoning traces;
- keep enough session history for useful coding continuity;
- preserve cache-friendly stable prefixes where possible.

Codex is a useful reference for disciplined context and cache handling. Pi is a useful reference for append-oriented session and compaction simplicity. opencode should be strengthened using those ideas while preserving its own architecture.

## Phase Plan

### Phase 1: Synora Runtime And Provider Hardening

Phase 1 turns opencode into a Synora-native runtime without changing the product identity or prompts yet.

Scope:

- curate the visible model/provider catalogue;
- preserve existing correct model metadata;
- make Foundry and Bedrock first-class provider families;
- route models automatically to the correct transport;
- make auth resolution provider/model aware;
- preserve official reasoning and thinking controls;
- fix Foundry cache behavior;
- normalize usage and cache accounting;
- harden proactive context and compaction behavior;
- preserve opencode TUI mechanics;
- preserve opencode Go/Zen behavior where intentionally retained.

Out of scope:

- rebranding;
- system prompt redesign;
- model personality tuning;
- broad public provider compatibility;
- packaging and release distribution.

### Phase 2: Model Behavior, Prompts, And Tooling

Phase 2 tunes how the harness behaves as an agent.

Scope:

- Synora system prompts;
- model-specific behavior policy;
- raw model exposure decisions;
- tool policy and tool descriptions;
- coding workflow behavior;
- planning behavior;
- output style;
- project memory and context policy.

Phase 2 should happen after Phase 1 because model behavior is only meaningful when routing, context, cache, and accounting are correct.

### Phase 3: Rebrand And Deployment Mechanics

Phase 3 makes the fork installable and identifiable as the Synora harness.

Scope:

- command name;
- package name;
- TUI splash and branding;
- release channel;
- install/update flow;
- GitHub deployment or package deployment;
- local coexistence with official opencode if needed.

This phase should not be used to hide incomplete runtime work. Branding follows correctness.

## Implementation Principles

Small runtime patches are acceptable only when they fit the final architecture.

Provider behavior should be contract-driven, not scattered across unrelated string checks.

Tests should exist where they protect real money or real workflow reliability:

- routing selection;
- cache key/checkpoint emission;
- usage accounting;
- context compaction thresholds;
- tool-call replay;
- official reasoning/thinking payloads.

Testing should support engineering correctness, not become a substitute for understanding the vendor contract.

Official documentation and live deployment metadata are required references for model-specific behavior.

When existing opencode behavior is already correct, it should be preserved. When it is too broad for Synora, it should be pruned. When it is wrong for Foundry or Bedrock, it should be fixed at the provider/runtime boundary.

## Lessons And Working Notes

Future work on this project should start from evidence that is already available on the machine.

The machine has enough cloud context to inspect the real Synora infrastructure. An agent working on this should use the local Azure and AWS CLIs before guessing provider behavior.

Useful Azure checks include:

```sh
az account show
az resource list --query "[?contains(name, 'foundry') || contains(type, 'Cognitive')].{name:name,type:type,resourceGroup:resourceGroup,location:location}"
az cognitiveservices account show --name <foundry-resource> --resource-group <resource-group>
az cognitiveservices account deployment list --name <foundry-resource> --resource-group <resource-group>
```

Useful AWS checks include:

```sh
aws sts get-caller-identity
aws bedrock list-foundation-models --region eu-central-1
aws bedrock list-inference-profiles --region eu-central-1
```

These commands matter because the local machine may already know which Foundry deployments and Bedrock inference profiles are active. That live state is more useful than inventing catalogue entries by hand.

The Foundry endpoints observed from the user's deployment pages are the important entry points:

```text
https://nps-foundry.services.ai.azure.com/openai/v1/chat/completions
https://nps-foundry.services.ai.azure.com/openai/v1/responses
```

The harness should treat those as different transports under one Foundry vendor family. The model contract chooses the transport internally.

Provider request structure should be checked at the actual lowering boundary, not inferred from UI labels. In opencode, the important files are:

- `packages/opencode/src/session/llm/request.ts` for request preparation;
- `packages/opencode/src/session/llm.ts` for runtime selection and AI SDK execution;
- `packages/opencode/src/session/llm/native-runtime.ts` for the native LLM runtime boundary;
- `packages/opencode/src/provider/provider.ts` for provider loading, SDK selection, auth, and model resolution;
- `packages/opencode/src/provider/transform.ts` for provider options, variants, message transforms, and sampling defaults;
- `packages/llm/src/protocols/openai-chat.ts` for Chat Completions lowering and SSE parsing;
- `packages/llm/src/protocols/openai-responses.ts` for Responses lowering and stream parsing;
- `packages/llm/src/protocols/bedrock-converse.ts` for Bedrock Converse lowering and stream parsing.

The TUI controls should also be verified in code before changing behavior:

- `packages/opencode/src/cli/cmd/tui/component/dialog-model.tsx` owns model selection;
- `packages/opencode/src/cli/cmd/tui/component/dialog-variant.tsx` owns variant selection;
- `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx` contains the thinking display command.

The important distinction learned from opencode is that `/thinking` is a UI visibility control, while `/variants` is the existing mechanism for changing model mode. Synora should preserve that distinction.

The important lesson from Codex is discipline at the runtime boundary. Codex keeps orchestration, tools, compaction, cancellation, retries, and accounting above the model protocol layer. Protocol-specific behavior is normalized before it reaches the session loop. Codex is also a useful reference for stable prompt cache keys and proactive context handling.

The important Codex areas to inspect are:

- `codex-rs/core/src/client.rs` for request construction and prompt cache key behavior;
- `codex-rs/core/src/session/turn.rs` for turn orchestration;
- `codex-rs/core/src/context_manager/history.rs` for context and history handling;
- `codex-rs/core/src/compact.rs` or nearby compaction code for summarization flow;
- `codex-rs/core/tests` for mock transport tests and canonical event behavior.

The important lesson from Pi is simplicity in session structure. Pi is more minimal than opencode, but its append-oriented session and compaction model is a useful reference for keeping long-session behavior understandable. It is not automatically superior as a full backend, but its compaction/session shape is worth studying.

The important Pi areas to inspect are:

- `packages/agent/src/harness/session/session.ts` for session structure;
- `packages/agent/src/harness/compaction/compaction.ts` for compaction behavior;
- nearby token accounting helpers and tests for how it decides what to keep.

The important lesson from Aider-like tooling is selective context reduction. Aider-style systems are useful references for pruning tool results, compacting stale details, and keeping the working set focused without pretending every historical token has equal value.

The generic engineering pattern across good harnesses is:

- keep provider protocols below the orchestration boundary;
- normalize streams into canonical events;
- make model metadata authoritative;
- compact proactively, not only after provider failure;
- keep cache-sensitive prompt prefixes stable;
- preserve tool-call replay correctness;
- make usage accounting explicit enough to notice expensive loops;
- keep UI controls mapped to real runtime controls, not approximate labels.

Official documentation should be used for every model-specific control. Good sources include:

- Azure AI Foundry and Azure OpenAI API documentation for Foundry endpoints, auth, Responses, Chat Completions, prompt caching, and deployment capability behavior;
- AWS Bedrock user guide and model cards for Converse, inference profiles, context windows, prompt caching, and extended thinking constraints;
- Anthropic documentation for Claude thinking controls where relevant to the selected transport;
- DeepSeek documentation for DeepSeek thinking mode and `reasoning_content` replay requirements;
- Kimi/Moonshot documentation for Kimi thinking mode and prompt cache fields;
- existing opencode/models.dev metadata where it already encodes correct limits, costs, and model capabilities.

The engineering habit should be: first inspect the existing opencode metadata, then verify the live cloud deployment, then check official docs, and only then write code.

## Success Criteria

Phase 1 is successful when:

- the selector shows only the intended operational model surface;
- selecting a model automatically resolves the correct vendor and transport;
- official model variants appear without invented labels;
- Foundry and Bedrock routes work without user protocol choices;
- cache behavior is used where supported by the selected vendor/model;
- usage and cache accounting are visible and normalized;
- long sessions compact before unsafe boundaries;
- tool calls remain correct across streaming, retries, and compaction;
- opencode's TUI remains intact;
- opencode Go/Zen behavior remains available if intentionally retained;
- no model metadata is invented in the Synora path.

## Core Idea In One Sentence

Synora Code should be opencode's strong TUI and harness foundation, narrowed and hardened into a curated Foundry/Bedrock-native coding environment where provider protocol, model capability, cache, context, and accounting decisions are handled correctly by the runtime instead of by the operator.
