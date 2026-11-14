/** Cloud provider registration, wire shape, failure classes, and credential resolution. */
import { Context } from '@deepseek-ai/cordis'
import SpeechToText from '@deepseek-ai/dsh-experimental-speech-to-text'
import { afterEach, expect, it, vi } from 'vitest'
import * as Provider from '../src/index.ts'
import { transcribeDeepSeekAsr } from '../src/provider.ts'

afterEach(() => { vi.unstubAllGlobals(); delete process.env.DEEPSEEK_API_KEY })

/** Mount the registry and the provider; the caller disposes the returned fiber. */
async function mount(config: Partial<Provider.Config> = {}) {
  const ctx = new Context()
  await ctx.plugin(SpeechToText, { defaultProvider: 'deepseek-cloud', language: 'auto' })
  const fiber = ctx.plugin(Provider, { apiKey: 'sk-test', ...config })
  await fiber
  return { ctx, fiber, speech: ctx.get('speechToText')! }
}

/**
 * Await one expected rejection and narrow it to the provider failure.
 * @param promise - transcription under test.
 * @returns the provider failure.
 */
async function rejection(promise: Promise<unknown>): Promise<Provider.DeepSeekAsrError> {
  const reason: unknown = await promise.then(() => undefined, (error: unknown) => error)
  if (!(reason instanceof Provider.DeepSeekAsrError)) throw new Error(`expected DeepSeekAsrError, received ${String(reason)}`)
  return reason
}

/** One documented success body. */
const SUCCESS = { request_id: 'req-1', text: '上海今天天气怎么样？', duration_ms: 3200 }

it('registers a cloud recognizer with the documented language catalog and no preparation', async () => {
  const { ctx, fiber, speech } = await mount()
  try {
    expect(speech.listProviders()).toMatchObject([{
      id: 'deepseek-cloud', location: 'cloud', name: 'DeepSeek ASR (cloud)',
      languages: ['auto', 'zh', 'yue', 'en', 'ja', 'ko', 'de', 'fr', 'es', 'pt', 'it', 'ru', 'ar', 'hi', 'id', 'vi', 'th', 'tr', 'ms', 'fil', 'pl', 'hu'],
    }])
    // A cloud recognizer needs no preparation, so the UI never offers a download for it.
    expect(speech.listProviders()[0]).not.toHaveProperty('preparation')
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
  expect(speech.listProviders()).toEqual([])
})

it('posts the canonical WAV to the endpoint and reports the duration the service measured', async () => {
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify(SUCCESS), { status: 200 }))
  vi.stubGlobal('fetch', fetch)
  const { ctx, fiber, speech } = await mount({ baseURL: 'https://gateway.example.com' })
  try {
    const audio = new Uint8Array(64)
    const transcript = await speech.transcribe(speech.resolve({ audio, language: 'zh' }), new AbortController().signal)
    expect(transcript).toMatchObject({ text: SUCCESS.text, audioSeconds: 3.2 })
    expect(transcript.inferenceSeconds).toBeGreaterThanOrEqual(0)
    const [endpoint, init] = fetch.mock.calls[0]!
    expect(endpoint).toBe('https://gateway.example.com/v1/tools/asr')
    expect(init).toMatchObject({ method: 'POST', headers: { authorization: 'Bearer sk-test' } })
    const file = (init.body as FormData).get('file')
    expect(file).toBeInstanceOf(Blob)
    expect((file as File).name).toBe('speech.wav')
    expect((file as Blob).size).toBe(audio.byteLength)
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it.each([
  [413, 'too-large'], [429, 'rate-limited'], [503, 'unavailable'], [504, 'timeout'], [400, 'rejected'],
] as const)('maps HTTP %i to the %s failure class', async (status, code) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'reported' } }), { status })))
  const { ctx, fiber, speech } = await mount()
  try {
    const error = await rejection(speech.transcribe(speech.resolve({ audio: new Uint8Array(46) }), new AbortController().signal))
    expect(error).toMatchObject({ code })
    expect(error.message).toContain('reported')
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('treats a 200 error body as a failed recognition instead of empty text', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    JSON.stringify({ error: { message: 'recognition expired', code: 'gateway_timeout_error' } }), { status: 200 },
  )))
  const { ctx, fiber, speech } = await mount()
  try {
    const error = await rejection(speech.transcribe(speech.resolve({ audio: new Uint8Array(46) }), new AbortController().signal))
    expect(error).toMatchObject({ code: 'rejected' })
    expect(error.message).toContain('recognition expired')
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('fails an unexpected success body rather than answering empty text', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ text: 7 }), { status: 200 })))
  const { ctx, fiber, speech } = await mount()
  try {
    expect((await rejection(speech.transcribe(speech.resolve({ audio: new Uint8Array(46) }), new AbortController().signal))).code)
      .toBe('invalid-response')
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('rejects an oversized recording before it reaches the network', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const { ctx, fiber, speech } = await mount({ maxAudioBytes: 64 })
  try {
    expect((await rejection(speech.transcribe(speech.resolve({ audio: new Uint8Array(65) }), new AbortController().signal))).code)
      .toBe('too-large')
    expect(fetch).not.toHaveBeenCalled()
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('names the missing credential instead of registering nothing', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const { ctx, fiber, speech } = await mount({ apiKey: undefined })
  try {
    expect(speech.listProviders()).toHaveLength(1)
    const error = await rejection(speech.transcribe(speech.resolve({ audio: new Uint8Array(46) }), new AbortController().signal))
    expect(error).toMatchObject({ code: 'unconfigured' })
    expect(error.message).toContain('DEEPSEEK_API_KEY')
    expect(fetch).not.toHaveBeenCalled()
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('rejects a key no Authorization header could carry', async () => {
  const { ctx, fiber, speech } = await mount({ apiKey: 'sk-test\nInjected: header' })
  try {
    expect((await rejection(speech.transcribe(speech.resolve({ audio: new Uint8Array(46) }), new AbortController().signal))).code)
      .toBe('unconfigured')
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it('validates deployment configuration at load', () => {
  expect(() => Provider.Config({ baseURL: 'https://user:secret@example.com' })).toThrow()
  expect(() => Provider.Config({ baseURL: 'file:///tmp' })).toThrow()
  expect(() => Provider.Config({ timeoutMs: 0 })).toThrow()
  expect(() => Provider.Config({ maxAudioBytes: Provider.DEEPSEEK_ASR_MAX_AUDIO_BYTES + 1 })).toThrow()
  expect(Provider.Config({})).toMatchObject({
    providerId: 'deepseek-cloud', baseURL: 'https://api.deepseek.com', apiKeyEnv: 'DEEPSEEK_API_KEY',
    timeoutMs: 180_000, maxAudioBytes: Provider.DEEPSEEK_ASR_MAX_AUDIO_BYTES,
  })
})

it('maps an unknown 5xx status to the retryable unavailable class', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 502 })))
  const { ctx, fiber, speech } = await mount()
  try {
    expect((await rejection(speech.transcribe(speech.resolve({ audio: new Uint8Array(46) }), new AbortController().signal))).code)
      .toBe('unavailable')
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

/** Options for one direct provider call against the stubbed network. */
function directOptions(overrides: Partial<Provider.DeepSeekAsrOptions> = {}): Provider.DeepSeekAsrOptions {
  return { endpoint: 'https://api.deepseek.com/v1/tools/asr', resolveApiKey: async () => 'sk-test', timeoutMs: 60_000, maxAudioBytes: Provider.DEEPSEEK_ASR_MAX_AUDIO_BYTES, ...overrides }
}

/** One canonical WAV header plus a few samples, enough for the provider's intake checks. */
const audio = new Uint8Array(48)

it('fails the provider directly when its resolver yields no key', async () => {
  const options = directOptions({ resolveApiKey: async () => undefined })
  await expect(transcribeDeepSeekAsr(options, { audio, signal: new AbortController().signal }))
    .rejects.toMatchObject({ code: 'unconfigured' })
})

it('maps a fetch aborted by the deadline to the timeout class', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => await new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => { reject(new DOMException('aborted', 'AbortError')) })
  })))
  try {
    const running = transcribeDeepSeekAsr(directOptions({ timeoutMs: 10 }), { audio, signal: new AbortController().signal })
    const settled = expect(running).rejects.toMatchObject({ code: 'timeout' })
    await vi.advanceTimersByTimeAsync(20)
    await settled
  } finally { vi.useRealTimers() }
})

