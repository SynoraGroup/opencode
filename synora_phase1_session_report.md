# Synora Phase 1 Session Report

Date: 2026-06-04  
Repository: `/home/ubuntu/dev/synora/experiments/opencode`  
Branch: `dev`  
Instance context: main Synora EC2 development instance  

## Executive Summary

This session moved the Synora opencode fork from Phase 1 audit/remediation into pilot-readiness, then followed up with live provider defects discovered during manual use. The fork is installed on the instance as a native `synora` command and can be launched from any directory with:

```bash
synora code
```

The current implementation is not merely a document-level Phase 1 claim. It has been exercised through the local TUI, package typechecks, focused provider tests, and live Synora Foundry smoke tests. The main residual risk is not basic operability, but provider economics and cache behavior across Azure AI Foundry models.

The practical infrastructure conclusion is:

- Azure AI Foundry GPT models currently look technically strongest for Synora Foundry long-context economics because they expose deterministic prompt caching through the Synora integration.
- Kimi on Foundry shows opportunistic/inconsistent cache reuse and rejects explicit `prompt_cache_key`, so Synora cannot force deterministic Kimi cache behavior through this Foundry route.
- DeepSeek on Foundry does not currently surface visible cache accounting in Synora live smokes, even after Synora was updated to account DeepSeek-style cache fields if the provider returns them.
- AWS Bedrock Converse remains strategically important because native Claude caching is strong, provider contracts are clearer, and AWS is expected to remain the main Synora inference infrastructure unless Foundry economics materially improve.

## Native `synora code` Installation

The active launcher resolves to:

```bash
command -v synora
# /home/ubuntu/.local/bin/synora
```

The installed launcher points directly at this fork:

```bash
SYNORA_REPO="/home/ubuntu/dev/synora/experiments/opencode"
SYNORA_PACKAGE="$SYNORA_REPO/packages/opencode"
```

For `synora code`, it preserves the caller directory while running the fork package with Bun:

```bash
exec env PWD="$CALLER_CWD" bun run --cwd "$SYNORA_PACKAGE" --conditions=browser src/index.ts "$CALLER_CWD" "$@"
```

This means the user can be anywhere on the instance, type `synora code`, and the fork starts while using the current shell directory as the working project directory.

The launcher also supports passing an explicit target path:

```bash
synora code /path/to/project
```

The initial runtime failure:

```text
Cannot find module 'react/jsx-dev-runtime'
```

was resolved by making the fork run from the package context with its dependencies available, rather than invoking the TypeScript entrypoint from an arbitrary directory without package resolution.

## Phase 1 Audit And Remediation

The implementation was audited against:

- `implementation_plan.md`
- `synora-opencode-framework.md`
- `phase1_repo_map.md`
- The actual codebase, with zero trust given to the docs or repo map.

The audit outcome was that Phase 1 was mostly implemented but had several pilot-blocking gaps. The remediation was executed in code rather than left as a staged plan.

Primary Phase 1 completion work landed in:

```text
5585dbca4 fix(opencode): complete Synora Phase 1 pilot readiness
```

That work closed the main pilot-readiness issues found during the audit and made the Synora fork operational as a provider-focused opencode distribution.

## Provider Catalog And Model Selection

The Synora catalog was narrowed and customized so `/model` presents only the intended Synora providers:

- Synora Bedrock
- Synora Foundry

The Foundry catalog includes:

- GPT-5.4 Synora Foundry
- GPT-5.3 Codex Synora Foundry
- DeepSeek V4 Pro Synora Foundry
- DeepSeek V4 Flash Synora Foundry
- Kimi K2.6 Synora Foundry

The Bedrock catalog includes current Claude models exposed through Synora Bedrock.

### Recent Model Duplication Fix

Bug found:

When a selected model moved into `Recent`, it disappeared from its provider list or produced duplicate moving selector bars in the `/model` dialog.

Fix:

```text
abdef3c44 fix(tui): use row identity for dialog selection
```

The TUI selection state now uses row identity, so the model in `Recent` and the same underlying model in its provider section do not create a second active selector marker.

## Usage And Cost Accounting

Bug found:

Cost and token usage were not reliably visible in the bottom prompt area or right-side context panel, and Foundry usage could remain at `$0.00 spent`.

Relevant fix:

```text
7dfd1edb2 fix(llm): account chat prompt cache hits
```

The OpenAI-compatible chat protocol now maps cache usage from both:

- `prompt_tokens_details.cached_tokens`
- `prompt_cache_hit_tokens`

This means Synora can account GPT/OpenAI-style cache fields and DeepSeek-style cache fields when the provider returns them.

## Kimi Continuation Bug

Bug found:

Kimi K2.6 on Foundry answered the first message, then failed on continuation or resumed sessions with:

```text
ProviderShared.request: OpenAI Chat assistant messages only support text and tool-call content for now
```

Root cause:

Kimi returns assistant reasoning/thinking content on the first response. Synora persisted that content, then later tried to replay it through an OpenAI-compatible chat message lowerer that only accepted text/tool-call assistant content.

Fix:

```text
4ce75d561 fix(llm): preserve chat reasoning on continuation
```

