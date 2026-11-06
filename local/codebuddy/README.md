# CodeBuddy 路由（本地桥）

这套文件把 `dsh` 接到 CodeBuddy：DSH 把模型请求发给本机的一个 OpenAI 兼容桥，桥翻译成 ACP，由 `codebuddy --serve` 执行，消耗 CodeBuddy 账号的额度。

```
dsh web :3080
  ──OpenAI /v1/chat/completions──▶  bridge :8000      (dsh-bridge，内网仓库)
  ──ACP over HTTP SSE────────────▶  codebuddy --serve :8321
  ──CLI 登录态计费───────────────▶  CodeBuddy 账号
```

## 为什么路由声明 `supportsTools: false`

桥把请求交给 CodeBuddy 自己的 agent 循环（ACP `clientCapabilities: {}`），工具由 CodeBuddy serve 执行。如果 DSH 仍然发送 `tools` 和提示词里的工具段，模型会叙述一些永远不会被执行的调用，历史里每一轮还会把这些调用当纯文本重放一遍。`defaultSupportsTools: false` 让工具准入为空，于是线上不带工具、提示词也不带工具段。

## 前置条件

- Node.js ≥ 24.9 与 pnpm（运行 `dsh` 源码）
- Python 3（桥的运行环境，建议在 `dsh-bridge/` 下建 `.venv`）
- CodeBuddy CLI，并且至少完成一次登录（登录态持久化在 `~/.codebuddy`）
- 内网仓库里的 `dsh-bridge`：`<INTERNAL_GIT_URL>/dsh-bridge.git`（**不在本仓库中**，见下面的步骤 1）

## 安装

1. 取桥的源码，放在本仓库的同级目录：

   ```powershell
   cd <你的工作目录>
   git clone <INTERNAL_GIT_URL>/dsh-bridge.git
   cd dsh-bridge
   python -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   ```

2. 把模型路由写进当前 profile。把 [`llm-pi-ai.patch.yml`](llm-pi-ai.patch.yml) 的内容并入 `~/.dsh/profiles/<profile>/cordis.patch.yml`，或者作为一层 overlay 传进去：

   ```powershell
   pnpm dsh web --patch local/codebuddy/llm-pi-ai.patch.yml
   ```

3. 按 [`.env.example`](.env.example) 写 `~/.dsh/.env`。`BRIDGE_API_KEY` 是本地桥自己定的凭据，随便给一个值即可；它不是任何平台的 key。

4. 完成 CodeBuddy 登录（只需一次）：

   ```powershell
   codebuddy
   ```

5. 启动：

   ```powershell
   pwsh -File local/codebuddy/dsh-start.ps1
   ```

   启动器会先拉起 [`supervisor.mjs`](supervisor.mjs)（守护 `codebuddy --serve` 与 `bridge.py`），再启动 `dsh web`，最后打开浏览器。桥起不来只提示、不阻塞 deepseek 模型。

停止：`pwsh -File local/codebuddy/dsh-stop.ps1`，它会先停守护及其整棵子进程树。

## 文件

| 文件 | 作用 |
| --- | --- |
| [`supervisor.mjs`](supervisor.mjs) | 守护进程：拉起并健康检查两个子进程，崩溃退避重启，退出时清理进程树。支持 `--status` / `--check` / `--stop` |
| [`dsh-start.ps1`](dsh-start.ps1) | 启动桥守护与 `dsh web`，等待就绪后打开页面 |
| [`dsh-stop.ps1`](dsh-stop.ps1) | 先停守护与子进程，再停 `dsh web` |
| [`llm-pi-ai.patch.yml`](llm-pi-ai.patch.yml) | 路由配置：provider、模型清单、`defaultSupportsTools: false` |
| [`.env.example`](.env.example) | 环境变量清单，复制到 `~/.dsh/.env` 后填写 |

## 能力边界

- CodeBuddy 的读写文件、执行命令发生在 `CODEBUDDY_CWD` 指向的目录，权限由 `CODEBUDDY_PERMISSION_MODE` 决定。
- DSH 自己的工具链、skills、MCP、subagent、审批与 diff 视图不参与这条路由。
- 每轮对话都会新建一次 ACP 会话并重发完整历史，长对话的 token 与首字延迟高于直连模型。
- 桥目前不回传真实 usage，成本面板显示 0。
- 桥放在内网仓库，不随本仓库分发；换机器时需要能访问内网。

## 排障

```powershell
node local/codebuddy/supervisor.mjs --status   # 两个服务是否健康 + PID 文件
node local/codebuddy/supervisor.mjs --check    # 都健康则退出码 0
node local/codebuddy/supervisor.mjs --stop     # 停掉守护与两个子进程
```

日志在 `%TEMP%\dsh-bridge\supervisor.log`，带 `[codebuddy]` 与 `[bridge]` 前缀的是子进程输出。桥返回 401/403 表示 CodeBuddy 登录态失效，重新运行 `codebuddy` 登录后重启 dsh 即可，deepseek 模型不受影响。
