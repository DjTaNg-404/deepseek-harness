/** Deployment configuration for the DeepSeek cloud synthesizer. */
import z from '@deepseek-ai/schemastery'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'

/** Endpoint and credential settings for the cloud provider. */
export interface Config {
  /** Unique registration id; consumers select this exact id. */
  providerId: string
  /** DeepSeek API origin, without a path; `/v1/tools/tts` is appended. */
  baseURL: string
  /** Literal API key; prefer {@link Config.apiKeyEnv} so no secret enters configuration files. */
  apiKey?: string | undefined
  /** Credential reference resolved for each answer; defaults to `DEEPSEEK_API_KEY`. */
  apiKeyEnv: string
  /** Deadline for one request, including synthesis. */
  timeoutMs: number
}

/** Validate deployment-varying choices at plugin activation. */
export const Config: z<Partial<Config>, Config> = z.object({
  providerId: z.string().min(1).default('deepseek-tts'),
  baseURL: z.string().pattern(/^https?:\/\/[^/\s?#@]+\/?$/).default('https://api.deepseek.com'),
  apiKey: z.union([z.string(), z.const(undefined)]).role('secret'),
  apiKeyEnv: z.string().role('credential-ref').default('DEEPSEEK_API_KEY'),
  timeoutMs: z.natural().min(1).max(MAX_TIMER_DELAY_MS).default(180_000),
})
