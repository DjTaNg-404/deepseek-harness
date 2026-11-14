/** DeepSeek TTS wire shape, failure classes, limits, and billing-character counting. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import * as Provider from '../src/index.ts'
import { synthesizeDeepSeekTts } from '../src/provider.ts'
import SpeechSynthesis from '@deepseek-ai/dsh-experimental-speech-synthesis'

afterEach(() => { vi.unstubAllGlobals(); delete process.env.DEEPSEEK_API_KEY })

/**
 * Await one expected rejection and narrow it to the provider failure.
 * @param promise - synthesis under test.
 * @returns the provider failure.
 */
async function rejection(promise: Promise<unknown>): Promise<Provider.DeepSeekTtsError> {
  const reason: unknown = await promise.then(() => undefined, (error: unknown) => error)
  if (!(reason instanceof Provider.DeepSeekTtsError)) throw new Error(`expected DeepSeekTtsError, received ${String(reason)}`)
  return reason
}

/** Mount the synthesis registry with the DeepSeek provider. */
async function mount(config: Partial<Provider.Config> = {}) {
  const ctx = new Context()
  await ctx.plugin(SpeechSynthesis, { defaultProvider: 'deepseek-tts', voiceId: 'stella' })
  const fiber = ctx.plugin(Provider, { apiKey: 'sk-test', ...config })
  await fiber
  return { ctx, fiber, synthesis: ctx.get('speechSynthesis') as SpeechSynthesis }
}

it('registers a cloud voice pair without touching the network', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const { ctx, fiber, synthesis } = await mount()
  try {
    expect(synthesis.snapshot()).toMatchObject({
      providers: [{ id: 'deepseek-tts', location: 'cloud', voices: [{ id: 'stella' }, { id: 'tide' }] }],
      selection: { providerId: 'deepseek-tts', voiceId: 'stella' },
    })
    expect(fetch).not.toHaveBeenCalled()
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('posts the documented JSON body and returns the audio bytes', async () => {
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response(new Uint8Array([82, 73, 70, 70]), {
    status: 200, headers: { 'content-type': 'audio/wav' },
  }))
  vi.stubGlobal('fetch', fetch)
  const { ctx, fiber, synthesis } = await mount({ baseURL: 'https://gateway.example.com' })
  try {
    const audio = await synthesis.synthesize(synthesis.resolve({ text: '你好', voiceId: 'tide' }), new AbortController().signal)
    expect(audio).toMatchObject({ mimeType: 'audio/wav' })
    expect([...audio.audio]).toEqual([82, 73, 70, 70])
    const [endpoint, init] = fetch.mock.calls[0]!
    expect(endpoint).toBe('https://gateway.example.com/v1/tools/tts')
    expect(init).toMatchObject({ method: 'POST', headers: { authorization: 'Bearer sk-test', 'content-type': 'application/json' } })
    expect(JSON.parse(typeof init.body === 'string' ? init.body : '')).toEqual({ text: '你好', voice_id: 'tide', format: 'wav', filter_markdown: true })
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it.each([[400, 'rejected'], [429, 'rate-limited'], [503, 'unavailable'], [504, 'timeout']] as const)(
  'maps HTTP %i to the %s failure class', async (status, code) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'reported' } }), { status })))
    const { ctx, fiber, synthesis } = await mount()
    try {
      const error = await rejection(synthesis.synthesize(synthesis.resolve({ text: '你好' }), new AbortController().signal))
      expect(error).toMatchObject({ code })
      expect(error.message).toContain('reported')
    } finally { await fiber.dispose(); await ctx.fiber.dispose() }
  })

it('counts a Han character as two billing characters', () => {
  expect(Provider.billingCharacters('你好abc')).toBe(7)
  expect(Provider.billingCharacters('hello')).toBe(5)
})