The OpenAI-compatible chat lowerer now preserves assistant reasoning content correctly, allowing Kimi sessions to continue after the first response.

## Canonical Reasoning And Thinking Controls

User requirement:

Reasoning controls must be canonical to each provider/model family, not heuristic.

Research was performed against vendor documentation and provider behavior, including:

- OpenAI reasoning controls
- Moonshot/Kimi thinking mode documentation
- DeepSeek thinking mode documentation
- AWS Bedrock Claude extended/adaptive thinking documentation

Fix:

```text
6a280b876 fix(provider): expose canonical reasoning variants
```

Current Synora behavior:

- GPT Foundry variants expose the OpenAI reasoning efforts used by the vendor, including `none`, `minimal`, `low`, `medium`, `high`, and `xhigh`.
- Kimi defaults to thinking enabled by the model/provider; Synora exposes a disabled/instant-style variant where supported.
- DeepSeek exposes the supported thinking choices through the OpenAI-compatible chat route, including mapped higher-effort options where the provider contract supports them.
- Claude Bedrock exposes adaptive/extended thinking variants according to AWS Bedrock and Anthropic contract constraints.

The important policy decision was that `minimal` is canonical vendor wording for GPT/OpenAI reasoning, but it is not assumed for Kimi, DeepSeek, or Claude unless their own contract uses it.

## Build And Verification Commands

Package-level checks were run from package directories, consistent with repo instructions.

LLM package:

```bash
cd packages/llm
bun test test/provider/openai-chat.test.ts
bun test test/provider/openai-chat.test.ts test/provider/bedrock-converse.test.ts
bun typecheck
```

Opencode package:

```bash
cd packages/opencode
bun test test/provider/synora.test.ts
bun typecheck
```

Single binary-style local build:

```bash
cd packages/opencode
MODELS_DEV_API_JSON=/home/ubuntu/dev/synora/experiments/opencode/packages/opencode/test/tool/fixtures/models-api.json \
  bun run build --single --skip-install --skip-embed-web-ui
```

Launcher sanity:

```bash
synora code --version
# local
```

## Foundry Cache Smoke Harness

A live backend smoke harness was added:

```text
9f31b2700 test(opencode): add Foundry cache smoke harness
```

Script:

```bash
packages/opencode/script/synora-foundry-cache-smoke.ts
```

The harness starts the Synora server in-process, creates a titled session to avoid extra title-generation traffic, sends real requests through the local HTTP handlers, then reads stored assistant message usage from Synora.

Example command:

```bash
cd packages/opencode
bun run script/synora-foundry-cache-smoke.ts --turns=3 --prefix-tokens=12000 --budget=100000
```

DeepSeek high-budget rerun:

```bash
cd packages/opencode
bun run script/synora-foundry-cache-smoke.ts \
  --models=DeepSeek-V4-Pro,DeepSeek-V4-Flash \
  --turns=3 \
  --prefix-tokens=12000 \
  --budget=500000
```

## Live Cache Results

### GPT-5.4 Foundry

Result:

```text
verdict:        pass
totalInput:     81,684
totalCacheRead: 54,016
totalCacheWrite: 0
```

The GPT Foundry route showed strong cache reuse after the first large-prefix request.

### GPT-5.3 Codex Foundry

Result:

```text
verdict:        pass
totalInput:     81,702
totalCacheRead: 54,144
totalCacheWrite: 0
```

This model also showed strong cache reuse.

### Kimi K2.6 Foundry

Observed result under normal committed contract:

```text
verdict:        unexpected-cache-accounting
totalInput:     81,621
totalCacheRead: 27,184
totalCacheWrite: 0
```

Per-turn behavior was inconsistent:

- Turn 1: essentially no useful cache read
- Turn 2: strong cache read
- Turn 3: cache dropped back to near zero

Explicit cache-control experiment:

Synora temporarily sent `prompt_cache_key` to Kimi Foundry. Foundry rejected it:

```text
HTTP 400
Unrecognized request argument supplied: prompt_cache_key
```

Conclusion:

Kimi direct/Moonshot behavior may support deterministic prompt cache controls, but Azure AI Foundry's Kimi route does not accept that control through this OpenAI-compatible endpoint. Synora therefore cannot force deterministic Kimi prompt caching on Foundry today.

### DeepSeek V4 Pro Foundry

High-budget rerun:

```text
verdict:         unsupported-by-contract
totalInput:      118,098
totalCacheRead:  0
totalCacheWrite: 0
budgetExceeded:  false
```

Turns:

```text
turn 1 input: 39,338, cacheRead: 0, cost: 0.06847596
turn 2 input: 39,366, cacheRead: 0, cost: 0.06852468
turn 3 input: 39,394, cacheRead: 0, cost: 0.06857340
```

### DeepSeek V4 Flash Foundry

High-budget rerun:

```text
verdict:         unsupported-by-contract
totalInput:      118,104
totalCacheRead:  0
totalCacheWrite: 0
budgetExceeded:  false
```

Turns:

