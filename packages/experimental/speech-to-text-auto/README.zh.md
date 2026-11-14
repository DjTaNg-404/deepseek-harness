---
description: "按录音在本地与云端识别器之间路由的合成器 Provider。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-speech-to-text-auto

[English](README.md) | 中文

## 概述

此 Service Provider 注册 `speech-auto`：一段录音按哪个识别器处理，由它在离线优先的本地 Provider 与云端 Provider 之间决定。判断只依据 Provider 的事实——公布的语种与准备就绪状态——因此结果是确定的；每条回退都指向显式目标，不会绕回路由本身。

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

把它组合在两个目标之后；[语音输入 Bundle](../voice-input-bundle/README.zh.md) 会在 `sensevoice-local` 与 `deepseek-cloud` 之后挂载它，并仍把本地 Provider 作为默认选择。`localProviderId` 与 `cloudProviderId` 指定两个目标，`retryCloudOnEmpty` 在本地返回空文本时重试云端，`fallbackLocalOnError` 在云端失败时回退到已就绪的本地模型。

路由公布的是 DeepSeek 文档化的语种超集，而不是在激活时读取两个目标：Loader 是并发组合插件的，激活时取并集会和后注册的目标赛跑。请求时缺失的目标会让该次录音明确失败。它把自己标为 `cloud`，因为录音可能离开本机。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>维护者信息 — 点击展开</summary>

当本地 Provider 已就绪且公布的语言包含保存的提示时走本地，否则走云端——包括本地词表之外的语种，以及未准备或已失败的本地模型。配置允许时，空的本地转写会重试一次云端；云端发生非取消类失败时回退到已就绪的本地模型。两条回退都用显式 id 执行，因此路由器不会重入自身；配置把自己列为目标会在加载时失败。若回退目标不公布该语言提示，它收到的是 `auto`，因为注册表会在 Provider 看到请求之前拒绝不支持的语种。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

[语音识别服务](../speech-to-text/README.zh.md)、[DeepSeek 识别器](../speech-to-text-deepseek/README.zh.md)、[语音输入子系统](../../../docs/subsystems/voice-input.zh.md)

-----

<a id="model-experience"></a>
## 模型体验

无，因为路由经同一注册表返回临时文本；模型可见的文字由普通用户提交拥有。

#### KV 缓存影响

没有直接影响；普通提交拥有消息内容。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 路由在执行前依据就绪状态与语言覆盖决定，不看音频内容；本地转写质量差但不为空时仍留在本地。
- 一段录音只用一个目标。录音内部的分段路由需要负责切分与排序的消费者。
- 公布的语种列表在激活时确定；更晚注册的目标要等重载才会体现。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者信息 — 点击展开</summary>

`providerId`、`localProviderId`、`cloudProviderId`、`retryCloudOnEmpty`、`fallbackLocalOnError` 属于部署选择。路由器只读取注册表的公开接口（`snapshot`、`resolve`、`transcribe`），因此不需要任何 Provider 专属知识。

</details>
