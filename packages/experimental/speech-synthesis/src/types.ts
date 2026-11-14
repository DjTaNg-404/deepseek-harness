/** Provider-neutral speech synthesis inputs and registration metadata. */
import type { Branded } from '@deepseek-ai/dsh-brand'

/** Configured identity of one synthesis provider. */
export type SynthesisProviderId = Branded<'SynthesisProviderId'>

/** One selectable voice. */
export interface SynthesisVoice {
  /** Wire value the provider accepts. */
  readonly id: string
  /** Display name offered to the selection UI. */
  readonly name: string
}

/** Public provider facts; credentials and endpoints are excluded. */
export interface SynthesisProviderInfo {
  readonly id: SynthesisProviderId
  readonly name: string
  readonly location: 'host-local' | 'cloud'
  readonly voices: readonly SynthesisVoice[]
}

/** Complete text to synthesize and an optional explicit selection. */
export interface SynthesisRequest {
  readonly text: string
  readonly providerId?: SynthesisProviderId
  readonly voiceId?: string
}

/** Text and voice a provider actually receives. */
export interface SynthesisInput {
  readonly text: string
  readonly voiceId: string
}

/** Encoded audio and the media type a browser can decode. */
export interface SynthesisAudio {
  readonly audio: Uint8Array
  readonly mimeType: string
}

/** One replaceable synthesizer; it owns execution and cancellation. */
export interface SynthesisProvider {
  readonly info: SynthesisProviderInfo
  /**
   * Synthesize one text through the selected voice.
   * @param input - text and voice, borrowed until settlement.
   * @param signal - caller cancellation or registration withdrawal.
   * @returns encoded audio.
   */
  synthesize(input: SynthesisInput, signal: AbortSignal): Promise<SynthesisAudio>
}

/** Provider-pinned input produced before execution; the instance is pinned, not just the id. */
export interface SynthesisSpec {
  readonly providerId: SynthesisProviderId
  readonly provider: SynthesisProvider
  readonly input: SynthesisInput
}

/** One consistent provider roster and default selection observation. */
export interface SynthesisSnapshot {
  readonly providers: readonly SynthesisProviderInfo[]
  readonly selection: { readonly providerId: SynthesisProviderId; readonly voiceId: string }
}
