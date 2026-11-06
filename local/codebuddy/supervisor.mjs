#!/usr/bin/env node
/**
 * CodeBuddy 桥守护进程。
 *
 * 职责：拉起 `codebuddy --serve`（ACP 服务端）与 `dsh-bridge/bridge.py`（OpenAI 兼容层），
 * 做健康检查、崩溃退避重启、PID/日志落盘，并在退出时清理整棵子进程树。
 *
 * 用法：
 *   node supervisor.mjs           前台守护（由 dsh-start.ps1 以隐藏窗口拉起）
 *   node supervisor.mjs --stop    停止守护及其子进程
 *   node supervisor.mjs --status  打印状态（JSON）
 *   node supervisor.mjs --check   两个服务都健康则退出码 0（供脚本探测）
 *
 * 配置来源：进程环境 > ~/.dsh/.env。支持键：
 *   BRIDGE_API_KEY / BRIDGE_PORT / CODEBUDDY_SERVE_PORT / CODEBUDDY_CWD
 *   CODEBUDDY_PERMISSION_MODE / CODEBUDDY_MODEL / CODEBUDDY_MODELS / CODEBUDDY_API_KEY
 *   DSH_BRIDGE_DIR / DSH_BRIDGE_LOG_DIR
 */
import { spawn, spawnSync } from 'node:child_process'
import {
  appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const LAUNCHER_DIR = resolve(HERE, '..')
const BRIDGE_DIR = process.env.DSH_BRIDGE_DIR || resolve(LAUNCHER_DIR, '..', 'dsh-bridge')
const RUN_DIR = process.env.DSH_BRIDGE_LOG_DIR || join(tmpdir(), 'dsh-bridge')
const PID_FILE = join(RUN_DIR, 'supervisor.json')
const LOG_FILE = join(RUN_DIR, 'supervisor.log')
const MAX_LOG_BYTES = 5 * 1024 * 1024

function readDotEnv(file) {
  const out = {}
  if (!existsSync(file)) return out
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

const dotEnv = readDotEnv(join(homedir(), '.dsh', '.env'))
const env = { ...dotEnv, ...process.env }
// WorkBuddy 注入的 password 模式会覆盖 --auth none，必须清掉。
delete env.CODEBUDDY_GATEWAY_AUTH
delete env.CODEBUDDY_SERVE_TOKEN

const SERVE_PORT = env.CODEBUDDY_SERVE_PORT || '8321'
const BRIDGE_PORT = env.BRIDGE_PORT || '8000'
const SERVE_URL = `http://127.0.0.1:${SERVE_PORT}`
const BRIDGE_URL = `http://127.0.0.1:${BRIDGE_PORT}`
const CWD = env.CODEBUDDY_CWD || resolve(LAUNCHER_DIR, '..', 'deepseek-harness')
const SERVE_ARGS = ['--serve', '--port', SERVE_PORT, '--host', '127.0.0.1', '--auth', 'none']

const sleep = ms => new Promise(done => setTimeout(done, ms))

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  try {
    if (existsSync(LOG_FILE) && statSync(LOG_FILE).size > MAX_LOG_BYTES) rmSync(LOG_FILE)
    appendFileSync(LOG_FILE, line + '\n')
  } catch {
    // 日志失败不能影响守护
  }
}

async function healthy(url, headers = {}, timeoutMs = 2500) {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) })
    return res.ok
  } catch {
    return false
  }
}

const serveReady = () => healthy(`${SERVE_URL}/api/v1/health`, { 'x-codebuddy-request': '1' })
const bridgeReady = () => healthy(`${BRIDGE_URL}/health`)

function codebuddyCommand() {
  for (const name of ['codebuddy.cmd', 'codebuddy.exe', 'codebuddy']) {
    const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8' })
    if (probe.status === 0) {
      const first = probe.stdout.split(/\r?\n/).map(s => s.trim()).find(Boolean)
      if (first) return first
    }
  }
  const fallback = join(env.APPDATA || '', 'npm', 'codebuddy.cmd')
  return existsSync(fallback) ? fallback : null
}

function pythonCommand() {
  const candidate = process.platform === 'win32'
    ? join(BRIDGE_DIR, '.venv', 'Scripts', 'python.exe')
    : join(BRIDGE_DIR, '.venv', 'bin', 'python')
  if (existsSync(candidate)) return candidate
  return process.platform === 'win32' ? 'python' : 'python3'
}

function spawnServe() {
  const cb = codebuddyCommand()
  if (!cb) throw new Error('未找到 codebuddy 命令，请先安装 CodeBuddy CLI')
  // .cmd 需要经 cmd.exe 启动，避免 EINVAL。
  const child = process.platform === 'win32'
    ? spawn(env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${cb}"`, ...SERVE_ARGS], {
      cwd: CWD, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    })
    : spawn(cb, SERVE_ARGS, { cwd: CWD, env, stdio: ['ignore', 'pipe', 'pipe'] })
  pump(child, 'codebuddy')
  return child
}

function spawnBridge() {
  const py = pythonCommand()
  const child = spawn(py, ['bridge.py'], {
    cwd: BRIDGE_DIR,
    env: { ...env, CODEBUDDY_CWD: CWD, CODEBUDDY_SERVE_PORT: SERVE_PORT, BRIDGE_PORT },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  pump(child, 'bridge')
  return child
}

function pump(child, name) {
  const pipe = stream => stream.on('data', chunk => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (line.trim()) log(`[${name}] ${line}`)
    }
  })
  pipe(child.stdout)
  pipe(child.stderr)
  child.on('error', err => log(`[${name}] 启动失败：${err.message}`))
}

