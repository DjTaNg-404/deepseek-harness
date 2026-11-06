/** A route may withhold tools; admission is the single place that knows it. */
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { afterEach, expect, it } from 'vitest'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'

const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

const probe = defineTool({
  name: 'probe',
  description: 'A probe.',
  parameters: {},
  output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
  async execute() { return 'ok' },
})

/**
 * Mount the runtime with one registered tool and an optional provider stand-in.
 * @param resolveModelInfo - the adapter lookup admission performs; omitted means no `llm` service.
 * @returns the context, its agent, and a resolver bound to one chat-only selection.
 */
async function setup(resolveModelInfo?: (provider: string, model: string) => Promise<unknown>) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  if (resolveModelInfo !== undefined) ctx.provide('llm', { resolveModelInfo } as never)
  ctx.tools.register(probe)
  const agent = { id: SessionId('capability') } as Agent
  const controller = new AbortController()
  const resolve = (model = 'chat-only') => ctx.tools.resolve({
    agent,
    modelSelection: { provider: 'acme', model },
    signal: controller.signal,
  })
  return { ctx, agent, resolve }
}

it('drops every tool when the model declares it cannot call them', async () => {
  const h = await setup(async () => ({
    provider: 'acme', id: 'chat-only', name: 'Chat only', supportsTools: false,
  }))
  const toolSet = await h.resolve()
  // Empty schemas are what removes both the wire tools and the prompt section.
  expect(h.ctx.tools.schemas(h.agent, toolSet)).toEqual([])
})

it('keeps tools when the model declares no capability', async () => {
  // Absence must mean capable, or every existing route would lose its tools.
  const h = await setup(async () => ({ provider: 'acme', id: 'chat-only', name: 'Chat only' }))
  const toolSet = await h.resolve()
  expect(h.ctx.tools.schemas(h.agent, toolSet).map(tool => tool.name)).toEqual(['probe'])
})

it('keeps tools when the capability lookup does not answer', async () => {
  // A broken lookup must not strip a step; the gate only removes a withheld capability.
  const h = await setup(async () => { throw new Error('adapter unavailable') })
  const toolSet = await h.resolve()
  expect(h.ctx.tools.schemas(h.agent, toolSet).map(tool => tool.name)).toEqual(['probe'])
})

it('confines the downgrade to the step\'s own selection', async () => {
  // One registry serves every step: a capable step beside a chat-only one keeps
  // its tools, which is what a subagent or a different route needs.
  const h = await setup(async (provider, model) => ({
    provider, id: model, name: model, ...model === 'chat-only' ? { supportsTools: false } : {},
  }))
  expect(h.ctx.tools.schemas(h.agent, await h.resolve('chat-only'))).toEqual([])
  expect(h.ctx.tools.schemas(h.agent, await h.resolve('capable')).map(tool => tool.name)).toEqual(['probe'])
})

it('keeps tools when no llm service is mounted', async () => {
  const h = await setup()
  const toolSet = await h.resolve()
  expect(h.ctx.tools.schemas(h.agent, toolSet).map(tool => tool.name)).toEqual(['probe'])
})
