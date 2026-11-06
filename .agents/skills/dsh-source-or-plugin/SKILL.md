---
name: dsh-source-or-plugin
description: Decide whether a requested DeepSeek Harness change belongs in a mounted plugin, an installed bundle, a profile patch, the runtime dynamic-plugin path, or the repository source, before writing any code. Use when a user asks for a feature, customization, or behavior change and the delivery mechanism is not fixed, or when a change reaches core packages for something a documented extension point already covers.
---

# Source or plugin

Answer one question before implementation: does the request add a capability at a documented extension point, or does it change a contract that several packages already share?

A capability is additive and reversible: a tool, an adapter, a backend, a command, a UI node. A contract is shared by consumers the change does not own: a type in `LlmModelInfo`, a session event shape, a prompt assembly order, an RPC surface, a composition rule. Capability findings are plugin work; contract findings are source work.

## Triage

1. Restate the request as behavior, not mechanism: what is observable, for whom, on which route.
2. Look it up in the extension-point map ([architecture](../../../docs/architecture.md#where-new-behavior-goes)). A row that names the behavior ends the search: mount there.
3. Check the seam's three roles before assuming a hole: the Service Definition may already accept a provider the requester has not considered. A missing row in the map is a missing seam, not a missing plugin.
4. Ask who else consumes the value the change touches. One package reading it means a private closure; several packages or a model-visible surface means a contract.
5. Ask where it must run: one machine, one profile, a team, or published. Distribution fixes the mechanism more often than the code does.

## Outcomes

| Finding | Mechanism |
|---|---|
| Additive capability, documented seam | plugin: a bundle, or a `--patch` overlay while iterating |
| Additive capability, no seam, one deployment | profile patch plus a local plugin; record why the seam is missing |
| Contract change shared across packages | repository source change, with the repository's docs/tests/snapshots |
| Throwaway experiment | runtime dynamic plugin (Creator mode); memory-only, gone on restart |
| Generic capability, no seam, likely useful elsewhere | upstream proposal first; fork only while it lands |

## Evidence to collect before recommending

- The exact file and line of the decision point, or the exact map row that covers the request.
- The consumers that would change, by package.
- Whether the behavior is model-visible. Model-visible means logged, so it needs a session event and cannot be faked by a plugin that only mutates a request.
- Whether the value is read at admission (tool set, prompt assembly) or at dispatch. Admission-time decisions usually have no plugin hook; dispatch-time decisions usually do.
- The verification available for each mechanism: repository gates for source changes; the plugin's own tests otherwise.

## Report before writing code

State the classification, the seam or the contract, the files that would change, how the result is verified, how it is distributed and rolled back, and what breaks on the next upstream upgrade. Do not start implementing until the user agrees with the classification; a wrong classification is paid again at every upgrade.

## Signals from this repository

- A new model-facing capability registers on `ctx.tools`; its schema joins prompt assembly automatically.
- A new provider registers on `ctx.llm`; `registerAdapter(providers, adapter)` is public, so a third-party adapter is plugin work.
- A route that runs the agent loop elsewhere needs a capability declaration in `LlmModelInfo`; the admission gate lives inside `ToolsService.resolve()`, so a plugin cannot withhold tools today.
- A per-model restriction of other packages' tools is not expressible through `tools.register({ when })`; that hook sees only its own registration.
- A behavior change that must survive a restart and be shared by every session belongs to a bundle, not a `--patch` overlay.
- Installed Host code runs in-process, outside the workspace sandbox; treat it as bash-level trust, and say so before recommending installation.