function killTree(pid) {
  if (!pid) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
  } else {
    try {
      process.kill(-pid, 'SIGTERM')
    } catch {
      try { process.kill(pid, 'SIGTERM') } catch { /* 已退出 */ }
    }
  }
}

function writePidFile(state) {
  try {
    if (!existsSync(RUN_DIR)) mkdirSync(RUN_DIR, { recursive: true })
    writeFileSync(PID_FILE, JSON.stringify(state, null, 2))
  } catch (err) {
    log(`写 PID 文件失败：${err.message}`)
  }
}

function readPidFile() {
  try {
    return JSON.parse(readFileSync(PID_FILE, 'utf8'))
  } catch {
    return null
  }
}

// ---------------- 子命令 ----------------
const arg = process.argv[2] || ''

if (arg === '--status') {
  const state = readPidFile()
  const serve = await serveReady()
  const bridge = await bridgeReady()
  console.log(JSON.stringify({
    serve: { url: SERVE_URL, ok: serve },
    bridge: { url: BRIDGE_URL, ok: bridge },
    pidFile: state,
  }, null, 2))
  process.exit(0)
}

if (arg === '--check') {
  const ok = await serveReady() && await bridgeReady()
  console.log(ok ? 'ready' : 'not-ready')
  process.exit(ok ? 0 : 1)
}

if (arg === '--stop') {
  const state = readPidFile()
  if (state?.supervisor) killTree(state.supervisor)
  // 守护可能已消失，按记录的子进程再收一次
  for (const pid of [state?.bridge, state?.serve]) killTree(pid)
  try { rmSync(PID_FILE, { force: true }) } catch { /* ignore */ }
  await sleep(1200)
  const serve = await serveReady()
  const bridge = await bridgeReady()
  if (serve || bridge) {
    log(`停止后仍有服务存活：serve=${serve} bridge=${bridge}`)
    process.exit(1)
  }
  log('已停止 CodeBuddy 桥')
  process.exit(0)
}

// ---------------- 守护主循环 ----------------
let stopping = false
let children = { serve: null, bridge: null }

for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) {
  process.on(signal, () => {
    stopping = true
    log(`收到 ${signal}，正在退出`)
    killTree(children.bridge?.pid)
    killTree(children.serve?.pid)
    try { rmSync(PID_FILE, { force: true }) } catch { /* ignore */ }
    process.exit(0)
  })
}
process.on('exit', () => {
  killTree(children.bridge?.pid)
  killTree(children.serve?.pid)
})

async function supervise(name, spawnFn, isReady, timeoutMs) {
  let attempts = 0
  let startedAt = 0
  while (!stopping) {
    if (await isReady()) {
      if (children[name] && Date.now() - startedAt > 60_000) attempts = 0
      await sleep(3000)
      continue
    }
    if (children[name]) {
      log(`${name} 健康检查失败，重启`)
      killTree(children[name].pid)
      children[name] = null
    }
    attempts += 1
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempts - 1, 5))
    if (attempts > 1) {
      log(`${name} 第 ${attempts} 次启动，等待 ${delay}ms`)
      await sleep(delay)
      if (stopping) return
    }
    try {
      children[name] = spawnFn()
      startedAt = Date.now()
      log(`${name} 已启动 pid=${children[name].pid}`)
      writePidFile({
        supervisor: process.pid,
        serve: children.serve?.pid,
        bridge: children.bridge?.pid,
        serveUrl: SERVE_URL,
        bridgeUrl: BRIDGE_URL,
        cwd: CWD,
        startedAt: new Date().toISOString(),
      })
    } catch (err) {
      log(`${name} 启动异常：${err.message}`)
      await sleep(delay)
      continue
    }
    const deadline = Date.now() + timeoutMs
    while (!stopping && Date.now() < deadline) {
      if (await isReady()) break
      await sleep(700)
    }
    if (!(await isReady())) {
      log(`${name} 在 ${timeoutMs}ms 内未就绪`)
      killTree(children[name]?.pid)
      children[name] = null
    }
  }
}

if (!existsSync(join(BRIDGE_DIR, 'bridge.py'))) {
  log(`找不到桥源码：${BRIDGE_DIR}（可用 DSH_BRIDGE_DIR 指定）`)
  process.exit(1)
}
if (!existsSync(RUN_DIR)) mkdirSync(RUN_DIR, { recursive: true })
if (existsSync(LOG_FILE) && statSync(LOG_FILE).size > MAX_LOG_BYTES) rmSync(LOG_FILE)

log(`守护启动：serve=${SERVE_URL} bridge=${BRIDGE_URL} cwd=${CWD}`)
if (!env.BRIDGE_API_KEY) log('警告：未设置 BRIDGE_API_KEY，桥将不校验调用方；dsh 侧该路由可能因缺凭据不可用')

supervise('serve', spawnServe, serveReady, 60_000)
supervise('bridge', spawnBridge, bridgeReady, 45_000)

// 两个都就绪后打印一次 READY，供启动器探测
for (let i = 0; i < 120; i += 1) {
  if (await serveReady() && await bridgeReady()) {
    log(`READY serve=${SERVE_URL} bridge=${BRIDGE_URL}`)
    break
  }
  await sleep(500)
}
