/**
 * DeepSeek cloud transcription over `POST /v1/tools/asr`. The endpoint takes one complete
 * 16-bit PCM WAV or Ogg Opus file and answers one complete transcript, so this provider
 * neither streams nor falls back to a second recognizer. Wire parsing is provider-private.
 * @module @deepseek-ai/dsh-experimental-speech-to-text-deepseek/provider
 */
import type { Transcript } from '@deepseek-ai/dsh-experimental-speech-to-text/types'

/** Path appended to the configured origin. */
export const DEEPSEEK_ASR_PATH = '/v1/tools/asr'

/** Largest upload the endpoint accepts; never raised by configuration. */
export const DEEPSEEK_ASR_MAX_AUDIO_BYTES = 8 * 1024 * 1024

/**
 * Languages the endpoint detects on its own; the field is advice for the selection UI,
 * which stores a hint the wire request cannot carry.
 */
export const languages: readonly string[] = [
  'auto', 'zh', 'yue', 'en', 'ja', 'ko', 'de', 'fr', 'es', 'pt', 'it', 'ru',
  'ar', 'hi', 'id', 'vi', 'th', 'tr', 'ms', 'fil', 'pl', 'hu',
]

/** Failure classes a caller can distinguish without parsing the message. */
export type DeepSeekAsrErrorCode =
  | 'unconfigured'
  | 'rejected'
  | 'too-large'
  | 'rate-limited'
  | 'unavailable'
  | 'timeout'
  | 'invalid-response'

/** One failed transcription, carrying the class the message would otherwise hide. */
export class DeepSeekAsrError extends Error {
  /**
   * @param code - failure class.
   * @param message - operator-facing cause and remedy.
   */
  constructor(readonly code: DeepSeekAsrErrorCode, message: string) {
    super(message)
    this.name = 'DeepSeekAsrError'
  }
}

/** Everything one transcription needs, resolved by the plugin before the recording arrives. */
export interface DeepSeekAsrOptions {
  /** Fully resolved endpoint, including {@link DEEPSEEK_ASR_PATH}. */
  readonly endpoint: string
  /** Resolves the API key at call time so a rotated credential applies to the next recording. */
  readonly resolveApiKey: () => Promise<string | undefined>
  /** Deadline covering upload and recognition. */
  readonly timeoutMs: number
  /** Maximum accepted WAV bytes, already validated against {@link DEEPSEEK_ASR_MAX_AUDIO_BYTES}. */
  readonly maxAudioBytes: number
}

/** One recording to recognize. */
export interface DeepSeekAsrInput {
  /** Canonical 16 kHz mono 16-bit PCM WAV bytes; the client resamples before uploading. */
  readonly audio: Uint8Array
  /** Cancellation from the caller or the owning registration. */
  readonly signal: AbortSignal
}

/** Status-specific guidance; the endpoint documents these codes. */
const STATUS_MESSAGES: ReadonlyMap<number, { readonly code: DeepSeekAsrErrorCode; readonly message: string }> = new Map([
  [400, { code: 'rejected', message: 'the audio is not 16-bit PCM WAV or Ogg Opus' }],
  [408, { code: 'timeout', message: 'the upload did not finish within 10 minutes' }],
  [413, { code: 'too-large', message: 'the audio exceeds the 8 MiB upload limit' }],
  [429, { code: 'rate-limited', message: 'too many concurrent requests; retry when an earlier one finishes' }],
  [500, { code: 'unavailable', message: 'the service failed; retry later' }],
  [502, { code: 'unavailable', message: 'the service failed; retry later' }],
  [503, { code: 'unavailable', message: 'the service is busy; retry later' }],
  [504, { code: 'timeout', message: 'recognition did not finish in time' }],
])

/**
 * Recognize one complete recording through the cloud endpoint.
 * @param options - endpoint, credential resolver, and intake limits.
 * @param input - WAV bytes and caller cancellation.
 * @returns the final transcript with the audio duration the service reported.
 */
