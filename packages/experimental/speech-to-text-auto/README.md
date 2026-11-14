---
description: "Routing recognizer that selects the local or cloud speech provider per recording."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-speech-to-text-auto

English | [中文](README.zh.md)

## Summary

This Service Provider registers `speech-auto`, a recognizer that decides per recording between an offline-first local provider and a cloud provider. The decision uses only provider facts — advertised languages and preparation readiness — so it is deterministic, and every fallback names an explicit target instead of looping through the router.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Compose it after both targets; the [voice input bundle](../voice-input-bundle/README.md) mounts it after `sensevoice-local` and `deepseek-cloud` and leaves the plain local provider as the default selection. `localProviderId` and `cloudProviderId` name the two targets, `retryCloudOnEmpty` retries the cloud provider when the local one returns no text, and `fallbackLocalOnError` falls back to a ready local model when the cloud provider fails.

The router advertises the documented DeepSeek language superset rather than reading its targets at activation: the Loader composes plugins concurrently, so a union captured then would race whichever target registers later. A target that is missing at request time fails that recording explicitly. The router reports itself as `cloud`, because a recording may leave the machine.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

A recording goes local when the local provider is ready and advertises the stored hint, and to the cloud provider otherwise — including a language outside the local vocabulary and an unprepared or failed local model. An empty local transcript retries the cloud once when configured, and a non-abort cloud failure falls back to a ready local model. Both fallbacks execute an explicit id, so the router never re-enters itself; a configuration naming itself as a target fails at load. A fallback target that does not advertise the hint receives `auto`, because the registry rejects an unsupported language before the provider sees it.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

[Speech recognition service](../speech-to-text/README.md), [DeepSeek recognizer](../speech-to-text-deepseek/README.md), [voice input subsystem](../../../docs/subsystems/voice-input.md)

-----

<a id="model-experience"></a>
## Model Experience

None, as routing returns transient text through the same registry; ordinary user submission owns any model-visible text.

#### KV Cache effect

No direct effect; ordinary submission owns the message content.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Routing is decided before execution from readiness and language coverage, not from audio content; a poor local transcript that is not empty stays local.
- One recording uses one target. Segment-level routing inside a recording needs a consumer that splits and orders the parts.
- The advertised language list is captured at activation; a target registered later is not reflected until reload.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

`providerId`, `localProviderId`, `cloudProviderId`, `retryCloudOnEmpty`, and `fallbackLocalOnError` are deployment choices. The router reads only the public registry surface (`snapshot`, `resolve`, `transcribe`), so it needs no provider-specific knowledge.

</details>
