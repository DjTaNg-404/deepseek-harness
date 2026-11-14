/** DeepSeek cloud speech synthesis over `POST /v1/tools/tts`. */
import type { SynthesisAudio, SynthesisInput, SynthesisVoice } from '@deepseek-ai/dsh-experimental-speech-synthesis/types'

/** Path appended to the configured origin. */
export const DEEPSEEK_TTS_PATH = '/v1/tools/tts'

/** Voices the endpoint documents. */
export const voices: readonly SynthesisVoice[] = [
  { id: 'stella', name: 'Stella (female)' },
  { id: 'tide', name: 'Tide (male)' },
]

/** Billing characters the endpoint counts per request: a Han character counts as two. */
export const DEEPSEEK_TTS_MAX_CHARACTERS = 10_000

/** Failure classes a caller can distinguish without parsing the message. */
export type DeepSeekTtsErrorCode = 'unconfigured' | 'rejected' | 'too-long' | 'rate-limited' | 'unavailable' | 'timeout'

/** One failed synthesis, carrying the class the message would otherwise hide. */
export class DeepSeekTtsError extends Error {
  /**
   * @param code - failure class.
   * @param message - operator-facing cause and remedy.
   */
  constructor(readonly code: DeepSeekTtsErrorCode, message: string) {
    super(message)
    this.name = 'DeepSeekTtsError'
  }
}

/** Everything one synthesis needs, resolved by the plugin before the text arrives. */
export interface DeepSeekTtsOptions {
  /** Fully resolved endpoint, including {@link DEEPSEEK_TTS_PATH}. */
  readonly endpoint: string
  /** Resolves the API key at call time so a rotated credential applies to the next answer. */
  readonly resolveApiKey: () => Promise<string | undefined>
  /** Deadline covering upload and synthesis. */
  readonly timeoutMs: number
}

/** Status-specific guidance; the endpoint documents these codes. */
const STATUS_MESSAGES: ReadonlyMap<number, { readonly code: DeepSeekTtsErrorCode; readonly message: string }> = new Map([
  [400, { code: 'rejected', message: 'the text is empty or the endpoint content-reviewed it (Content Exists Risk)' }],
  [429, { code: 'rate-limited', message: 'too many concurrent requests; retry when an earlier one finishes' }],
  [500, { code: 'unavailable', message: 'the service failed; retry later' }],
  [502, { code: 'unavailable', message: 'the service failed; retry later' }],
  [503, { code: 'unavailable', message: 'the service is busy; retry later' }],
  [504, { code: 'timeout', message: 'synthesis did not finish in time' }],
])

/**
 * Count the endpoint's billing characters: a Han character costs two, everything else one.
 * @param text - prose to speak.
 * @returns billing character count.
 */
export function billingCharacters(text: string): number {
  let total = 0
  for (const character of text) total += /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]|[\u{20000}-\u{2fa1f}]/u.test(character) ? 2 : 1
  return total
}

/**
 * Synthesize one text through the cloud endpoint.
 * @param options - endpoint, credential resolver, and deadline.
 * @param input - text and voice.
 * @param signal - caller cancellation.
 * @returns WAV bytes and their media type.
 */
