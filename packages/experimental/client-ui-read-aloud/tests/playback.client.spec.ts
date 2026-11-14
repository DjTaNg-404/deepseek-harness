/** Playback: chunked synthesis, immediate stop, failure scoping, and audio-graph release. */
import { afterEach, expect, it, vi } from 'vitest'
import { Playback, chunkText, decodeBase64 } from '../src/client/playback.ts'
import type { PlaybackState } from '../src/client/playback.ts'

/** Minimal AudioBufferSourceNode stand-in that ends as soon as it starts. */
class FakeSource {
  buffer: unknown
  connected = false
  started = false
  /** Whether start() ends the buffer immediately; the stop tests keep it playing. */
  autoEnd = true
  private readonly listeners = new Map<string, Set<() => void>>()

  connect(): void { this.connected = true }

  addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set()
    set.add(listener)
    this.listeners.set(type, set)
  }

  removeEventListener(type: string, listener: () => void): void { this.listeners.get(type)?.delete(listener) }

  start(): void {
    this.started = true
    if (this.autoEnd) queueMicrotask(() => { this.emit('ended') })
  }

  stop(): void { this.emit('ended') }

  private emit(type: string): void {
    for (const listener of [...this.listeners.get(type) ?? []]) listener()
  }
}

/** AudioContext stand-in recording the graph the player builds. */
class FakeContext {
  state: 'running' | 'suspended' | 'closed' = 'running'
  readonly destination = {}
  readonly sources: FakeSource[] = []
  readonly resume = vi.fn(async () => { this.state = 'running' })
  readonly close = vi.fn(async () => { this.state = 'closed' })
  readonly decodeAudioData = vi.fn(async () => ({ duration: 1 }))

  autoEnd = true

  createBufferSource(): FakeSource {
    const source = new FakeSource()
    source.autoEnd = this.autoEnd
    this.sources.push(source)
    return source
  }
}

afterEach(() => { vi.unstubAllGlobals() })

/** Install one fake context and return it after the player constructs it. */
function installContext(state: 'running' | 'suspended' = 'running'): FakeContext {
  const context = new FakeContext()
  context.state = state
  vi.stubGlobal('AudioContext', function AudioContextStub() { return context })
  return context
}

/** Await one macrotask turn so queued microtasks settle. */
async function settle(): Promise<void> { await new Promise<void>((resolve) => { setTimeout(resolve, 0) }) }

it('plays every chunk in order and returns to idle', async () => {
  const context = installContext('suspended')
  const request = vi.fn(async () => ({ audioBase64: btoa('RIFF'), mimeType: 'audio/wav' }))
  const playback = new Playback(request)
  await playback.start('甲'.repeat(300) + '。' + '乙'.repeat(300) + '。', 'm1', 's1')
  expect(context.resume).toHaveBeenCalledOnce()
  expect(request.mock.calls.length).toBe(2)
  expect(context.sources.every(source => source.started && source.connected)).toBe(true)
  expect(playback.state.getSnapshot()).toEqual({ phase: 'idle', failedFor: null, owner: null })
})

it('stops an in-flight answer through the request signal', async () => {
  installContext()
  let resolveRequest: ((value: { audioBase64: string; mimeType: string }) => void) | undefined
  const request = vi.fn(async (_text: string, signal: AbortSignal) => {
    signal.throwIfAborted()
    return await new Promise<{ audioBase64: string; mimeType: string }>((resolve) => { resolveRequest = resolve })
  })
  const playback = new Playback(request)
  const running = playback.start('第一句。', 'm1', 's1')
  await settle()
  expect(playback.state.getSnapshot()).toMatchObject({ phase: 'working', owner: 's1' })
  playback.stop()
  expect(playback.state.getSnapshot()).toMatchObject({ phase: 'idle', owner: null })
  resolveRequest?.({ audioBase64: btoa('RIFF'), mimeType: 'audio/wav' })
  await running
  expect(playback.state.getSnapshot().phase).toBe('idle')
})

it('scopes a failure to its message and clears it on stop', async () => {
  installContext()
  const playback = new Playback(async () => { throw new Error('cloud down') })
  await playback.start('第一句。', 'm9', 's1')
  expect(playback.state.getSnapshot()).toEqual({ phase: 'failed', failedFor: 'm9', owner: null })
  playback.stop()
  expect(playback.state.getSnapshot()).toEqual({ phase: 'idle', failedFor: null, owner: null })
})

