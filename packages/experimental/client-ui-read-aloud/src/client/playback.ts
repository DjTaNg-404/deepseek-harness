/** Chunked playback of synthesized answers, owner of the one audible stream. */
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

/** Observable playback phase shown on the action. */
export type PlaybackPhase = 'idle' | 'working' | 'playing' | 'failed'

/** One observable playback state. */
export interface PlaybackState {
  readonly phase: PlaybackPhase
  /** Message whose synthesis failed, while the phase is `failed`. */
  readonly failedFor: string | null
  /** Session that started the current answer, so another session's entry can silence it. */
  readonly owner: string | null
}

/** Request one chunk of speech from the Host Remote. */
export type SynthesisRequest = (text: string, signal: AbortSignal) => Promise<{ readonly audioBase64: string; readonly mimeType: string }>

/** Longest chunk sent per request; short chunks start speaking sooner. */
const CHUNK_LIMIT = 400

/**
 * Split prose into request-sized chunks at sentence boundaries.
 * @param text - complete answer text.
 * @returns non-empty chunks, at most {@link CHUNK_LIMIT} characters unless one sentence is longer.
 */
export function chunkText(text: string, limit = CHUNK_LIMIT): readonly string[] {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim()
  if (normalized.length === 0) return []
  const sentences = normalized.split(/(?<=[。！？!?.\n])/)
  const chunks: string[] = []
  let current = ''
  for (const sentence of sentences) {
    if (current !== '' && current.length + sentence.length > limit) {
      chunks.push(current)
      current = sentence
      continue
    }
    current += sentence
  }
  // `current` is empty only when the last sentence flushed the previous chunk, so this
  // guard is defensive: an empty push would be trimmed away by the filter below anyway.
  /* v8 ignore next 2 -- unreachable by construction of the loop above */
  if (current !== '') chunks.push(current)
  return chunks.map(chunk => chunk.trim()).filter(chunk => chunk !== '')
}

/**
 * Decode canonical base64 into bytes.
 * @param base64 - encoded audio.
 * @returns decoded bytes.
 */
export function decodeBase64(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/** One answer's playback: sequential chunks, one context, cancellation that silences immediately. */
export class Playback {
  /** Current phase and last failure. */
  readonly state: SnapshotStore<PlaybackState> = createSnapshotStore<PlaybackState>({ phase: 'idle', failedFor: null, owner: null })
  private controller: AbortController | undefined
  private context: AudioContext | undefined
  private source: AudioBufferSourceNode | undefined

  /** @param request - Host synthesis call for one chunk. */
  constructor(private readonly request: SynthesisRequest) {}

  /**
   * Start reading one answer, replacing any earlier playback.
   * @param text - complete answer text.
   * @returns after the last chunk finishes or playback stops.
   */
  async start(text: string, messageId: string, sessionId: string): Promise<void> {
    this.stop()
    const chunks = chunkText(text)
    if (chunks.length === 0) return
    const controller = new AbortController()
    this.controller = controller
    this.state.set({ phase: 'working', failedFor: null, owner: sessionId })
    try {
      const context = await this.audioContext()
      for (const chunk of chunks) {
        controller.signal.throwIfAborted()
        const result = await this.request(chunk, controller.signal)
        controller.signal.throwIfAborted()
        if (!result.mimeType.startsWith('audio/')) throw new Error(`Unsupported audio type: ${result.mimeType}`)
        const buffer = await context.decodeAudioData(decodeBase64(result.audioBase64).buffer)
        controller.signal.throwIfAborted()
        if (this.state.getSnapshot().phase !== 'playing') this.state.set({ phase: 'playing', failedFor: null, owner: sessionId })
        await this.play(context, buffer, controller.signal)
      }
      if (!controller.signal.aborted) this.state.set({ phase: 'idle', failedFor: null, owner: null })
    } catch (_error) {
      if (controller.signal.aborted) return
      this.state.set({ phase: 'failed', failedFor: messageId, owner: null })
    } finally {
      if (this.controller === controller) this.controller = undefined
    }
  }

  /** Silence and cancel the current answer. */
  stop(): void {
    this.controller?.abort()
    this.controller = undefined
    this.source?.stop()
    this.source = undefined
    if (this.state.getSnapshot().phase !== 'idle') this.state.set({ phase: 'idle', failedFor: null, owner: null })
  }

  /**
   * Release the browser audio graph; a disabled plugin must not keep an output device open.
   * @returns after the context closes.
   */
  async dispose(): Promise<void> {
    this.stop()
    const context = this.context
    this.context = undefined
    if (context !== undefined && context.state !== 'closed') await context.close()
  }

  private async audioContext(): Promise<AudioContext> {
    this.context ??= new AudioContext()
    if (this.context.state === 'suspended') await this.context.resume()
    return this.context
  }

  private async play(context: AudioContext, buffer: AudioBuffer, signal: AbortSignal): Promise<void> {
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    this.source = source
    try {
      await new Promise<void>((resolve) => {
        const finish = (): void => { signal.removeEventListener('abort', finish); resolve() }
        source.addEventListener('ended', finish, { once: true })
        signal.addEventListener('abort', finish, { once: true })
        source.start()
      })
    } finally {
      if (this.source === source) this.source = undefined
    }
  }
}
