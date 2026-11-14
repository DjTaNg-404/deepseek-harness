/** Routing recognizer: language coverage, readiness, empty retry, and failure fallback. */
import { Context } from '@deepseek-ai/cordis'
import SpeechToText from '@deepseek-ai/dsh-experimental-speech-to-text'
import type SpeechService from '@deepseek-ai/dsh-experimental-speech-to-text'
import type { SpeechProviderId, Transcript } from '@deepseek-ai/dsh-experimental-speech-to-text/types'
import { afterEach, expect, it, vi } from 'vitest'
import * as Router from '../src/index.ts'

afterEach(() => { vi.restoreAllMocks() })

const LOCAL = 'sensevoice-local' as SpeechProviderId
const CLOUD = 'deepseek-cloud' as SpeechProviderId
const AUTO = 'speech-auto' as SpeechProviderId

/** One provider whose behavior each case controls. */
interface Stub {
  readonly transcribe: ReturnType<typeof vi.fn<(input: unknown, signal: AbortSignal) => Promise<Transcript>>>
}

/** Mount the registry, both stubs, and the router. */
async function mount(options: {
  readonly localReady?: boolean
  readonly localRegistered?: boolean
  readonly cloudRegistered?: boolean
  readonly localResult?: () => Promise<Transcript>
  readonly cloudResult?: () => Promise<Transcript>
  readonly route?: Partial<Router.Config>
} = {}) {
  const ctx = new Context()
  await ctx.plugin(SpeechToText, { defaultProvider: AUTO, language: 'auto' })
  const speech = ctx.get('speechToText')!
  const local: Stub = {
    transcribe: vi.fn(options.localResult ?? (async () => ({ text: '本地', audioSeconds: 1, inferenceSeconds: 0.1 }))),
  }
  const cloud: Stub = {
    transcribe: vi.fn(options.cloudResult ?? (async () => ({ text: '云端', audioSeconds: 1, inferenceSeconds: 0.1 }))),
  }
  let unregisterLocal: (() => Promise<void>) | undefined
  let unregisterCloud: (() => Promise<void>) | undefined
  if (options.localRegistered !== false) {
    unregisterLocal = speech.register({
      info: { id: LOCAL, name: 'local', location: 'host-local', languages: ['auto', 'zh', 'en'] },
      ...options.localReady === false
        ? { preparation: { snapshot: () => ({ phase: 'unprepared' as const }), subscribe: () => () => {}, prepare: () => {}, cancel: async () => {} } }
        : {},
      transcribe: local.transcribe,
    })
  }
  if (options.cloudRegistered !== false) {
    unregisterCloud = speech.register({
      info: { id: CLOUD, name: 'cloud', location: 'cloud', languages: ['auto', 'zh', 'vi'] },
      transcribe: cloud.transcribe,
    })
  }
  const fiber = ctx.plugin(Router, { providerId: AUTO, ...options.route })
  await fiber
  return { ctx, fiber, speech, local, cloud, unregisterLocal, unregisterCloud }
}

/** Run one recording through the router. */
async function run(speech: SpeechService, language: string): Promise<Transcript> {
  return await speech.transcribe(speech.resolve({ audio: new Uint8Array(46), language, providerId: AUTO }), new AbortController().signal)
}

