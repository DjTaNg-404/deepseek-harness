---
description: "Named experimental speech synthesis providers and their routing."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-speech-synthesis

English | [中文](README.zh.md)

## Summary

This Service Definition selects a named speech synthesizer through `ctx.speechSynthesis`. Consumers resolve their text before execution; providers register independently. A request is validated once — text, voice, and provider — so no provider receives a request the roster already refuses.

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

Compose the service with at least one provider and one consumer, for example the [read-aloud control](../client-ui-read-aloud/README.md) behind the [speech Remote](../api-speech-to-text/README.md). `defaultProvider` is required and names an exact registered id; the voice input bundle supplies `deepseek-tts`. `voiceId` supplies the omitted voice and defaults to the provider's first voice.

`resolve()` trims the text and rejects an empty text, an unregistered provider, and a voice the provider does not offer. Intake limits stay with the provider, which knows whether its own unit is characters, billing characters, or bytes. Cancellation and registration withdrawal abort accepted work; a withdrawn registration rejects later calls instead of silently switching synthesizers.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

Registration returns an idempotent disposer that removes the provider, aborts its lifetime, and joins accepted work. `synthesize()` combines the caller signal with that lifetime, so plugin disposal or a client disconnect cannot leave audio encoding running. Providers need no preparation: every current provider is a cloud endpoint, and the roster is usable the moment it registers.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

[DeepSeek synthesizer](../speech-synthesis-deepseek/README.md), [voice input subsystem](../../../docs/subsystems/voice-input.md)

-----

<a id="model-experience"></a>
## Model Experience

None, as synthesis keeps audio outside model requests; a consumer owns any text it chose to speak.

#### KV Cache effect

No direct effect; the spoken text is session content the consumer already holds.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Only whole-text synthesis is exposed. A streaming API, sentence-paced synthesis, and playback control belong to consumers.
- Selection is composition configuration, not a persisted user preference; there is no `configure()` counterpart to the transcription service.
- Providers cannot report readiness or partial failure, because the seam has no preparation member.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

The seam deliberately omits preparation: a local synthesizer that needs model downloads would have to extend `SynthesisProviderInfo` and the service together rather than bolt a download onto this contract.

</details>
