---
description: "实验性 DeepSeek 语音 Provider 共用的凭据解析。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-speech-deepseek-key

[English](README.md) | 中文

## 概述

这个小库为实验性语音 Provider 统一解析 DeepSeek API Key，使识别器与合成器指向同一个凭证，并拒绝同样的不可用取值。它返回结果而不是抛错，因为每个 Provider 用自己的失败类型报告问题。

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

在 Provider 触碰网络之前调用 `resolveSpeechKey(ctx, literal, reference)`。字面 Key 优先于引用；否则读取凭证服务，在没有该服务时回退到启动环境。结果是 `{ ok: true, key }` 或 `{ ok: false, problem, message }`，其中 `problem` 为 `missing`、`blank` 或 `unsafe`，`message` 指出需要设置的凭证与补救方式。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>维护者信息 — 点击展开</summary>

检查会去掉首尾空白，并拒绝空值或含控制字符的值——这类值无法放入 Authorization 请求头。解析按调用进行，因此轮换后的凭证在下一次请求即生效，无需重新挂载 Provider。返回可判别结果让本库不依赖任何 Provider 的错误类，也把各自的失败映射留在 Provider 内部。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

[DeepSeek 识别器](../speech-to-text-deepseek/README.zh.md)、[DeepSeek 合成器](../speech-synthesis-deepseek/README.zh.md)

-----

<a id="model-experience"></a>
## 模型体验

无，因为凭据解析不触碰模型请求，也不写会话事件。

#### KV 缓存影响

没有直接影响；本库从不读取对话内容。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 只解析 API Key。模型与搜索请求使用的登录账号路由不在此支持范围内。
- 回退链是固定的：先凭证服务，再启动环境。Provider 无法在不改动本库的前提下注入第三种来源。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者信息 — 点击展开</summary>

此包存在的原因是：两个 Provider 否则会各带一份二十行的解析器，而仓库的重复检测门禁会拒绝它。它没有 Config，因此不会作为可选插件出现；由 Provider 内嵌使用。

</details>