it('propagates a fetch failure that is not a deadline hit', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom') }))
  await expect(transcribeDeepSeekAsr(directOptions(), { audio, signal: new AbortController().signal })).rejects.toThrow('boom')
})

it('maps a body read cut off by the deadline to the timeout class', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, headers: new Headers(),
    json: async () => { await new Promise((resolve) => { setTimeout(resolve, 40) }); throw new Error('late') },
  })))
  await expect(transcribeDeepSeekAsr(directOptions({ timeoutMs: 5 }), { audio, signal: new AbortController().signal }))
    .rejects.toMatchObject({ code: 'timeout' })
})

it('rethrows a body read failure after caller cancellation', async () => {
  const controller = new AbortController()
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, headers: new Headers(), json: async () => { controller.abort(); throw new DOMException('aborted', 'AbortError') },
  })))
  await expect(transcribeDeepSeekAsr(directOptions(), { audio, signal: controller.signal })).rejects.toThrow()
})

it('treats an unreadable body on a failed response as the status guidance', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, headers: new Headers(), json: async () => { throw new SyntaxError('bad json') } })))
  await expect(transcribeDeepSeekAsr(directOptions(), { audio, signal: new AbortController().signal }))
    .rejects.toMatchObject({ code: 'unavailable' })
})

it('reads the key through the credentials service when one is composed', async () => {
  const ctx = new Context()
  ctx.provide('credentials', { resolve: async () => ({ value: 'sk-file', source: 'file' }) })
  await ctx.plugin(SpeechToText, { defaultProvider: 'deepseek-cloud', language: 'auto' })
  const fiber = ctx.plugin(Provider, {})
  await fiber
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ request_id: 'r', text: 'ok', duration_ms: 1000 }), { status: 200 }))
  vi.stubGlobal('fetch', fetch)
  try {
    const speech = ctx.get('speechToText')!
    await speech.transcribe(speech.resolve({ audio }), new AbortController().signal)
    expect(fetch.mock.calls[0]![1].headers).toMatchObject({ authorization: 'Bearer sk-file' })
  } finally { await fiber.dispose(); await ctx.fiber.dispose() }
})

it.each([
  '[]',
  '{"text":"x"}',
  '{"text":"x","duration_ms":1e999}',
] as const)('fails a success body without usable text and duration: %s', async (body) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })))
  await expect(transcribeDeepSeekAsr(directOptions(), { audio, signal: new AbortController().signal }))
    .rejects.toMatchObject({ code: 'invalid-response' })
})

it('names an unexpected status when neither a body nor a known code applies', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 418 })))
  const error = await rejection(transcribeDeepSeekAsr(directOptions(), { audio, signal: new AbortController().signal }))
  expect(error).toMatchObject({ code: 'rejected' })
  expect(error.message).toContain('unexpected status')
})
