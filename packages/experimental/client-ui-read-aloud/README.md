---
description: "Read finalized assistant answers aloud through the Host speech synthesis Remote."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-read-aloud

English | [中文](README.zh.md)

## Summary

This browser plugin adds a speaker control to the finalized-assistant action strip. It reads the answer text out of the Chat snapshot, splits it into sentence-sized chunks, asks the Host speech Remote to synthesize each chunk, and plays them in order through one Web Audio context. A second click silences playback immediately.

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

Enable the [voice input bundle](../voice-input-bundle/README.md); it mounts this control after the speech Remote. The speaker button appears beside the other actions under each completed answer. While reading, the same button stops playback, and a synthesis failure shows a short inline notice while the tooltip carries the provider's reason.

The control requires the bundle's speech Remote (`remote.speech`), because synthesis travels through the same authenticated namespace as transcription. Disabling the bundle withdraws both the button and any playback.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

The entry receives only the durable `messageId`; it reads the text through the Chat target's `useChat` standard hook and returns nothing for a message with no materialized prose, so historical or empty nodes never render a dead button. Prose is chunked at sentence boundaries at 400 characters, which keeps the first chunk audible quickly and stays well below the provider's 10,000-character limit; one sentence longer than the limit is sent whole and fails loudly instead of being cut mid-word. Each chunk is a separate Remote call, decoded with `decodeAudioData`, and awaited before the next chunk starts, so ordering is preserved without a streaming protocol. One `AudioContext` and one `AudioBufferSourceNode` are owned by the plugin; stopping aborts the in-flight request, stops the source, and resets the visible state. Disposal releases the controller so a closed Session cannot keep speaking.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

[Speech synthesis service](../speech-synthesis/README.md), [DeepSeek synthesizer](../speech-synthesis-deepseek/README.md)

-----

<a id="model-experience"></a>
## Model Experience

None, as playback never submits model input; the answer text is already session content.

#### KV Cache effect

No direct effect; reading changes no message.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Chunks play sequentially, not as a continuous stream; a long answer has a short gap between sentences.
- The voice is the Host's default selection. There is no in-chat voice picker, and no per-message voice memory.
- Reading starts only for a finalized answer whose node is materialized in the loaded window; older unloaded messages do not render the control.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

Copy lives in its own `read-aloud` locale namespace for the eight shipped interface languages. The component owns no persistence and writes no Session event, so the feature is inert for accounting besides the synthesis call itself.

</details>
