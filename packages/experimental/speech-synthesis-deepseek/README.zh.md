---
description: "通过实验性合成接缝接入的 DeepSeek 云端语音合成。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-speech-synthesis-deepseek

[English](README.md) | 中文

## 概述

此 Service Provider 注册一个 `cloud` 合成器：把一段文本发送到 DeepSeek API 的 `POST /v1/tools/tts`，并返回浏览器可播放的 WAV。它公布文档化的音色与计费上限，并修正接口返回的流式 WAV 头，使浏览器的解码器能够接受这段音频。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

把[合成服务](../speech-synthesis/README.zh.md)与此 Provider 组合；[语音输入 Bundle](../voice-input-bundle/README.zh.md) 会同时挂载两者，并把 `deepseek-tts` 设为默认值。API Key 默认取自 `DEEPSEEK_API_KEY` 凭证引用，优先经凭证服务读取，缺失时回退到启动环境。`baseURL` 可指向网关源站，请求会追加 `/v1/tools/tts`。

接口每次请求最多接受 10,000 个计费字符（汉字算两个）与 64 KiB 请求体；更长的文本必须由消费者切分。合成按字符计费，与 Token 分开计。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>维护者信息 — 点击展开</summary>

激活只注册 Provider，不触碰网络。合成请求发送 JSON `{ text, voice_id, format: 'wav', filter_markdown: true }` 并带 Bearer 凭据；Markdown 由服务端过滤，朗读回答不会念出格式符号。接口以流式 WAV 返回，RIFF 与 `data` 长度字段为 `0xFFFFFFFF`；Provider 用实际收到的字节数重写这两个字段（奇数数据块补一个填充字节），否则浏览器的 `decodeAudioData` 会拒绝。失败会映射为 `rejected`（含内容审核）、`rate-limited`、`unavailable`、`timeout` 或 `too-long`，便于调用方区分可重试与终态原因。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

[语音合成服务](../speech-synthesis/README.zh.md)、[朗读控件](../client-ui-read-aloud/README.zh.md)

-----

<a id="model-experience"></a>
## 模型体验

无，因为合成让音频留在模型请求之外。

#### KV 缓存影响

没有直接影响；被朗读的文本本来就是消费者持有的会话内容。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 接口不提供流式请求，因此一段文本要等整段合成完成后才能播放。
- 语速控制、声音克隆与 SSML 均未暴露；文档中的两个音色就是全部可选范围。
- 30 分钟的响应上限由接口执行，这里没有预检；切分长文本的消费者负责这个边界。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者信息 — 点击展开</summary>

接口规范由 DeepSeek API 的语音合成文档拥有；限制、音色与状态码是协议常量。`providerId`、`baseURL`、`apiKey`、`apiKeyEnv`、`timeoutMs` 属于部署选择，保留在 Config 中。

</details>