export async function synthesizeDeepSeekTts(
  options: DeepSeekTtsOptions, input: SynthesisInput, signal: AbortSignal,
): Promise<SynthesisAudio> {
  const characters = billingCharacters(input.text)
  if (characters > DEEPSEEK_TTS_MAX_CHARACTERS) {
    throw new DeepSeekTtsError('too-long', `DeepSeek TTS received ${characters} billing characters; the limit is ${DEEPSEEK_TTS_MAX_CHARACTERS}`)
  }
  // 10,000 billing characters fit the 64 KiB request body even at four bytes per character,
  // so the documented body limit never needs a separate pre-check.
  const body = JSON.stringify({ text: input.text, voice_id: input.voiceId, format: 'wav', filter_markdown: true })
  const apiKey = await options.resolveApiKey()
  if (apiKey === undefined) {
    throw new DeepSeekTtsError('unconfigured', 'DeepSeek TTS has no API key; set the credential it references or give it a literal key')
  }
  const timeout = AbortSignal.timeout(options.timeoutMs)
  const combined = AbortSignal.any([signal, timeout])
  let response: Response
  try {
    response = await fetch(options.endpoint, {
      method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body, signal: combined,
    })
  } catch (error) {
    if (timeout.aborted && !signal.aborted) throw new DeepSeekTtsError('timeout', `DeepSeek TTS did not answer within ${options.timeoutMs} ms`)
    throw error
  }
  if (!response.ok) {
    const reported = await readErrorMessage(response)
    const known = STATUS_MESSAGES.get(response.status)
    const detail = reported ?? known?.message ?? 'the service returned an unexpected status'
    throw new DeepSeekTtsError(known?.code ?? 'rejected', `DeepSeek TTS failed with ${response.status}: ${detail}`)
  }
  let received: Uint8Array
  try {
    received = new Uint8Array(await response.arrayBuffer())
  } catch (error) {
    if (timeout.aborted && !signal.aborted) throw new DeepSeekTtsError('timeout', `DeepSeek TTS did not answer within ${options.timeoutMs} ms`)
    throw error
  }
  // A failed synthesis can still answer 200 with the documented error object instead of audio.
  const reportedBody = errorMessage(received)
  if (reportedBody !== undefined) throw new DeepSeekTtsError('rejected', `DeepSeek TTS failed: ${reportedBody}`)
  const audio = finalizeWave(received)
  if (audio.byteLength === 0) throw new DeepSeekTtsError('rejected', 'DeepSeek TTS answered no audio')
  return { audio, mimeType: response.headers.get('content-type') ?? 'audio/wav' }
}

/**
 * Read the documented `error.message` from a failure body.
 * @param response - failed HTTP response.
 * @returns the reported message when present.
 */
async function readErrorMessage(response: Response): Promise<string | undefined> {
  const body: unknown = await response.json().catch(() => undefined)
  if (typeof body !== 'object' || body === null || !('error' in body)) return undefined
  const error: unknown = body.error
  if (typeof error !== 'object' || error === null || !('message' in error)) return undefined
  const message: unknown = error.message
  return typeof message === 'string' ? message : undefined
}

/** Four ASCII bytes at an offset, or the empty string when they do not fit. */
function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

/**
 * The endpoint streams WAV with `0xFFFFFFFF` RIFF and data sizes, which a browser decoder rejects.
 * Rewrite those two fields from the bytes actually received, padding an odd data chunk.
 * @param audio - response bytes.
 * @returns a self-contained WAV when the header carried placeholder sizes; the input otherwise.
 */
export function finalizeWave(audio: Uint8Array): Uint8Array {
  if (audio.byteLength < 44 || ascii(audio, 0, 4) !== 'RIFF' || ascii(audio, 8, 4) !== 'WAVE') return audio
  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength)
  let offset = 12
  while (offset + 8 <= audio.byteLength) {
    const id = ascii(audio, offset, 4)
    const size = view.getUint32(offset + 4, true)
    if (id !== 'data') {
      offset += 8 + size + (size % 2)
      continue
    }
    const streaming = size === 0xFFFFFFFF || view.getUint32(4, true) === 0xFFFFFFFF
    if (!streaming) return audio
    const actual = audio.byteLength - (offset + 8)
    const padding = actual % 2
    const finalized = new Uint8Array(audio.byteLength + padding)
    finalized.set(audio)
    const out = new DataView(finalized.buffer)
    out.setUint32(4, finalized.byteLength - 8, true)
    out.setUint32(offset + 4, actual, true)
    return finalized
  }
  return audio
}

/**
 * Read a JSON payload that arrived where audio was expected. Any parseable JSON is refused:
 * the endpoint answers JSON only for failures, so returning it as audio would hide the cause.
 * @param bytes - response bytes.
 * @returns the documented message, a generic refusal, or undefined for binary audio.
 */
function errorMessage(bytes: Uint8Array): string | undefined {
  const text = new TextDecoder().decode(bytes.subarray(0, 4096)).trimStart()
  if (text === '') return undefined
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null || !('error' in parsed)) {
      return 'the endpoint answered JSON instead of audio'
    }
    const error: unknown = parsed.error
    if (typeof error !== 'object' || error === null || !('message' in error)) {
      return 'the endpoint answered JSON instead of audio'
    }
    const message: unknown = error.message
    return typeof message === 'string' ? message : 'the endpoint reported an error body'
  } catch {
    // Unparseable text that still opens as an object is a truncated error body, not audio.
    return text.startsWith('{') ? 'the endpoint answered an unreadable error body' : undefined
  }
}
