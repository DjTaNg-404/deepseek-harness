---
description: "Shared DeepSeek credential resolution for the experimental speech providers."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-speech-deepseek-key

English | [中文](README.zh.md)

## Summary

This small library resolves the DeepSeek API key once for the experimental speech providers, so the recognizer and the synthesizer name the same credential and reject the same unusable values. It returns a result instead of throwing, because each provider reports the problem through its own failure type.

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

Call `resolveSpeechKey(ctx, literal, reference)` before a provider touches the network. A literal key wins over the reference; otherwise the credentials service is read, falling back to the launch environment when no such service is composed. The result is `{ ok: true, key }` or `{ ok: false, problem, message }`, where `problem` is `missing`, `blank`, or `unsafe` and `message` names the credential and the remedy.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

The check trims the value and rejects an empty result or one containing control characters, which no Authorization header can carry. Resolution is per call, so a rotated credential applies to the next request without remounting the provider. Returning a discriminated result keeps this library free of provider error classes and keeps each provider's failure mapping local.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

[DeepSeek recognizer](../speech-to-text-deepseek/README.md), [DeepSeek synthesizer](../speech-synthesis-deepseek/README.md)

-----

<a id="model-experience"></a>
## Model Experience

None, as credential resolution touches no model request and adds no Session event.

#### KV Cache effect

No direct effect; the library never reads conversation content.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Only API keys are resolved. The signed-in account route used by model and search requests is not supported here.
- The fallback chain is fixed: credentials service, then the launch environment. A provider cannot inject a third source without changing this library.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

This package exists because two providers otherwise carry the same twenty-line resolver, which the repository duplication gate rejects. It has no Config, so it never appears as a selectable plugin; the providers embed it.

</details>
