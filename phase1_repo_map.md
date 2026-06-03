# Phase 1 Repository Map

Date: 2026-06-02

This map is the first Phase 1 implementation artifact. It records the package and surface decisions before deletion/gutting work.

## Keep

| Path                                 | Current purpose                                                  | Direct dependents                        | Action                                    | Reason                                                                 | Verification                                     |
| ------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------ |
| `packages/opencode`                  | CLI/TUI, session loop, tools, storage, provider/runtime boundary | root scripts                             | Keep and rebuild internals                | Core Synora harness package                                            | `bun typecheck`, targeted tests from package dir |
| `packages/llm`                       | Native protocol runtime and canonical LLM events                 | `packages/opencode`                      | Keep and promote                          | Best fit for Synora native Foundry/Bedrock routing                     | `bun typecheck`, protocol tests from package dir |
| `packages/core`                      | Shared core types/utilities used by retained packages            | `packages/opencode`, `packages/llm`      | Keep and gut provider-zoo leftovers later | Required shared library                                                | `bun typecheck` from retained dependents         |
| `packages/sdk` and `packages/sdk/js` | API client/types used by TUI/server paths                        | `packages/opencode`, plugin/runtime code | Keep initially                            | Needed until TUI/server dependency graph is narrowed                   | SDK build only when SDK surface changes          |
| `packages/plugin`                    | TUI/plugin type surface used by retained runtime                 | `packages/opencode`                      | Keep initially                            | Retained TUI imports plugin types/runtime slots                        | `bun typecheck` from package dir                 |
| `packages/ui`                        | Shared UI assets, including TUI audio files                      | `packages/opencode`                      | Keep minimal                              | `packages/opencode/src/cli/cmd/tui/attention.ts` imports audio from it | `bun typecheck` from opencode                    |
| `packages/effect-drizzle-sqlite`     | Local persistence support                                        | Retained storage/db stack                | Keep                                      | Required for local session storage                                     | package typecheck if touched                     |
| `packages/http-recorder`             | HTTP capture/test support                                        | `packages/opencode`, `packages/llm`      | Keep initially                            | Useful for protocol golden tests                                       | package tests if touched                         |
| `packages/script`                    | Shared repository scripts                                        | root/opencode scripts                    | Keep initially                            | Used by existing build/test tooling                                    | package typecheck if touched                     |

## Delete

| Path                                             | Current purpose                    | Action     | Reason                                  | Cleanup                                            |
| ------------------------------------------------ | ---------------------------------- | ---------- | --------------------------------------- | -------------------------------------------------- |
| `packages/desktop`                               | Desktop app                        | Delete     | Not part of TUI-first Synora harness    | Remove root `dev:desktop` and workspace references |
| `packages/app`                                   | Web/desktop app UI                 | Delete     | Public app surface, not Phase 1 backend | Remove root `dev:web`, turbo test entries, deps    |
| `packages/web`                                   | Public website                     | Delete     | Public docs/marketing surface           | Remove workspace package                           |
| `packages/docs`                                  | Public documentation               | Delete     | Not private backend runtime             | Remove docs references/assets                      |
| `packages/console`                               | Public/enterprise console packages | Delete     | Subscription/cloud product surface      | Remove workspace glob and scripts                  |
| `packages/enterprise`                            | Enterprise web surface             | Delete     | Public product surface                  | Remove workspace package                           |
| `packages/stats`                                 | Stats web/backend packages         | Delete     | Public telemetry/product surface        | Remove workspace glob and scripts                  |
| `packages/slack`                                 | Slack integration                  | Delete     | Not Phase 1 backend/TUI runtime         | Remove workspace package                           |
| `packages/storybook`                             | UI storybook                       | Delete     | Public UI/dev showcase surface          | Remove turbo entries                               |
| `packages/extensions`                            | Editor extensions                  | Delete     | Not TUI-first harness                   | Remove workspace package                           |
| `infra`, `sst.config.ts`, `sst-env.d.ts`         | Public deployment infrastructure   | Delete     | Not local Synora Phase 1 backend        | Remove root `sst` deps/scripts                     |
| public READMEs/translations/screenshots          | Public project documentation       | Delete/gut | Not private Synora runtime              | Keep only private plan docs and license            |
| `.opencode` public automation prompts/glossaries | Upstream issue/docs automation     | Delete/gut | Not part of Synora harness behavior     | Keep only if later needed for local dev            |

## Gut Or Rebuild

| Area                                                                                                | Action                                                            | Decision                                                               |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Provider catalogue and loaders                                                                      | Rebuild around Synora contracts                                   | No public provider zoo in Phase 1                                      |
| Provider auth onboarding UI                                                                         | Gut to Synora Foundry/Bedrock auth                                | No generic provider setup dialogs                                      |
| AI SDK provider dependencies                                                                        | Remove after native Synora route is wired                         | Keep only temporary dependencies required while bridging               |
| OpenRouter, Google, xAI, Copilot, GitLab, Venice, Alibaba, Gateway, generic OpenAI-compatible paths | Delete/gut                                                        | Not approved Synora providers                                          |
| opencode Go/Zen and subscription UX                                                                 | Delete/gut                                                        | Not part of Phase 1 Synora surface                                     |
| Prompt files tied to public opencode identity/docs                                                  | Defer until runtime is stable, then gut before Phase 1 acceptance | No prompt redesign in Phase 1, but removed feature text must disappear |

## Blockers And Notes

- `packages/ui` is kept because retained TUI code imports audio assets from it.
- `packages/sdk` is kept until TUI/server API dependencies are narrowed; deleting it first would break retained local runtime.
- Provider-zoo package dependencies are still present in `packages/opencode` and `packages/core`; they will be removed after the Synora native route replaces the current broad provider loader.
- Tests must be run from package directories, not the repository root.