```text
turn 1 input: 39,340, cacheRead: 0, cost: 0.00550984
turn 2 input: 39,368, cacheRead: 0, cost: 0.00551376
turn 3 input: 39,396, cacheRead: 0, cost: 0.00551768
```

Conclusion:

Synora now knows how to account DeepSeek-style cache fields if they are returned, but Azure Foundry did not return visible cache hits in this live test.

## Tokenization Observation

DeepSeek tokenized the synthetic stable prefix much more heavily than GPT/Kimi.

In the same smoke-test shape:

- GPT/Kimi first large-prefix turns were roughly 27k input tokens.
- DeepSeek first large-prefix turns were roughly 39k input tokens.

This means the same text can consume materially more context and budget under DeepSeek. Model economics therefore cannot be judged from nominal per-million-token pricing alone. Tokenizer behavior, prompt cache hit rate, and provider billing semantics all matter.

## Economics And Infrastructure Assessment

The live evidence supports this working assumption:

For long Synora coding sessions with repeated context, GPT Foundry models can be cheaper per completed task than their sticker price suggests, because they show strong prompt-cache reuse. That does not mean Azure bills are automatically correct or attractive. It means Synora-side usage telemetry proves cache reuse is being reported by the provider route for GPT.

The user reported Azure Foundry billing around 80 EUR for a few-hour Kimi session with about 100 million input tokens and only a few hundred thousand output tokens. Given Kimi's inconsistent cache behavior in Synora live smokes and Foundry's rejection of explicit cache controls, that billing pattern is plausible enough to treat Kimi Foundry as economically risky for long-context coding sessions.

DeepSeek Foundry may still be useful when model behavior is uniquely valuable, but the current Synora route does not prove deterministic cache reuse or visible cache accounting.

AWS Bedrock Converse remains the preferred main infrastructure direction because:

- Native Claude cache behavior is strong and more controllable.
- The Converse API has clearer provider semantics for Claude.
- AWS is already core Synora infrastructure.
- If AWS exposes GPT-5.4/GPT-5.5 with strong cache semantics, Synora can avoid using Foundry as the primary long-context inference layer.

Azure Foundry should be treated as an access layer for models not available elsewhere, not the default economic path for all Synora workloads.

## Current Recent Commits

Recent session commits:

```text
7dfd1edb2 fix(llm): account chat prompt cache hits
9f31b2700 test(opencode): add Foundry cache smoke harness
6a280b876 fix(provider): expose canonical reasoning variants
abdef3c44 fix(tui): use row identity for dialog selection
4ce75d561 fix(llm): preserve chat reasoning on continuation
5585dbca4 fix(opencode): complete Synora Phase 1 pilot readiness
```

Earlier relevant upstream/session history:

```text
c66a370a4 Implementation plan Phase 1 completed
3e559ded1 fix(opencode): add azure deepseek catalog metadata and usage debug logs
c13f32a46 fix(provider): enrich Azure Foundry catalog with DeepSeek V4 canonical metadata
0f568aade fix(azure): support Azure AI Foundry chat-completions deployments
93bd8a08a fix: support azure ai foundry chat-completions routing
41198186b chore: generate
```

## Residuals

Known residuals after this session:

- Azure billing must be reconciled against Synora message usage logs and Azure portal exports before calling it overbilling.
- Foundry Kimi cache cannot be made deterministic from Synora using `prompt_cache_key`; Azure rejects that parameter.
- Foundry DeepSeek cache behavior remains unproven. Synora can account the cache fields if returned, but the live Foundry smoke returned none.
- AWS quota issues prevented complete Bedrock live smokes during this session.
- The current `synora` launcher runs the TypeScript source directly with Bun. That is practical for the EC2 dev instance; a packaged production installer can be added later if needed.

## Operational Commands To Reproduce Key Checks

Run Synora Code from anywhere:

```bash
synora code
```

Check launcher:

```bash
command -v synora
sed -n '1,220p' /home/ubuntu/.local/bin/synora
```

Run Foundry cache smoke for all Foundry models:

```bash
cd /home/ubuntu/dev/synora/experiments/opencode/packages/opencode
bun run script/synora-foundry-cache-smoke.ts --turns=3 --prefix-tokens=12000 --budget=100000
```

Run Foundry cache smoke for DeepSeek only with larger budget:

```bash
cd /home/ubuntu/dev/synora/experiments/opencode/packages/opencode
bun run script/synora-foundry-cache-smoke.ts \
  --models=DeepSeek-V4-Pro,DeepSeek-V4-Flash \
  --turns=3 \
  --prefix-tokens=12000 \
  --budget=500000
```

Typecheck packages:

```bash
cd /home/ubuntu/dev/synora/experiments/opencode/packages/llm
bun typecheck

cd /home/ubuntu/dev/synora/experiments/opencode/packages/opencode
bun typecheck
```

Build local fork artifact:

```bash
cd /home/ubuntu/dev/synora/experiments/opencode/packages/opencode
MODELS_DEV_API_JSON=/home/ubuntu/dev/synora/experiments/opencode/packages/opencode/test/tool/fixtures/models-api.json \
  bun run build --single --skip-install --skip-embed-web-ui
```
