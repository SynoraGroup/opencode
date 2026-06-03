# Synora Code Implementation Plan

Date: 2026-06-02

## Purpose

This plan defines how the local opencode fork becomes the Synora coding harness.

The target is not a public opencode-compatible distribution. The target is a private Synora TUI-first coding backend for approved Synora infrastructure:

- Azure AI Foundry deployments owned by Synora;
- AWS Bedrock inference profiles owned by Synora;
- only intentionally retained runtime components from opencode.

Phase 1 is pure backend/runtime work. It does not include new prompts, behavior tuning, model roles, workflow modes, cost fuse policy, pricing controls, or tool-policy redesign.

## Non-Negotiable Direction

Non-Synora product surface is removed, not hidden.

The implementation should delete or gut unnecessary code, docs, prompts, packages, provider catalogues, auth flows, cloud surfaces, desktop surfaces, web surfaces, translation files, and subscription/product mechanics. Feature flags, quarantines, disabled menus, and hidden provider entries are acceptable only as temporary migration scaffolding inside an active branch and must not be the final Phase 1 state.

The final Phase 1 repo should contain only what is needed for the Synora TUI harness, its backend runtime, its local development/test workflow, and its approved provider protocols.

## Phase 1 Goal

Build a Synora-native backend where approved Foundry and Bedrock models:

- route through the correct protocol automatically;
- stream into canonical session events;
- preserve provider reasoning state correctly;
- preserve cache-friendly context prefixes;
- compact before context failure;
- reconstruct long sessions deterministically;
- keep the operator away from provider protocol choices.

The desired user experience is that long sessions continue as if context and cache management are invisible. The harness must do the runtime work needed to make that true whenever the provider supports it.

## Phase 1 Scope

Phase 1 includes:

- repository map and deletion plan;
- hard pruning of non-Synora surfaces;
- Synora model contract registry;
- Foundry provider family;
- Bedrock provider family;
- native protocol routing;
- cache manager;
- context governor;
- long-session state reconstruction;
- usage fields required for context/cache accounting;
- backend tests for paid-request correctness;
- TUI model/variant surface limited to approved Synora models.

Phase 1 excludes:

- Synora system prompt redesign;
- model personality or behavior tuning;
- model role presets;
- cost fuse or budget controls;
- pricing estimation;
- new goal mode UX;
- new skills system work;
- tool policy redesign;
- agent workflow modes;
- rebranding and packaging.

## Phase 1A: Repository Map And Deletion Plan

Phase 1 starts with a repo map before runtime edits. The map must identify what is kept, deleted, gutted, or rebuilt.

### Keep

Keep these areas unless the repo map finds a direct dependency reason to narrow them:

- `packages/opencode`: TUI command, session loop, file/shell/edit tools, storage, compaction, provider boundary, session persistence.
- `packages/llm`: native protocol runtime, especially OpenAI Responses, OpenAI Chat Completions, and Bedrock Converse.
- `packages/core`: shared types/utilities required by `packages/opencode`.
- `packages/sdk`: only if still required by the TUI/server boundary after pruning.
- `packages/plugin`: only if required by retained local plugin mechanics.
- `packages/effect-drizzle-sqlite`: local persistence support if still required.
- `packages/http-recorder`: retained only if useful for backend protocol tests.
- root build/test configuration needed for the remaining packages.

### Delete

Delete these areas unless the repo map proves a direct required dependency:

- `packages/desktop`;
- `packages/app`;
- `packages/web`;
- `packages/docs`;
- `packages/console`;
- `packages/enterprise`;
- `packages/stats`;
- `packages/slack`;
- `packages/storybook`;
- `packages/extensions`;
- public/multilingual README files not needed for the private harness;
- public docs and translation/glossary assets;
- product screenshots and marketing assets;
- public website/deploy infrastructure;
- public issue/PR automation prompts under `.opencode` that are not part of the Synora harness;
- unused package scripts and workspace entries after package deletion.

Deletion means removing code and dependency graph references, not keeping packages inert.

### Gut Or Rebuild

Gut or rebuild these areas around the Synora contract:

- generic provider catalogue loading;
- generic provider auth onboarding UI;
- Azure Cognitive Services catalogue behavior;
- public provider/model discovery;
- broad AI SDK provider dependency set;
- OpenRouter, Google, xAI, Copilot, GitLab, Venice, Alibaba, Gateway, generic OpenAI-compatible provider paths;
- subscription/opencode cloud mechanics;
- command/help text that advertises removed features;
- prompt files tied to public opencode agents, translations, issue triage, or public docs.

### Review Carefully

Review before deletion because these areas may contain useful local mechanics:

