/** JSON-safe inputs and results of the experimental speech Remote namespace. */
import type { SpeechProviderId, SpeechSnapshot } from '@deepseek-ai/dsh-experimental-speech-to-text/types'
import type { SynthesisProviderId } from '@deepseek-ai/dsh-experimental-speech-synthesis/types'
import type {} from '@deepseek-ai/dsh-typert-protocol'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** Audio encoding or intake limits prevented transcription. */
    'speech/invalid-audio': { readonly reason: string }
    /** The selected provider rejected transcription. */
    'speech/transcription-failed': { readonly reason: string }
    /** Text intake limits prevented synthesis. */
    'speech/invalid-text': { readonly reason: string }
    /** The selected provider rejected synthesis. */
    'speech/synthesis-failed': { readonly reason: string }
  }
}

/** Complete recording submitted for transcription, separate from Session admission. */
export interface TranscriptionRequest {
  readonly audioBase64: string
  readonly providerId?: SpeechProviderId
  readonly language?: string
}

/** Current provider choices and audio intake limits. */
export interface SpeechCatalog extends SpeechSnapshot {
  readonly maxAudioBytes: number
  readonly maxDurationSeconds: number
}

/** One text to speak, with an optional explicit selection. */
export interface SynthesisRequest {
  readonly text: string
  readonly providerId?: SynthesisProviderId
  readonly voiceId?: string
}

/** Encoded audio returned to the browser. */
export interface SynthesisResult {
  readonly audioBase64: string
  readonly mimeType: string
}