it('rejects text past the billing limit before resolving a credential', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const { ctx, fiber, synthesis } = await mount({ apiKey: undefined })
  try {
    const failure = synthesis.synthesize(synthesis.resolve({ text: '汉'.repeat(5_001) }), new AbortController().signal)
    await expect(failure).rejects.toMatchObject({ code: 'too-long' })
    expect(fetch).not.toHaveBeenCalled()
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('names the missing credential', async () => {
  vi.stubGlobal('fetch', vi.fn())
  const { ctx, fiber, synthesis } = await mount({ apiKey: undefined })
  try {
    const error = await rejection(synthesis.synthesize(synthesis.resolve({ text: '你好' }), new AbortController().signal))
    expect(error).toMatchObject({ code: 'unconfigured' })
    expect(error.message).toContain('DEEPSEEK_API_KEY')
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('validates deployment configuration at load', () => {
  expect(() => Provider.Config({ baseURL: 'file:///tmp' })).toThrow()
  expect(() => Provider.Config({ timeoutMs: 0 })).toThrow()
  expect(Provider.Config({})).toMatchObject({ providerId: 'deepseek-tts', baseURL: 'https://api.deepseek.com', apiKeyEnv: 'DEEPSEEK_API_KEY' })
})

it('rewrites the streaming WAV placeholder sizes a browser decoder rejects', () => {
  const streaming = new Uint8Array(48)
  streaming.set([...Buffer.from('RIFF')], 0)
  streaming.set([...Buffer.from('WAVEfmt ')], 8)
  new DataView(streaming.buffer).setUint32(4, 0xFFFFFFFF, true)
  new DataView(streaming.buffer).setUint32(16, 16, true)
  new DataView(streaming.buffer).setUint16(20, 1, true)
  new DataView(streaming.buffer).setUint16(22, 1, true)
  streaming.set([...Buffer.from('data')], 36)
  new DataView(streaming.buffer).setUint32(40, 0xFFFFFFFF, true)
  const finalized = Provider.finalizeWave(streaming)
  const view = new DataView(finalized.buffer, finalized.byteOffset, finalized.byteLength)
  expect(finalized.byteLength).toBe(48)
  expect(view.getUint32(4, true)).toBe(40)
  expect(view.getUint32(40, true)).toBe(4)
  // A complete header is returned unchanged.
  expect(Provider.finalizeWave(finalized)).toBe(finalized)
})

it('treats a 200 error body as a failed synthesis instead of returning it as audio', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Content Exists Risk' } }), {
    status: 200, headers: { 'content-type': 'application/json' },
  })))
  const { ctx, fiber, synthesis } = await mount()
  try {
    const error = await rejection(synthesis.synthesize(synthesis.resolve({ text: '你好' }), new AbortController().signal))
    expect(error).toMatchObject({ code: 'rejected' })
    expect(error.message).toContain('Content Exists Risk')
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('maps an unknown 5xx status to the retryable unavailable class', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 502 })))
  const { ctx, fiber, synthesis } = await mount()
  try {
    expect((await rejection(synthesis.synthesize(synthesis.resolve({ text: '你好' }), new AbortController().signal))).code)
      .toBe('unavailable')
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('maps a stalled response body to the timeout class', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, headers: new Headers(),
    arrayBuffer: async () => { await new Promise((resolve) => { setTimeout(resolve, 40) }); throw new Error('late') },
  })))
  const { ctx, fiber, synthesis } = await mount({ timeoutMs: 5 })
  try {
    expect((await rejection(synthesis.synthesize(synthesis.resolve({ text: '你好' }), new AbortController().signal))).code)
      .toBe('timeout')
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('uses the documented status guidance when the failure body is not JSON', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('not-json', { status: 400 })))
  const { ctx, fiber, synthesis } = await mount()
  try {
    const error = await rejection(synthesis.synthesize(synthesis.resolve({ text: '你好' }), new AbortController().signal))
    expect(error.message).toContain('content-reviewed')
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('names an unexpected status when nothing else applies', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 418 })))
  const { ctx, fiber, synthesis } = await mount()
  try {
    expect((await rejection(synthesis.synthesize(synthesis.resolve({ text: '你好' }), new AbortController().signal))).message)
      .toContain('unexpected status')
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('falls back to audio/wav when the response omits a content type', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, headers: new Headers(), arrayBuffer: async () => new Uint8Array([82, 73, 70, 70]).buffer })))
  const { ctx, fiber, synthesis } = await mount()
  try {
    expect((await synthesis.synthesize(synthesis.resolve({ text: '你好' }), new AbortController().signal)).mimeType).toBe('audio/wav')
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('rejects an empty audio response', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(0), { status: 200 })))
  const { ctx, fiber, synthesis } = await mount()
  try {
    expect((await rejection(synthesis.synthesize(synthesis.resolve({ text: '你好' }), new AbortController().signal))).code).toBe('rejected')
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('rejects an unreadable JSON error body that was not audio', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{oops', { status: 200 })))
  const { ctx, fiber, synthesis } = await mount()
  try {
    expect((await rejection(synthesis.synthesize(synthesis.resolve({ text: '你好' }), new AbortController().signal))).message)
      .toContain('unreadable')
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('reads the key through the credentials service when one is composed', async () => {
  const ctx = new Context()
  ctx.provide('credentials', { resolve: async () => ({ value: 'sk-file', source: 'file' }) })
  await ctx.plugin(SpeechSynthesis, { defaultProvider: 'deepseek-tts', voiceId: 'stella' })
  const fiber = ctx.plugin(Provider, {})
  await fiber
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response(new Uint8Array([82, 73, 70, 70]), { status: 200 }))
  vi.stubGlobal('fetch', fetch)
  try {
    await ctx.get('speechSynthesis')!.synthesize(ctx.get('speechSynthesis')!.resolve({ text: '你好' }), new AbortController().signal)
    expect(fetch.mock.calls[0]![1].headers).toMatchObject({ authorization: 'Bearer sk-file' })
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

/** Options for one direct provider call against the stubbed network. */
function directOptions(overrides: Partial<Provider.DeepSeekTtsOptions> = {}): Provider.DeepSeekTtsOptions {
  return { endpoint: 'https://api.deepseek.com/v1/tools/tts', resolveApiKey: async () => 'sk-test', timeoutMs: 60_000, ...overrides }
}

it('fails the provider directly when its resolver yields no key', async () => {
  await expect(synthesizeDeepSeekTts(directOptions({ resolveApiKey: async () => undefined }), { text: '你好', voiceId: 'stella' }, new AbortController().signal))
    .rejects.toMatchObject({ code: 'unconfigured' })
})

it('maps a fetch aborted by the deadline to the timeout class', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => await new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => { reject(new DOMException('aborted', 'AbortError')) })
  })))
  try {
    const running = synthesizeDeepSeekTts(directOptions({ timeoutMs: 10 }), { text: '你好', voiceId: 'stella' }, new AbortController().signal)
    const settled = expect(running).rejects.toMatchObject({ code: 'timeout' })
    await vi.advanceTimersByTimeAsync(20)
    await settled
  } finally { vi.useRealTimers() }
})

