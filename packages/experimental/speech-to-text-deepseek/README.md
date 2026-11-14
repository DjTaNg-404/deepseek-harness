---
description: "DeepSeek cloud speech recognition through the experimental speech seam."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-speech-to-text-deepseek

English | [中文](README.zh.md)

## Summary

This Service Provider registers a `cloud` recognizer with `ctx.speechToText` that sends one complete recording to `POST /v1/tools/asr` on the DeepSeek API. It needs no model download, so it is selectable the moment the voice input bundle is enabled, and it races no other recognizer: a failed upload stays failed instead of falling back to the local model.

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

Enable the [voice input bundle](../voice-input-bundle/README.md) in the plugin manager. The bundle composes this provider unconditionally; open the bundle details and select `DeepSeek ASR (cloud)` as the recognizer. The local `sensevoice-local` provider stays the default, so a deployment that never picks the cloud recognizer uploads nothing.

The API key defaults to the `DEEPSEEK_API_KEY` credential reference, read through the credentials service and falling back to the launch environment. Set `apiKey` to override it with a literal value, and `baseURL` to reach a gateway origin; `/v1/tools/asr` is appended and paths are rejected. `timeoutMs` bounds one upload plus recognition, and `maxAudioBytes` defaults to the endpoint's 8 MiB limit.

Audio leaves the machine when this provider is selected. Transcription is billed separately from tokens at the published per-hour rate, and the recording is a complete file: the client resamples to 16 kHz mono PCM16 WAV before upload.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

Activation registers the provider and touches no network: the credential is resolved and the endpoint contacted only when a recording arrives. A missing or header-unsafe key fails that recording with an `unconfigured` error that names the credential, instead of hiding the provider from the roster.

The provider has no `preparation` member, which tells the UI there is nothing to download. It rejects a recording larger than `maxAudioBytes` before resolving a credential, then posts `multipart/form-data` with a single `file` part named `speech.wav`. The caller's `AbortSignal` and the configured deadline are combined, so disposal or cancellation aborts the request; a deadline hit reports `timeout`, while a caller abort propagates unchanged.

The endpoint answers a failed recognition with HTTP 200 and an `error` object, so a body-level error fails the call rather than producing empty text. A success body must carry `text` and `duration_ms`; `duration_ms` becomes `audioSeconds` and `inferenceSeconds` measures the round trip. Status codes map to documented failure classes (`rejected`, `too-large`, `rate-limited`, `unavailable`, `timeout`) so consumers can distinguish retryable from terminal causes without parsing prose.

The endpoint detects the language itself and carries no language field, so the stored hint is advisory: the provider advertises the documented language list for the selection UI but never sends it.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

[Voice input subsystem](../../../docs/subsystems/voice-input.md)

-----

<a id="model-experience"></a>
## Model Experience

None, as recordings remain outside model requests; ordinary user submission owns any later text.

#### KV Cache effect

No direct effect; ordinary submission owns the message content.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Only complete-recording transcription is supported. The endpoint accepts no stream, so there is no partial transcript while the user is still speaking.
- One recording is limited to 120 seconds and 8 MiB; longer audio must be split by a consumer that also owns segment ordering.
- Language selection is advisory: the endpoint detects the language and rejects nothing, so a wrong hint cannot force a language.
- The provider authenticates with an API key only. The signed-in account route used by model and search requests is not wired, so account-only deployments must also configure the credential reference.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

The endpoint specification is owned by the DeepSeek API speech recognition guide; request limits and error codes are protocol constants. `providerId`, `baseURL`, `apiKey`, `apiKeyEnv`, `timeoutMs`, and `maxAudioBytes` are deployment choices and stay in Config.

</details>