- `packages/opencode/src/server`: may be needed by the TUI and local IPC/API.
- `packages/opencode/src/sync`: may be needed by the TUI state model.
- `packages/opencode/src/agent`: keep only Phase 1 agent mechanics needed for the existing loop; prompt/behavior redesign moves to Phase 2.
- `packages/opencode/src/skill`: do not expand in Phase 1; keep only if required by current runtime stability.
- `packages/opencode/src/mcp`: keep only if required by existing tool/resource mechanics.
- `packages/opencode/src/account` and `packages/opencode/src/auth`: gut to Synora Foundry/Bedrock auth.
- `packages/opencode/src/control-plane`: delete unless required for local TUI runtime.
- `infra`, `sst.config.ts`, `install`, `nix`, `github`, `.github`: keep only the pieces needed for local development or future Synora packaging.

### Repo Map Deliverable

The first implementation deliverable is a document or tracked table with:

- package name/path;
- current purpose;
- direct dependents;
- action: keep, delete, gut, rebuild, or review;
- reason;
- deletion blockers;
- tests/typecheck needed after removal.

The map should be followed by actual deletions, dependency cleanup, and package-script cleanup.

## Phase 1B: Synora Model Contract Registry

Create a contract registry for approved models. This registry becomes the source of truth for Synora runtime behavior.

Initial approved contracts:

- Foundry `gpt-5.4`;
- Foundry `gpt-5.3-codex`;
- Foundry `DeepSeek-V4-Pro`;
- Foundry `DeepSeek-V4-Flash`;
- Foundry `Kimi-K2.6`;
- Bedrock Claude Sonnet 4.6;
- Bedrock Claude Opus 4.6.

Each contract defines:

- Synora model ID;
- display name;
- provider family: Foundry or Bedrock;
- deployment ID or inference profile ID;
- protocol: OpenAI Responses, OpenAI Chat Completions, or Bedrock Converse;
- endpoint/base URL;
- auth strategy;
- context window;
- max output;
- supported reasoning/thinking controls;
- default reasoning/thinking control if officially justified;
- cache strategy;
- usage parser;
- reasoning-state replay rule;
- stream parser;
- compaction policy inputs.

Rules:

- no guessed model limits;
- no guessed prices;
- no broad string-matching mechanics;
- unknown values stay unknown until verified from live cloud metadata or official documentation;
- unsupported variant/model combinations fail before a paid provider request is sent.

## Phase 1C: Native Runtime Path

Synora models should route through native protocol code, not the broad AI SDK transform path.

Target protocol routing:

- Foundry `gpt-5.4`: OpenAI Responses unless contract says otherwise.
- Foundry `gpt-5.3-codex`: OpenAI Responses.
- Foundry `DeepSeek-V4-Pro`: OpenAI Chat Completions.
- Foundry `DeepSeek-V4-Flash`: OpenAI Chat Completions.
- Foundry `Kimi-K2.6`: OpenAI Chat Completions.
- Bedrock Claude Sonnet 4.6: Bedrock Converse.
- Bedrock Claude Opus 4.6: Bedrock Converse.

Implementation direction:

- promote the native LLM route for Synora models;
- keep canonical stream events above provider protocols;
- normalize provider usage at the protocol boundary;
- keep tool execution and session orchestration protocol-agnostic;
- remove Synora dependency on scattered AI SDK provider option transforms.

## Phase 1D: Foundry Provider Family

Build Foundry as a first-class provider family.

Required behavior:

- route by model contract, not Foundry hostname heuristics;
- support both `/openai/v1/responses` and `/openai/v1/chat/completions`;
- support Azure key and Entra-compatible auth paths where required;
- preserve deployment-specific metadata;
- preserve `prompt_cache_key` where officially supported;
- preserve encrypted reasoning state for Responses models using stateless operation;
- preserve DeepSeek/Kimi reasoning content where required;
- reject routes that do not match live deployment capabilities.

Known current risk:

- the existing Azure selection path treats Foundry base URLs as a reason to prefer chat;
- the existing Azure fetch wrapper deletes Foundry cache keys globally;
- those behaviors conflict with a contract-driven Foundry backend.

## Phase 1E: Bedrock Provider Family

Build Bedrock as a first-class provider family.

Required behavior:

- use approved inference profile IDs explicitly;
- preserve AWS credential chain and configured profile support;
- use Bedrock Converse/ConverseStream for Claude;
- preserve thinking/signature/reasoning metadata correctly;
- emit cache points only where valid;
- normalize Bedrock cache read/write token usage;
- reject unapproved Claude 4.7/4.8 profiles unless explicitly added later.

Bedrock is not a generic Claude shortcut. It is a provider family that starts with approved Claude 4.6 profiles.

## Phase 1F: Cache Manager

Add a backend cache manager. This is not a user-facing feature.

Responsibilities:

- keep stable prompt prefixes deterministic;
- place volatile turn-specific data after cache-sensitive prefixes;
- emit `prompt_cache_key` for supported Foundry/OpenAI-style routes;
- emit Bedrock `cachePoint` blocks where threshold and placement rules allow;
- preserve provider reasoning metadata without polluting visible transcript text;
- track cache read/write token fields needed for context stability;
- detect repeated large-prefix zero-cache behavior for diagnostics.