it('advertises the documented language superset and never presents itself as host-local', async () => {
  const { ctx, fiber, speech } = await mount()
  try {
    const view = speech.listProviders().find(provider => provider.id === AUTO)
    expect(view).toMatchObject({ location: 'cloud' })
    expect(view?.languages).toEqual(expect.arrayContaining(['auto', 'zh', 'yue', 'en', 'vi', 'ar']))
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('uses the ready local provider for a language it accepts', async () => {
  const { ctx, fiber, speech, local, cloud } = await mount()
  try {
    expect((await run(speech, 'zh')).text).toBe('本地')
    expect(local.transcribe).toHaveBeenCalledOnce()
    expect(cloud.transcribe).not.toHaveBeenCalled()
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('routes an unsupported language to the cloud provider', async () => {
  const { ctx, fiber, speech, local, cloud } = await mount()
  try {
    expect((await run(speech, 'vi')).text).toBe('云端')
    expect(cloud.transcribe).toHaveBeenCalledOnce()
    expect(local.transcribe).not.toHaveBeenCalled()
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('routes to the cloud provider while the local model is unprepared', async () => {
  const { ctx, fiber, speech, local, cloud } = await mount({ localReady: false })
  try {
    expect((await run(speech, 'zh')).text).toBe('云端')
    expect(cloud.transcribe).toHaveBeenCalledOnce()
    expect(local.transcribe).not.toHaveBeenCalled()
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('retries the cloud provider when the local one returns no text', async () => {
  const { ctx, fiber, speech, local, cloud } = await mount({
    localResult: async () => ({ text: '   ', audioSeconds: 1, inferenceSeconds: 0.1 }),
  })
  try {
    expect((await run(speech, 'zh')).text).toBe('云端')
    expect(local.transcribe).toHaveBeenCalledOnce()
    expect(cloud.transcribe).toHaveBeenCalledOnce()
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('falls back to the ready local provider when the cloud one fails', async () => {
  const { ctx, fiber, speech, local, cloud } = await mount({
    cloudResult: async () => { throw new Error('cloud down') },
  })
  try {
    expect((await run(speech, 'vi')).text).toBe('本地')
    expect(cloud.transcribe).toHaveBeenCalledOnce()
    expect(local.transcribe).toHaveBeenCalledOnce()
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('refuses to route to itself', () => {
  expect(() => { Router.apply(new Context(), Router.Config({ providerId: 'sensevoice-local' })) }).toThrow('route to itself')
})

it('registers without targets and refuses the recording instead', async () => {
  const ctx = new Context()
  await ctx.plugin(SpeechToText, { defaultProvider: AUTO, language: 'auto' })
  const fiber = await ctx.plugin(Router, { providerId: AUTO })
  try {
    expect(ctx.get('speechToText')!.listProviders()).toHaveLength(1)
    await expect(run(ctx.get('speechToText')!, 'zh')).rejects.toThrow('registered')
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('treats an automatic language hint as served by the local provider', async () => {
  const { ctx, fiber, speech, local } = await mount()
  try {
    expect((await run(speech, 'auto')).text).toBe('本地')
    expect(local.transcribe).toHaveBeenCalledOnce()
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('refuses a recording no registered target can serve', async () => {
  const { ctx, fiber, speech, unregisterCloud } = await mount()
  try {
    await unregisterCloud?.()
    await expect(run(speech, 'vi')).rejects.toThrow('cannot serve language vi')
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('keeps the empty local result when no cloud target is registered', async () => {
  const { ctx, fiber, speech } = await mount({
    cloudRegistered: false,
    localResult: async () => ({ text: '  ', audioSeconds: 1, inferenceSeconds: 0.1 }),
  })
  try {
    expect((await run(speech, 'zh')).text).toBe('  ')
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('reports missing targets when both registrations disappear after activation', async () => {
  const { ctx, fiber, speech, unregisterLocal, unregisterCloud } = await mount()
  try {
    await unregisterLocal?.()
    await unregisterCloud?.()
    await expect(run(speech, 'zh')).rejects.toThrow('registered')
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('propagates a cloud failure when the local fallback is disabled', async () => {
  const { ctx, fiber, speech } = await mount({
    cloudResult: async () => { throw new Error('cloud down') },
    route: { fallbackLocalOnError: false },
  })
  try {
    await expect(run(speech, 'vi')).rejects.toThrow('cloud down')
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('detects a cycle when a routed target routes back', async () => {
  const ctx = new Context()
  await ctx.plugin(SpeechToText, { defaultProvider: AUTO, language: 'auto' })
  const speech = ctx.get('speechToText')!
  speech.register({ info: { id: LOCAL, name: 'local', location: 'host-local', languages: ['auto', 'zh'] }, transcribe: async () => ({ text: '本地', audioSeconds: 1, inferenceSeconds: 0.1 }) })
  // A stub target that hands the same recording back to the router.
  const unregisterStub = speech.register({
    info: { id: 'router-x' as SpeechProviderId, name: 'loop', location: 'cloud', languages: ['auto', 'vi'] },
    transcribe: async (_input, signal) => await speech.transcribe(speech.resolve({ audio: new Uint8Array(46), language: 'vi', providerId: AUTO }), signal),
  })
  const fiber = ctx.plugin(Router, { providerId: AUTO, localProviderId: LOCAL, cloudProviderId: 'router-x', fallbackLocalOnError: false })
  await fiber
  try {
    await expect(run(speech, 'vi')).rejects.toThrow('revisited')
  } finally { await unregisterStub(); await fiber.dispose(); await ctx.fiber.dispose() }
})