export async function transcribeDeepSeekAsr(
  options: DeepSeekAsrOptions, input: DeepSeekAsrInput,
): Promise<Transcript> {
  if (input.audio.byteLength > options.maxAudioBytes) {
    throw new DeepSeekAsrError('too-large', `DeepSeek ASR received ${input.audio.byteLength} bytes; the limit is ${options.maxAudioBytes}`)
  }
  const apiKey = await options.resolveApiKey()
  if (apiKey === undefined) {
    throw new DeepSeekAsrError('unconfigured', 'DeepSeek ASR has no API key; set the credential it references or give it a literal key')
  }
  const timeout = AbortSignal.timeout(options.timeoutMs)
  const signal = AbortSignal.any([input.signal, timeout])
  const form = new FormData()
  // Copy into an ArrayBuffer-backed view: Blob rejects views over shared memory, and the
  // canonical WAV the client sends is always backed by an ordinary ArrayBuffer.
  form.append('file', new Blob([new Uint8Array(input.audio)], { type: 'audio/wav' }), 'speech.wav')
  const startedAt = performance.now()
  let response: Response
  try {
    response = await fetch(options.endpoint, {
      method: 'POST', headers: { authorization: `Bearer ${apiKey}` }, body: form, signal,
    })
  } catch (error) {
    if (timeout.aborted && !input.signal.aborted) {
      throw new DeepSeekAsrError('timeout', `DeepSeek ASR did not answer within ${options.timeoutMs} ms`)
    }
    throw error
  }
  let body: unknown
  try {
    body = await response.json()
  } catch (error) {
    if (timeout.aborted && !input.signal.aborted) {
      throw new DeepSeekAsrError('timeout', `DeepSeek ASR did not answer within ${options.timeoutMs} ms`)
    }
    if (input.signal.aborted) throw error
    body = undefined
  }
  const reported = errorMessage(body)
  if (!response.ok) {
    const known = STATUS_MESSAGES.get(response.status)
    const fallback = response.status >= 500 && response.status < 600
      ? { code: 'unavailable' as const, message: 'the service failed; retry later' }
      : undefined
    const detail = reported ?? known?.message ?? fallback?.message ?? 'the service returned an unexpected status'
    throw new DeepSeekAsrError(known?.code ?? fallback?.code ?? 'rejected', `DeepSeek ASR failed with ${response.status}: ${detail}`)
  }
  // A recognition that failed after the upload was accepted still answers 200 with an error object.
  if (reported !== undefined) throw new DeepSeekAsrError('rejected', `DeepSeek ASR failed: ${reported}`)
  const result = parseResult(body)
  return { text: result.text, audioSeconds: result.durationMs / 1000, inferenceSeconds: (performance.now() - startedAt) / 1000 }
}

/** One successful answer. */
interface AsrResult {
  readonly text: string
  readonly durationMs: number
}

/**
 * Read the documented success body; an unexpected shape fails loud rather than answering empty text.
 * @param body - decoded JSON value.
 * @returns transcribed text and reported duration.
 */
function parseResult(body: unknown): AsrResult {
  if (!isRecord(body) || typeof body.text !== 'string' || typeof body.duration_ms !== 'number' || !Number.isFinite(body.duration_ms)) {
    throw new DeepSeekAsrError('invalid-response', 'DeepSeek ASR answered a body without text and duration_ms')
  }
  return { text: body.text, durationMs: body.duration_ms }
}

/**
 * Read the documented `error.message` from a failure body.
 * @param body - decoded JSON value, possibly absent.
 * @returns the reported message when present.
 */
function errorMessage(body: unknown): string | undefined {
  if (!isRecord(body) || !isRecord(body.error) || typeof body.error.message !== 'string') return undefined
  return body.error.message
}

/**
 * @param value - decoded JSON value.
 * @returns whether the value is a non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
