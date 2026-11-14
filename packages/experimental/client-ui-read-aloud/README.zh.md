---
description: "通过宿主语音合成 Remote 朗读已完成的助手回答。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-read-aloud

[English](README.md) | 中文

## 概述

此浏览器插件在已完成助手消息的操作条上加一个朗读按钮。它从 Chat 快照里取出回答文本，按句切成小段，请宿主语音 Remote 逐段合成，再通过同一个 Web Audio 上下文按顺序播放。再次点击会立即静音。

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

启用[语音输入 Bundle](../voice-input-bundle/README.zh.md)；它会在语音 Remote 之后挂载此控件。每条已完成回答下方会多出一个朗读按钮，位于其他操作旁边。朗读过程中同一个按钮用于停止播放；合成失败时显示简短的行内提示，具体原因在提示气泡里。

控件依赖 Bundle 的语音 Remote（`remote.speech`），因为合成与转录共用同一个带认证的命名空间。禁用 Bundle 会同时移除按钮与正在播放的音频。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>维护者信息 — 点击展开</summary>

条目只拿到持久的 `messageId`；它通过 Chat 目标的 `useChat` 标准钩子读取文本，对没有已生成正文的消息返回空，因此历史消息或空节点不会渲染出无用的按钮。正文在句边界切成 400 字符，既能尽快播出第一段，也远低于 Provider 的 10,000 字符上限；单句超长时整句发送并显式失败，而不是从词中间截断。每段是一次独立的 Remote 调用，用 `decodeAudioData` 解码，并等待播完再开始下一段，因此无需流式协议也能保证顺序。插件独占一个 `AudioContext` 与一个 `AudioBufferSourceNode`；停止会中止在途请求、停止音源并复位可见状态。释放会收起控制器，已关闭的会话不会继续发声。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

[语音合成服务](../speech-synthesis/README.zh.md)、[DeepSeek 合成器](../speech-synthesis-deepseek/README.zh.md)

-----

<a id="model-experience"></a>
## 模型体验

无，因为播放从不提交模型输入；回答文本本来就是会话内容。

#### KV 缓存影响

没有直接影响；朗读不改变任何消息。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 各段顺序播放而非连续流；长回答在句间会有短暂停顿。
- 音色取宿主的默认选择。聊天内没有音色选择器，也不按消息记忆音色。
- 只有已完成且在已加载窗口内出现的回答才会渲染控件；更早未加载的消息看不到入口。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者信息 — 点击展开</summary>

文案位于独立的 `read-aloud` 语言命名空间，覆盖随包发布的八种界面语言。组件不做持久化、不写会话事件，因此除合成调用本身外对计费没有影响。

</details>
