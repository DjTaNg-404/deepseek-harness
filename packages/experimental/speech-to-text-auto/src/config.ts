/** Deployment configuration for the routing recognizer. */
import z from '@deepseek-ai/schemastery'

/** Explicit targets and the two fallback switches. */
export interface Config {
  /** Unique registration id; consumers select this exact id. */
  providerId: string
  /** Offline-first recognizer used for supported languages when it is ready. */
  localProviderId: string
  /** Cloud recognizer used for unsupported languages, unready local models, and empty results. */
  cloudProviderId: string
  /** Retry the cloud recognizer once when the local one returns no text. */
  retryCloudOnEmpty: boolean
  /** Fall back to the local recognizer when the cloud one fails for a non-abort reason. */
  fallbackLocalOnError: boolean
}

/** Validate deployment-varying choices at plugin activation. */
export const Config: z<Partial<Config>, Config> = z.object({
  providerId: z.string().min(1).default('speech-auto'),
  localProviderId: z.string().min(1).default('sensevoice-local'),
  cloudProviderId: z.string().min(1).default('deepseek-cloud'),
  retryCloudOnEmpty: z.boolean().default(true),
  fallbackLocalOnError: z.boolean().default(true),
})
