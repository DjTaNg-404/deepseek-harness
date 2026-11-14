---
description: "命名实验性语音合成 Provider 与路由。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-speech-synthesis

[English](README.md) | 中文

## 概述

此 Service Definition 通过 `ctx.speechSynthesis` 选择具名语音合成器。消费者在执行前解析自己的文本；Provider 独立注册。请求只校验一次——文本、音色与 Provider——因此 Provider 不会收到清单已经拒绝的请求。

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

把服务与至少一个 Provider、一个消费者组合，例如[朗读控件](../client-ui-read-aloud/README.zh.md)（位于[语音 Remote](../api-speech-to-text/README.zh.md) 之后）。`defaultProvider` 必填，且必须是已注册的准确 id；语音输入 Bundle 提供 `deepseek-tts`。`voiceId` 提供省略时的音色，默认取 Provider 的第一个音色。

`resolve()` 会去掉文本首尾空白，并拒绝空文本、未注册的 Provider、Provider 不提供的音色。文本长度上限留给 Provider，只有它知道自己按字符、计费字符还是字节计量。取消或注册撤销都会中止已受理的工作；已撤销的注册会拒绝后续调用，而不是静默切换合成器。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>维护者信息 — 点击展开</summary>

注册返回幂等 disposer，移除 Provider、中止其生命周期并等待已受理工作结束。`synthesize()` 把调用方信号与该生命周期合并，因此插件释放或客户端断开都不会留下仍在编码的音频。Provider 不需要准备：当前所有 Provider 都是云端接口，注册即可用。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

[DeepSeek 合成器](../speech-synthesis-deepseek/README.zh.md)、[语音输入子系统](../../../docs/subsystems/voice-input.zh.md)

-----

<a id="model-experience"></a>
## 模型体验

无，因为合成让音频留在模型请求之外；要朗读哪段文字由消费者决定。

#### KV 缓存影响

没有直接影响；被朗读的文本本来就是消费者持有的会话内容。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 只暴露整段文本合成。流式接口、按句节奏合成与播放控制属于消费者。
- 选择项属于组合配置，不是持久化的用户偏好；没有转录服务那样的 `configure()` 对应物。
- Provider 无法报告就绪状态或部分失败，因为接缝没有 preparation 成员。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者信息 — 点击展开</summary>

此接缝刻意省略准备阶段：需要下载模型的本地合成器必须同时扩展 `SynthesisProviderInfo` 与服务，而不是把下载硬接到这份契约上。

</details>
