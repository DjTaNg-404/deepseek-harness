/**
 * Register the DeepSeek cloud recognizer in `ctx.speechToText`. The endpoint auto-detects the
 * language, so the selected hint is advisory and never travels on the wire. Activation performs
 * no network access: the credential is read and the endpoint contacted only when a recording
 * arrives, and a missing credential fails that recording instead of hiding the provider.
 * @module @deepseek-ai/dsh-experimental-speech-to-text-deepseek
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-experimental-speech-to-text'
import type { SpeechProviderId } from '@deepseek-ai/dsh-experimental-speech-to-text/types'
import { resolveSpeechKey } from '@deepseek-ai/dsh-experimental-speech-deepseek-key'
import { Config } from './config.ts'
import {
  DEEPSEEK_ASR_PATH,
  DeepSeekAsrError,
  languages,
  transcribeDeepSeekAsr,
} from './provider.ts'

export { Config } from './config.ts'
export type { Config as DeepSeekAsrConfig } from './config.ts'
export {
  DEEPSEEK_ASR_MAX_AUDIO_BYTES,
  DEEPSEEK_ASR_PATH,
  DeepSeekAsrError,
  languages,
  transcribeDeepSeekAsr,
} from './provider.ts'
export type { DeepSeekAsrErrorCode, DeepSeekAsrInput, DeepSeekAsrOptions } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'experimental-speech-to-text-deepseek'

/** The speech seam this provider registers into. */
export const inject = ['speechToText']

/**
 * Register the cloud recognizer without contacting the endpoint.
 * @param ctx - Host registry owning the registration lifetime.
 * @param config - validated endpoint, credential, and intake settings.
 */
export function apply(ctx: Context, config: Config): void {
  const endpoint = `${config.baseURL.replace(/\/+$/, '')}${DEEPSEEK_ASR_PATH}`
  // Fail loud at load: a malformed origin would otherwise fail only on the first recording.
  new URL(endpoint)
  const literal = config.apiKey !== undefined && config.apiKey.length > 0 ? config.apiKey : undefined
  ctx.effect(() => ctx.speechToText.register({
    info: {
      id: config.providerId as SpeechProviderId,
      name: 'DeepSeek ASR (cloud)',
      location: 'cloud',
      languages,
    },
    transcribe: async (input, signal) => await transcribeDeepSeekAsr({
      endpoint,
      timeoutMs: config.timeoutMs,
      maxAudioBytes: config.maxAudioBytes,
      resolveApiKey: async () => await resolveApiKey(ctx, literal, config.apiKeyEnv),
    }, { audio: input.audio, signal }),
  }))
}

/**
 * Read the configured key through the shared DeepSeek speech credential path.
 * @param ctx - context providing the optional credentials and launch-environment services.
 * @param literal - configured inline key that overrides the credential reference.
 * @param reference - credential name resolved when no inline key is configured.
 * @returns an HTTP-header-safe key.
 */
async function resolveApiKey(ctx: Context, literal: string | undefined, reference: string): Promise<string> {
  const resolved = await resolveSpeechKey(ctx, literal, reference)
  if (!resolved.ok) throw new DeepSeekAsrError('unconfigured', resolved.message)
  return resolved.key
}
