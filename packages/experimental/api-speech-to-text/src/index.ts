/** Authenticated, cancellation-aware Client access to the speech capability. */
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-experimental-speech-to-text'
import type { SpeechPreparationOptions, SpeechProviderId, SpeechSelectionPatch, Transcript } from '@deepseek-ai/dsh-experimental-speech-to-text/types'
import type {} from '@deepseek-ai/dsh-experimental-speech-synthesis'
import type { SpeechCatalog, SynthesisRequest, SynthesisResult, TranscriptionRequest } from './types.ts'
import { validateWave } from '@deepseek-ai/dsh-experimental-speech-to-text/wave'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Experimental speech Remote controller. */
    speechController: SpeechController
  }
}

/** Limits applied before decoding or calling a provider. */
export interface Config {
  /** Maximum decoded WAV bytes per request. */
  maxAudioBytes: number
  /** Maximum PCM recording duration in seconds. */
  maxDurationSeconds: number
  /** Maximum encoded audio bytes one synthesis returns. */
  maxSynthesisAudioBytes: number
}

/** Speech calls never activate or submit to an Agent. */
export default class SpeechController extends TypertRemoteService {
  static inject = ['speechToText', 'typert']
  static Config: z<Config> = z.object({
    maxAudioBytes: z.natural().min(46).default(4 * 1024 * 1024),
    maxDurationSeconds: z.number().min(1).default(120),
    maxSynthesisAudioBytes: z.natural().min(46).default(8 * 1024 * 1024),
  })

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'speechController', { namespace: 'speech' })
  }

  /**
   * Read provider choices without preparing a recognizer.
   * @returns available providers, resolved default, and recording limits.
   */
  @Remote
  catalog(): SpeechCatalog {
    return { ...this.ctx.speechToText.snapshot(), ...this.config }
  }

  /**
   * Follow provider readiness independently of Session and preparation lifetimes.
   * @param signal - Client observation lifetime.
   * @returns initial and subsequent complete readiness snapshots.
   */
  @Remote({ mode: 'stream' })
  async *follow(signal: AbortSignal): AsyncIterable<SpeechCatalog> {
    for await (const snapshot of this.ctx.speechToText.follow(signal)) yield { ...snapshot, ...this.config }
  }

  /**
   * Persist the user's recognition preferences.
   * @param patch - changed preference fields.
   * @returns after preferences are saved.
   */
  @Remote
  configure(patch: SpeechSelectionPatch): Promise<void> { return this.ctx.speechToText.configure(patch) }

  /**
   * Start or join one Host-owned preparation task.
   * @param providerId - selected recognizer.
   * @param options - task-local source selection validated by the provider.
   */
  @Remote
  prepare(providerId: SpeechProviderId, options?: SpeechPreparationOptions): void { this.ctx.speechToText.prepare(providerId, options) }

  /**
   * Explicitly cancel resource preparation.
   * @param providerId - selected recognizer.
   * @returns after the preparation task settles.
   */
  @Remote
  cancelPreparation(providerId: SpeechProviderId): Promise<void> { return this.ctx.speechToText.cancelPreparation(providerId) }

  /**
   * Validate and transcribe one recording through the explicit provider selection.
   * @param request - canonical WAV encoded as base64, provider id and language hint.
   * @param signal - Client cancellation or Remote contribution disposal.
   * @returns final transcript without adding a Session event.
   */
  @Remote
  async transcribe(request: TranscriptionRequest, signal: AbortSignal): Promise<Transcript> {
    signal.throwIfAborted()
    const encoded = request.audioBase64
    if (encoded.length > Math.ceil(this.config.maxAudioBytes / 3) * 4) {
      throw new RemoteError('speech/invalid-audio', 'Audio is invalid or exceeds the configured byte limit', { reason: 'encoding-or-size' })
    }
    const audio = Buffer.from(encoded, 'base64')
    try {
      if (audio.toString('base64') !== encoded) throw new Error('Audio must use canonical base64 encoding')
      if (audio.length > this.config.maxAudioBytes) throw new Error('Audio exceeds the configured byte limit')
      validateWave(audio, this.config.maxDurationSeconds)
      const spec = this.ctx.speechToText.resolve({ audio,
        ...request.providerId === undefined ? {} : { providerId: request.providerId },
        ...request.language === undefined ? {} : { language: request.language },
      })
      return await this.ctx.speechToText.transcribe(spec, signal)
    } catch (error) {
      signal.throwIfAborted()
      const reason = error instanceof Error ? error.message : String(error)
      throw new RemoteError('speech/transcription-failed', reason, { reason })
    }
  }

  /**
   * Synthesize one text through the explicit provider selection.
   * @param request - text and optional provider and voice.
   * @param signal - Client cancellation or Remote contribution disposal.
   * @returns encoded audio with its media type.
   */
  @Remote
  async synthesize(request: SynthesisRequest, signal: AbortSignal): Promise<SynthesisResult> {
    signal.throwIfAborted()
    const synthesis = this.ctx.get('speechSynthesis')
    if (synthesis === undefined) {
      throw new RemoteError('speech/synthesis-failed', 'Speech synthesis is not composed on this Host', { reason: 'not-composed' })
    }
    let spec
    try {
      spec = synthesis.resolve({
        text: request.text,
        ...request.providerId === undefined ? {} : { providerId: request.providerId },
        ...request.voiceId === undefined ? {} : { voiceId: request.voiceId },
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new RemoteError('speech/invalid-text', reason, { reason })
    }
    try {
      const audio = await synthesis.synthesize(spec, signal)
      if (audio.audio.byteLength > this.config.maxSynthesisAudioBytes) {
        throw new Error(`Synthesized audio exceeds the ${this.config.maxSynthesisAudioBytes}-byte limit; split the text`)
      }
      return { audioBase64: Buffer.from(audio.audio).toString('base64'), mimeType: audio.mimeType }
    } catch (error) {
      signal.throwIfAborted()
      const reason = error instanceof Error ? error.message : String(error)
      throw new RemoteError('speech/synthesis-failed', reason, { reason })
    }
  }
}
