/** Synthesis registry: registration, validation, delegation, and withdrawal. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import SpeechSynthesis from '../src/index.ts'
import type { SynthesisProviderId } from '../src/types.ts'

const id = 'deepseek-tts' as SynthesisProviderId

afterEach(() => { vi.restoreAllMocks() })

/** Mount the registry with one two-voice cloud provider. */
function fixture() {
  const ctx = new Context()
  const synthesize = vi.fn(async () => ({ audio: new Uint8Array([1, 2]), mimeType: 'audio/wav' }))
  const service = new SpeechSynthesis(ctx, SpeechSynthesis.Config({ defaultProvider: id, voiceId: 'stella' }))
  const unregister = service.register({
    info: { id, name: 'test', location: 'cloud', voices: [{ id: 'stella', name: 'S' }, { id: 'tide', name: 'T' }] },
    synthesize,
  })
  return { ctx, service, synthesize, unregister }
}

it('registers one provider and reports the default selection', () => {
  const { service, unregister } = fixture()
  expect(service.snapshot()).toMatchObject({ providers: [{ id, location: 'cloud' }], selection: { providerId: id, voiceId: 'stella' } })
  expect(() => service.register({ info: { id, name: 'again', location: 'cloud', voices: [] }, synthesize: async () => ({ audio: new Uint8Array(), mimeType: 'audio/wav' }) }))
    .toThrow('already registered')
  return unregister()
})

it.each([
  [{ providerId: 'missing' as SynthesisProviderId }, 'No synthesis provider'],
  [{ voiceId: 'unknown' }, 'does not offer voice'],
  [{ text: '   ' }, 'empty'],
] as const)('rejects %j before execution', (patch, message) => {
  const { service, unregister } = fixture()
  expect(() => service.resolve({ text: 'hello', ...patch })).toThrow(message)
  return unregister()
})

it('executes the resolved provider with the trimmed text and selected voice', async () => {
  const { service, synthesize, unregister } = fixture()
  try {
    const audio = await service.synthesize(service.resolve({ text: '  hello  ', voiceId: 'tide' }), new AbortController().signal)
    expect(audio).toEqual({ audio: new Uint8Array([1, 2]), mimeType: 'audio/wav' })
    expect(synthesize).toHaveBeenCalledWith({ text: 'hello', voiceId: 'tide' }, expect.any(AbortSignal))
  } finally { await unregister() }
})

it('aborts accepted work when the registration is withdrawn', async () => {
  const { service, unregister } = fixture()
  const synthesis = vi.fn(async (_input: unknown, signal: AbortSignal) => await new Promise<never>((_resolve, reject) => {
    signal.addEventListener('abort', () => { reject(new Error('aborted')) }, { once: true })
  }))
  const withdrawSlow = service.register({
    info: { id: 'slow' as SynthesisProviderId, name: 'slow', location: 'cloud', voices: [{ id: 'stella', name: 'S' }] },
    synthesize: synthesis,
  })
  const running = service.synthesize(service.resolve({ text: 'hello', providerId: 'slow' as SynthesisProviderId }), new AbortController().signal)
  const withdrawn = withdrawSlow()
  await expect(running).rejects.toThrow('aborted')
  await withdrawn
  await unregister()
})

it('fails the call when the selected registration was withdrawn first', async () => {
  const { service, unregister } = fixture()
  const spec = service.resolve({ text: 'hello' })
  await unregister()
  await expect(service.synthesize(spec, new AbortController().signal)).rejects.toThrow('no longer registered')
})

it('reports an empty roster and empty selection when nothing is registered', () => {
  const ctx = new Context()
  const service = new SpeechSynthesis(ctx, SpeechSynthesis.Config({ defaultProvider: 'deepseek-tts' }))
  expect(service.snapshot()).toEqual({ providers: [], selection: { providerId: 'deepseek-tts', voiceId: '' } })
})

it('falls back to the registered provider voice when no voice is configured', () => {
  const ctx = new Context()
  const service = new SpeechSynthesis(ctx, SpeechSynthesis.Config({ defaultProvider: id }))
  const unregister = service.register({
    info: { id, name: 'test', location: 'cloud', voices: [{ id: 'stella', name: 'S' }] },
    synthesize: async () => ({ audio: new Uint8Array([1]), mimeType: 'audio/wav' }),
  })
  expect(service.snapshot().selection).toEqual({ providerId: id, voiceId: 'stella' })
  expect(service.resolve({ text: 'hello' })).toMatchObject({ input: { voiceId: 'stella' } })
  return unregister()
})

it('rejects a provider that offers no voice and no selection', () => {
  const ctx = new Context()
  const service = new SpeechSynthesis(ctx, SpeechSynthesis.Config({ defaultProvider: id }))
  const unregister = service.register({
    info: { id, name: 'voiceless', location: 'cloud', voices: [] },
    synthesize: async () => ({ audio: new Uint8Array([1]), mimeType: 'audio/wav' }),
  })
  expect(() => service.resolve({ text: 'hello' })).toThrow('offers no voice')
  return unregister()
})

it('makes removal idempotent and aborts work when the service is disposed', async () => {
  const ctx = new Context()
  const service = new SpeechSynthesis(ctx, SpeechSynthesis.Config({ defaultProvider: id }))
  const synthesize = vi.fn(async (_input: unknown, signal: AbortSignal) => await new Promise<never>((_resolve, reject) => {
    signal.addEventListener('abort', () => { reject(new Error('aborted')) }, { once: true })
  }))
  const unregister = service.register({
    info: { id, name: 'slow', location: 'cloud', voices: [{ id: 'stella', name: 'S' }] },
    synthesize,
  })
  const running = service.synthesize(service.resolve({ text: 'hello' }), new AbortController().signal)
  await ctx.fiber.dispose()
  await expect(running).rejects.toThrow('aborted')
  await unregister()
})
