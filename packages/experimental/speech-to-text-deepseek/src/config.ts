/** Deployment configuration for the DeepSeek cloud recognizer. */
import z from '@deepseek-ai/schemastery'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { DEEPSEEK_ASR_MAX_AUDIO_BYTES } from './provider.ts'

/** Endpoint, credential, and intake settings for the cloud provider. */
export interface Config {
  /** Unique registration id; consumers select this exact id. */
  providerId: string
  /** DeepSeek API origin, without a path; `/v1/tools/asr` is appended. */
  baseURL: string
  /** Literal API key; prefer {@link Config.apiKeyEnv} so no secret enters configuration files. */
  apiKey?: string | undefined
  /** Credential reference resolved for each transcription; defaults to `DEEPSEEK_API_KEY`. */
  apiKeyEnv: string
  /** Deadline for one upload and recognition; zero is invalid because the service answers nothing without one. */
  timeoutMs: number
  /** Maximum accepted WAV bytes; the provider rejects larger recordings before uploading. */
  maxAudioBytes: number
}

/** Validate deployment-varying choices at plugin activation. */
export const Config: z<Partial<Config>, Config> = z.object({
  providerId: z.string().min(1).default('deepseek-cloud'),
  baseURL: z.string().pattern(/^https?:\/\/[^/\s?#@]+\/?$/).default('https://api.deepseek.com'),
  apiKey: z.union([z.string(), z.const(undefined)]).role('secret'),
  apiKeyEnv: z.string().role('credential-ref').default('DEEPSEEK_API_KEY'),
  timeoutMs: z.natural().min(1).max(MAX_TIMER_DELAY_MS).default(180_000),
  maxAudioBytes: z.natural().min(46).max(DEEPSEEK_ASR_MAX_AUDIO_BYTES).default(DEEPSEEK_ASR_MAX_AUDIO_BYTES),
})
