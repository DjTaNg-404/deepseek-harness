# local —— 本机改动（不属于上游）

这里的东西都是**本地私有**的：不随上游升级冲突，也不影响 dsh 本身的行为。目录按「插件 / 脚本」分开，两个平台命令同名。

```
local/
├── plugins/quick-ask/        划词「追问」插件（纯客户端，无 npm 依赖、不用编译）
└── scripts/                  启停 dsh 与安装插件
    ├── dsh-start.sh  / .ps1
    ├── dsh-stop.sh   / .ps1
    └── install-quick-ask.sh / .ps1
```

> 早先的 `local/codebuddy/`（CodeBuddy 路由桥、supervisor、`.env.example`）已经删掉了。它整条链路依赖内网仓库的 `dsh-bridge`（Python 桥），本机拿不到就跑不通；连带删掉的还有分支上为它改的 `supportsTools` 能力位、模型选择器的工具能力提示等源码改动——现在这个分支等于「官方 master + quick-ask 插件」。

## 前置条件

- Node.js **>= 24.9**（`node -v` 自查）
- 仓库里执行过 `pnpm install`（脚本会检查 `node_modules`，没有就提示你先装）

## 用法

| 动作 | macOS / Linux | Windows |
|---|---|---|
| 启动 | `local/scripts/dsh-start.sh` | `local\scripts\dsh-start.ps1` |
| 停止 | `local/scripts/dsh-stop.sh` | `local\scripts\dsh-stop.ps1` |
| 装 quick-ask | `local/scripts/install-quick-ask.sh` | `local\scripts\install-quick-ask.ps1` |

启动脚本会：后台拉起 `dsh web --no-open`，把日志写到 `$DSH_HOME/logs/`，等它打印出带 token 的地址后自动开浏览器。已经在跑就只开页面，不会起第二个实例。

停止脚本会先收子进程再收父进程，5 秒不退就强杀；pid 文件丢了还会按端口兜底。

## 环境变量

| 变量 | 默认 | 作用 |
|---|---|---|
| `DSH_HOME` | `~/.dsh` | 日志、pid、profile 的根目录 |
| `DSH_PORT` | `3080` | web 端口 |
| `DSH_REPO` | 脚本上两级 | 仓库根（脚本搬到别处时指定） |
| `DSH_PROFILE` | `web` | 装插件时写入的 profile |

## quick-ask

划选一段文字 → 选区旁出现「追问」→ 点开连续提问；问答走**分叉出来的子会话**，不写回主线，关窗即归档。

安装（每台机器一次）：跑 `install-quick-ask.*`，它会 `dsh plugin --profile web add <本目录绝对路径>`，再用 `--dump-config` 核一遍组合树里有没有 `quick-ask`。

装完**必须重启 dsh** 再看效果：安装当下是热生效，重启才能证明它是持久的。验证方法见 `local/plugins/quick-ask/README.md`。

如果脚本报「组合树里没看到 quick-ask」，走 GUI 的 Plugins → 安装 → 绝对本地目录，指向 `local/plugins/quick-ask` 的绝对路径即可。
