/**
 * Register the DeepSeek cloud synthesizer in `ctx.speechSynthesis`. Activation performs no
 * network access: the credential is read and the endpoint contacted only when text arrives.
 * @module @deepseek-ai/dsh-experimental-speech-synthesis-deepseek
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-experimental-speech-synthesis'
import type { SynthesisProviderId } from '@deepseek-ai/dsh-experimental-speech-synthesis/types'
import { resolveSpeechKey } from '@deepseek-ai/dsh-experimental-speech-deepseek-key'
import { Config } from './config.ts'
import {
  DEEPSEEK_TTS_PATH,
  DeepSeekTtsError,
  synthesizeDeepSeekTts,
  voices,
} from './provider.ts'

export { Config } from './config.ts'
export type { Config as DeepSeekTtsConfig } from './config.ts'
export {
  DEEPSEEK_TTS_PATH,
  DeepSeekTtsError,
  billingCharacters,
  finalizeWave,
  synthesizeDeepSeekTts,
  voices,
} from './provider.ts'
export type { DeepSeekTtsErrorCode, DeepSeekTtsOptions } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'experimental-speech-synthesis-deepseek'

/** The synthesis seam this provider registers into. */
export const inject = ['speechSynthesis']

/**
 * Register the cloud synthesizer without contacting the endpoint.
 * @param ctx - Host registry owning the registration lifetime.
 * @param config - validated endpoint and credential settings.
 */
export function apply(ctx: Context, config: Config): void {
  const endpoint = `${config.baseURL.replace(/\/+$/, '')}${DEEPSEEK_TTS_PATH}`
  new URL(endpoint)
  const literal = config.apiKey !== undefined && config.apiKey.length > 0 ? config.apiKey : undefined
  ctx.effect(() => ctx.speechSynthesis.register({
    info: {
      id: config.providerId as SynthesisProviderId,
      name: 'DeepSeek TTS (cloud)',
      location: 'cloud',
      voices,
    },
    synthesize: async (input, signal) => await synthesizeDeepSeekTts({
      endpoint, timeoutMs: config.timeoutMs, resolveApiKey: async () => await resolveApiKey(ctx, literal, config.apiKeyEnv),
    }, input, signal),
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
  if (!resolved.ok) throw new DeepSeekTtsError('unconfigured', resolved.message)
  return resolved.key
}
