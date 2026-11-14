---
description: "通过实验性语音接缝接入的 DeepSeek 云端语音识别。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-speech-to-text-deepseek

[English](README.md) | 中文

## 概述

此 Service Provider 向 `ctx.speechToText` 注册一个 `cloud` 识别器，把一段完整录音发送到 DeepSeek API 的 `POST /v1/tools/asr`。它不需要下载模型，因此启用语音输入 Bundle 后即可选用；它也不与其他识别器竞争：上传失败就保持失败，不会回退到本地模型。

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

在插件管理页启用[语音输入 Bundle](../voice-input-bundle/README.zh.md)。Bundle 无条件组合此 Provider；打开 Bundle 详情，把识别器选为 `DeepSeek ASR (cloud)`。本地 `sensevoice-local` 仍是默认值，因此从不选择云端识别器的部署不会上传任何音频。

API Key 默认取自 `DEEPSEEK_API_KEY` 凭证引用，优先经凭证服务读取，缺失时回退到启动环境。设置 `apiKey` 可用字面值覆盖，设置 `baseURL` 可指向网关源站；请求会追加 `/v1/tools/asr`，带路径的取值会被拒绝。`timeoutMs` 限制一次上传加识别，`maxAudioBytes` 默认为接口的 8 MiB 上限。

选择此 Provider 后音频会离开本机。识别费用独立于 Token，按公开的每小时价格计费；录音是完整文件，客户端上传前已重采样为 16 kHz 单声道 PCM16 WAV。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>维护者信息 — 点击展开</summary>

激活只注册 Provider，不触碰网络：凭据在录音到达时才解析，接口也在那时才访问。缺失或无法放入请求头的 Key 会让该次识别以 `unconfigured` 失败并点名需要设置的凭证，而不是把 Provider 从清单里隐藏。

此 Provider 没有 `preparation` 成员，UI 因此知道没有需要下载的资源。它先拒收超过 `maxAudioBytes` 的录音，再解析凭据，然后以 `multipart/form-data` 发送单个名为 `speech.wav` 的 `file` 部分。调用方的 `AbortSignal` 与配置的截止时间会合并，因此释放或取消都会中止请求；命中截止时间报 `timeout`，调用方主动取消则原样传播。

接口在识别失败时以 HTTP 200 返回 `error` 对象，因此响应体里的错误会让本次调用失败，而不是产出空文本。成功响应必须带 `text` 与 `duration_ms`；`duration_ms` 转为 `audioSeconds`，`inferenceSeconds` 实测往返耗时。状态码映射到文档化的失败类别（`rejected`、`too-large`、`rate-limited`、`unavailable`、`timeout`），消费者无需解析文案即可区分可重试与终态原因。

接口自行识别语种，请求里没有语言字段，因此保存的语言提示只是建议：Provider 为选择 UI 公布文档化的语种列表，但从不发送它。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

[语音输入子系统](../../../docs/subsystems/voice-input.zh.md)

-----

<a id="model-experience"></a>
## 模型体验

无，因为录音不进入模型请求；之后的文字由普通用户提交拥有。

#### KV 缓存影响

没有直接影响；普通提交拥有消息内容。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 只支持完整录音的转录。接口不接受流，因此用户说话过程中没有部分识别结果。
- 单段录音限制为 120 秒与 8 MiB；更长音频必须由同时负责分段顺序的消费者切分。
- 语言选择只是建议：接口自行识别语言且不拒收，因此错误的提示无法强制语言。
- Provider 只用 API Key 认证。模型与搜索请求所用的登录账号路由尚未接入，因此仅靠账号的部署必须额外配置凭证引用。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者信息 — 点击展开</summary>

接口规范由 DeepSeek API 的语音识别文档拥有；请求限制与错误码是协议常量。`providerId`、`baseURL`、`apiKey`、`apiKeyEnv`、`timeoutMs`、`maxAudioBytes` 属于部署选择，保留在 Config 中。

</details>
