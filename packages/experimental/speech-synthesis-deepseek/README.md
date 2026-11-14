---
description: "DeepSeek cloud speech synthesis through the experimental synthesis seam."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-speech-synthesis-deepseek

English | [中文](README.zh.md)

## Summary

This Service Provider registers a `cloud` synthesizer that sends one text to `POST /v1/tools/tts` on the DeepSeek API and returns browser-playable WAV. It advertises the documented voices and billing limit, and it repairs the streaming WAV header the endpoint returns so a browser decoder accepts the clip.

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

Compose the [synthesis service](../speech-synthesis/README.md) with this provider; the [voice input bundle](../voice-input-bundle/README.md) does both and sets `deepseek-tts` as its default. The API key defaults to the `DEEPSEEK_API_KEY` credential reference, read through the credentials service and falling back to the launch environment. `baseURL` reaches a gateway origin, and `/v1/tools/tts` is appended.

The endpoint accepts at most 10,000 billing characters per request, counting a Han character as two, and a 64 KiB request body; longer prose must be split by the consumer. Synthesis is billed per character, separately from tokens.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

Activation registers the provider and touches no network. A recording request sends JSON `{ text, voice_id, format: 'wav', filter_markdown: true }` with a bearer credential; Markdown is filtered server-side so a spoken answer does not read formatting syntax. The endpoint streams a WAV whose RIFF and `data` sizes are `0xFFFFFFFF`; the provider rewrites both fields from the received byte count (padding an odd data chunk) because a browser `decodeAudioData` call rejects the placeholder. A failure maps to `rejected` (including content review), `rate-limited`, `unavailable`, `timeout`, or `too-long` so callers can tell retryable from terminal causes.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

[Speech synthesis service](../speech-synthesis/README.md), [read-aloud control](../client-ui-read-aloud/README.md)

-----

<a id="model-experience"></a>
## Model Experience

None, as synthesis keeps audio outside model requests.

#### KV Cache effect

No direct effect; the spoken text is session content the consumer already holds.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The endpoint offers no streaming request, so a chunk is audible only after its whole synthesis completes.
- Playback speed, voice cloning, and SSML control are not exposed; the two documented voices are the entire roster.
- The 30-minute response ceiling is enforced by the endpoint, not pre-checked here; a consumer that splits long prose owns that bound.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

The endpoint specification is owned by the DeepSeek API speech synthesis guide; limits, voices, and status codes are protocol constants. `providerId`, `baseURL`, `apiKey`, `apiKeyEnv`, and `timeoutMs` are deployment choices and stay in Config.

</details>