it('propagates a body failure that is not a deadline hit', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, headers: new Headers(), arrayBuffer: async () => { throw new Error('socket reset') },
  })))
  await expect(synthesizeDeepSeekTts(directOptions(), { text: '你好', voiceId: 'stella' }, new AbortController().signal))
    .rejects.toThrow('socket reset')
})

it.each(['{"error": 5}', '{}'])('ignores a failure body whose error is not an object: %s', async (body) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 500 })))
  await expect(synthesizeDeepSeekTts(directOptions(), { text: '你好', voiceId: 'stella' }, new AbortController().signal))
    .rejects.toMatchObject({ code: 'unavailable' })
})

it('returns a complete WAV unchanged when it already carries real sizes', () => {
  const wav = new Uint8Array(48)
  const view = new DataView(wav.buffer)
  wav.set([...Buffer.from('RIFF')], 0); wav.set([...Buffer.from('WAVE')], 8); wav.set([...Buffer.from('data')], 36)
  view.setUint32(4, 40, true); view.setUint32(40, 4, true)
  expect(Provider.finalizeWave(wav)).toBe(wav)
})

it('propagates a fetch failure that is not a deadline hit', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom') }))
  await expect(synthesizeDeepSeekTts(directOptions(), { text: '你好', voiceId: 'stella' }, new AbortController().signal))
    .rejects.toThrow('boom')
})

it.each(['null', '{"error":null}', '{"error":{"message":5}}'] as const)(
  'refuses a JSON body that carries no usable audio or message: %s', async (body) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })))
    await expect(synthesizeDeepSeekTts(directOptions(), { text: '你好', voiceId: 'stella' }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'rejected' })
  })

it('leaves a WAV without a data chunk unchanged', () => {
  const wav = new Uint8Array(44)
  wav.set([...Buffer.from('RIFF')], 0); wav.set([...Buffer.from('WAVE')], 8); wav.set([...Buffer.from('LIST')], 36)
  const view = new DataView(wav.buffer)
  view.setUint32(4, 36, true); view.setUint32(40, 0, true)
  expect(Provider.finalizeWave(wav)).toBe(wav)
})

it('falls back to status guidance when the failure message is not a string', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 5 } }), { status: 503 })))
  await expect(synthesizeDeepSeekTts(directOptions(), { text: '你好', voiceId: 'stella' }, new AbortController().signal))
    .rejects.toMatchObject({ code: 'unavailable' })
})
