# 追问（quick-ask，本地插件）

在对话里划选一段文字，点选区旁的「追问」，弹出一个用完即弃的小窗：可以就这段文字连续提问，问答不会写回主线。

## 它怎么工作

- 纯客户端插件，注册两个 Slot：`conversation.composer.dock`（用隐形标记拿到当前会话 id 和它的滚动容器）和 `shell.overlay`（选区旁的按钮与浮窗本体）。
- 打开小窗时 `sessions.fork({ atSeq: 主线最后一条 durable 事件 })` 分叉一个子会话，再 `retain` + `prompt` 继续追问。子会话继承主线到分叉点为止的完整历史，也继承主线的 preset；provider / model 取 fork 时的全局默认模型，不跟随主会话的 session 级模型选择。
- 关闭小窗时释放引用并归档子会话（`archiveSession`，同时停掉还在跑的生成）。fork 还没完成就关闭会走取消路径：释放已创建的引用并归档子会话，弹窗不会复活。主线上下文完全不受影响。

## 安装（每台机器一次）

1. 本目录放在本机任意位置（建议保持仓库内路径 `local/plugins/quick-ask`，profile 的软链指向这里）；
2. 装成当前 profile 的 bundle：
   - GUI：Plugins → 安装 → 选择「绝对本地目录」→ 指向 `...\local\plugins\quick-ask`；
   - 或让 agent 调 `plugin_manager`：`action: install_bundle`，`target` 填本目录的绝对路径。
3. **重启 DSH 一次并验证**。安装当下会热生效，但重启才能证明它是持久的（早期版本曾因客户端插件抢在 `sessions` 服务之前激活而静默失效）。
4. 验证：对话里划词 → 原生「引入文本」气泡右侧出现「追问」→ 点开、提问、关掉，主线不应多出任何内容。

## 兼容性

- 无 npm 依赖、无需编译；`client.js` 手写，直接由客户端模块加载器加载，`dsh.client` 声明 `platform: web`。
- 不碰模型层：官方 API、CodeBuddy 桥、内网 tt-switch 路由都可用（模型路由由子会话继承）。
- 需要的客户端能力：`sessions.fork/retain/binding`、`session.prompt/cancel`、`uiWorkspace.archiveSession`（DSH 0.2.2-alpha.3 已提供）。

## 已知限制

- 与原生「引入文本」是两个并列浮层；合并成同一条动作条需要改 `ui-conversation` 的选区分发契约（源码改动）。
- 小窗不是只读的：子会话是完整 agent，追问如果触发工具调用，改动会真实落在工作区；关闭只是归档，不提供回滚。
- 子会话是真实 fork：会在侧边栏短暂出现，关闭后进入归档（可找回），不是物理删除。要“一点都不落盘”需要后端方案（Host 插件直连 `ctx.llm` + 自己的消息数组），当前没做。
- Markdown 渲染是本地子集：标题、列表、代码块、引用、粗斜体、行内代码、链接；不支持表格和图片。
- 每次追问都会把主线到分叉点的完整历史发给模型——和主线自己发一轮同阶成本，长会话下会更慢。

## 更新

改完 `client.js`：DSH 运行中且客户端 HMR 生效时保存即热更新；否则重启应用。纯逻辑和 fork 生命周期的回归可以用 `npm test`（`node --test test/logic.test.mjs`）跑，不依赖 DSH。