it('ignores blank text without touching the Remote', async () => {
  installContext()
  const request = vi.fn()
  const playback = new Playback(request)
  await playback.start('   ', 'm1', 's1')
  expect(request).not.toHaveBeenCalled()
})

it('closes the audio context on disposal', async () => {
  const context = installContext()
  const playback = new Playback(async () => ({ audioBase64: btoa('RIFF'), mimeType: 'audio/wav' }))
  await playback.start('第一句。', 'm1', 's1')
  await playback.dispose()
  expect(context.state).toBe('closed')
  expect(playback.state.getSnapshot().phase).toBe('idle')
})

it('tolerates disposal before any playback created a context', async () => {
  const playback = new Playback(async () => ({ audioBase64: btoa('RIFF'), mimeType: 'audio/wav' }))
  await expect(playback.dispose()).resolves.toBeUndefined()
})

it('reports the settled state after each phase through the observable', async () => {
  installContext()
  const seen: PlaybackState['phase'][] = []
  const playback = new Playback(async () => ({ audioBase64: btoa('RIFF'), mimeType: 'audio/wav' }))
  const off = playback.state.subscribe(() => { seen.push(playback.state.getSnapshot().phase) })
  await playback.start('第一句。', 'm1', 's1')
  off()
  expect(seen).toContain('working')
  expect(seen).toContain('playing')
  expect(seen.at(-1)).toBe('idle')
})

it('splits prose at sentence boundaries within the request limit', () => {
  expect(chunkText('第一句。第二句！第三句？')).toEqual(['第一句。第二句！第三句？'])
  const chunks = chunkText('甲'.repeat(300) + '。' + '乙'.repeat(300) + '。', 400)
  expect(chunks).toHaveLength(2)
  expect(chunks[0]!.length).toBeLessThanOrEqual(400)
})

it('returns nothing for blank text and keeps one long sentence intact', () => {
  expect(chunkText('   \n ')).toEqual([])
  const long = '甲'.repeat(900)
  expect(chunkText(long, 400)).toEqual([long])
})

it('decodes canonical base64 into exact bytes', () => {
  expect([...decodeBase64(btoa('RIFF'))]).toEqual([82, 73, 70, 70])
})

it('stays silent when the request fails after cancellation', async () => {
  installContext()
  const playback = new Playback(async (_text: string, signal: AbortSignal) => {
    await new Promise<void>((_resolve, reject) => { signal.addEventListener('abort', () => { reject(new Error('aborted')) }, { once: true }) })
    return { audioBase64: btoa('RIFF'), mimeType: 'audio/wav' }
  })
  const running = playback.start('第一句。', 'm1', 's1')
  await settle()
  playback.stop()
  await running
  expect(playback.state.getSnapshot()).toEqual({ phase: 'idle', failedFor: null, owner: null })
})

it('skips closing a context the browser already closed', async () => {
  const context = installContext()
  const playback = new Playback(async () => ({ audioBase64: btoa('RIFF'), mimeType: 'audio/wav' }))
  await playback.start('第一句。', 'm1', 's1')
  context.state = 'closed'
  await playback.dispose()
  expect(context.close).not.toHaveBeenCalled()
})

it('stops audio that is already playing', async () => {
  const context = installContext()
  context.autoEnd = false
  const playback = new Playback(async () => ({ audioBase64: btoa('RIFF'), mimeType: 'audio/wav' }))
  const running = playback.start('第一句。', 'm1', 's1')
  await settle()
  await settle()
  expect(playback.state.getSnapshot().phase).toBe('playing')
  playback.stop()
  await running
  expect(playback.state.getSnapshot()).toEqual({ phase: 'idle', failedFor: null, owner: null })
})

it('reports an unsupported media type instead of a decoder failure', async () => {
  installContext()
  const playback = new Playback(async () => ({ audioBase64: btoa('RIFF'), mimeType: 'application/json' }))
  await playback.start('第一句。', 'm1', 's1')
  expect(playback.state.getSnapshot()).toMatchObject({ phase: 'failed', failedFor: 'm1' })
})