No price math and no budget policy belong here.

## Phase 1G: Context Governor

Add a proactive context governor. This is the most important long-session work.

Responsibilities:

- use verified model context/output limits;
- reserve output headroom;
- reserve tool-call headroom;
- compact before provider failure;
- protect recent tool-call correctness;
- preserve required reasoning metadata;
- avoid replaying unnecessary visible reasoning text;
- preserve cache-friendly stable prefixes;
- keep recent working set intact;
- summarize or prune stale tool output aggressively;
- reconstruct long sessions deterministically after restart.

Design references:

- Codex is the main reference for disciplined long-session behavior, cache continuity, and proactive context management.
- Claude Code is a behavioral reference for the expectation that context should feel managed for the operator.
- Pi is a reference for simple append-oriented session state and compaction reconstruction.

Phase 1 does not implement new goal-mode UX, but it should build the backend stability needed for goal-mode-like work in Phase 2.

## Phase 1H: Long-Session State

Make long-session state explicit.

Target shape:

- append-only session journal;
- canonical reconstructed prompt view;
- provider metadata ledger separate from user-visible transcript;
- compaction entries as first-class session events;
- reasoning metadata retained only where required for provider correctness;
- deterministic replay into provider payloads;
- restart-safe continuation.

The key rule is that compaction must not break tool-call replay, reasoning-state replay, or cache prefix stability.

## Phase 1I: TUI Surface

Keep the TUI, but narrow the model surface.

Required behavior:

- model selector shows only approved Synora models;
- variant selector shows only official model-specific reasoning/thinking controls;
- thinking display toggle remains display-only;
- provider/protocol choices are not exposed to the operator;
- removed features do not appear in help text, commands, docs, or menus.

No Phase 1 prompt/personality changes are made through the TUI.

## Phase 1J: Backend Tests

Tests should protect expensive failure modes.

Required test categories:

- model contract resolution;
- Foundry transport selection;
- Bedrock inference profile selection;
- OpenAI Responses request body generation;
- OpenAI Chat Completions request body generation;
- Bedrock Converse request body generation;
- cache key emission;
- Bedrock cache point emission;
- encrypted reasoning replay;
- DeepSeek/Kimi reasoning content replay;
- tool-call replay after compaction;
- stream parser normalization;
- usage/cache accounting normalization;
- compaction threshold decisions;
- long-session reconstruction.

Use golden request-body and stream-replay tests where they are clearer than mocks.

Run tests from package directories only. Run `bun typecheck` from package directories only.

## Phase 1 Acceptance Criteria

Phase 1 is complete when:

- the repo no longer contains unnecessary public product packages and docs;
- workspace dependencies/scripts are cleaned after deletion;
- the TUI runs against the narrowed repo;
- the model selector exposes only approved Synora models;
- each approved model resolves to an explicit Synora contract;
- Foundry GPT/Codex models use the correct Responses route;
- Foundry DeepSeek/Kimi models use the correct Chat Completions route;
- Bedrock Claude 4.6 models use approved Converse inference profiles;
- cache keys/checkpoints are emitted correctly where supported;
- cache usage fields are captured;
- reasoning metadata is preserved only where needed for provider correctness;
- long sessions compact before unsafe boundaries;
- compacted sessions replay tools correctly;
- restarted sessions reconstruct correctly;
- unsupported routes fail before paid requests;
- backend tests cover the paid-request and long-session failure modes.

## Phase 2: Behavior, Prompts, And Research Workflow

Phase 2 starts after Phase 1 backend correctness is stable.

Phase 2 may include:

- Synora system prompts;
- raw model exposure decisions;
- model behavior policy;
- role presets;
- goal-mode-like workflows;
- skills;
- cost fuse or budget controls;
- pricing visibility;
- tool policy changes;
- specialized research workflows for defense, space, robotics, physical AI, heavy math, and infrastructure work.

Phase 2 should not compensate for weak Phase 1 routing, cache, context, or provider behavior. It should build on the stable backend.

## Phase 3: Rebrand, Packaging, And Deployment

Phase 3 makes the product installable and identifiable as the Synora harness.

Phase 3 may include:

- command name;
- package names;
- TUI branding;
- install/update flow;
- release channel;
- Synora-specific documentation;
- internal deployment process;
- coexistence rules with upstream opencode if needed.

Branding and packaging follow runtime correctness.

## Working Rule

For every implementation step:

1. inspect existing opencode behavior;
2. verify live Synora cloud metadata where relevant;
3. check official provider documentation for protocol, reasoning, cache, and usage fields;
4. update the Synora contract;
5. change code;
6. test the request body, stream parser, cache behavior, and long-session behavior.

No implementation step should guess model mechanics.
