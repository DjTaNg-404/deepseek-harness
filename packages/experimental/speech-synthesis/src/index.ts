/** Named speech synthesis providers with disposable registration and explicit routing. */
import { Context, Service, type Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { SynthesisAudio, SynthesisProvider, SynthesisProviderId, SynthesisRequest, SynthesisSnapshot, SynthesisSpec } from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Experimental speech synthesis provider registry. */
    speechSynthesis: SpeechSynthesis
  }
}

/** Default selection read before a synthesis starts. */
export interface Config {
  /** Registered provider selected when the caller omits an id. */
  defaultProvider: Volatile<string>
  /** Voice selected when the caller omits one. */
  voiceId: Volatile<string | undefined>
}

interface Registration {
  readonly provider: SynthesisProvider
  readonly lifetime: AbortController
  readonly pending: Set<Promise<SynthesisAudio>>
}

/** Registry shared by all synthesis consumers in one Host composition. */
export default class SpeechSynthesis extends Service {
  static Config = z.object({
    defaultProvider: z.string().min(1).required().volatile(),
    voiceId: z.union([z.string().min(1), z.const(undefined)]).volatile(),
  })

  private readonly providers = new Map<SynthesisProviderId, Registration>()
  private readonly lifetime = new AbortController()

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'speechSynthesis')
    ctx.effect(() => async () => {
      this.lifetime.abort(new Error('Synthesis service disposed'))
      await Promise.all([...this.providers.values()].map(registration => this.remove(registration)))
    })
  }

  /**
   * Register one synthesizer; duplicate ids fail without replacing the original.
   * @param provider - synthesizer owned by the contributing fiber.
   * @returns idempotent disposer which rejects admission and joins accepted work.
   */
  register(provider: SynthesisProvider): () => Promise<void> {
    this.lifetime.signal.throwIfAborted()
    if (this.providers.has(provider.info.id)) throw new Error(`Synthesis provider already registered: ${provider.info.id}`)
    const registration: Registration = { provider, lifetime: new AbortController(), pending: new Set() }
    this.providers.set(provider.info.id, registration)
    return async () => { await this.remove(registration) }
  }

  /**
   * Read the current roster and default selection.
   * @returns provider facts in registration order.
   */
  snapshot(): SynthesisSnapshot {
    const providerId = this.config.defaultProvider.get() as SynthesisProviderId
    const provider = this.providers.get(providerId)?.provider.info
    const voiceId = this.config.voiceId.get() ?? provider?.voices[0]?.id ?? ''
    return { providers: [...this.providers.values()].map(registration => registration.provider.info), selection: { providerId, voiceId } }
  }

  /**
   * Apply the default selection and validate the request before execution.
   * @param request - text and optional selection.
   * @returns provider-pinned input for synthesize().
   */
  resolve(request: SynthesisRequest): SynthesisSpec {
    const providerId = request.providerId ?? this.config.defaultProvider.get() as SynthesisProviderId
    const registration = this.providers.get(providerId)
    if (registration === undefined) throw new Error(`No synthesis provider is registered as ${String(providerId)}`)
    const info = registration.provider.info
    const voiceId = request.voiceId ?? this.config.voiceId.get() ?? info.voices[0]?.id
    if (voiceId === undefined) throw new Error(`Synthesis provider ${String(providerId)} offers no voice`)
    if (!info.voices.some(voice => voice.id === voiceId)) throw new Error(`Synthesis provider ${String(providerId)} does not offer voice ${voiceId}`)
    const text = request.text.trim()
    if (text.length === 0) throw new Error('Synthesis text is empty')
    return { providerId, provider: registration.provider, input: { text, voiceId } }
  }

  /**
   * Execute exactly the resolved provider; a withdrawn registration is rejected.
   * @param spec - resolved input.
   * @param signal - caller cancellation.
   * @returns encoded audio after provider settlement.
   */
  async synthesize(spec: SynthesisSpec, signal: AbortSignal): Promise<SynthesisAudio> {
    signal.throwIfAborted()
    const registration = this.providers.get(spec.providerId)
    if (registration?.provider !== spec.provider) throw new Error(`Resolved synthesis provider is no longer registered: ${String(spec.providerId)}`)
    const combined = AbortSignal.any([signal, registration.lifetime.signal])
    combined.throwIfAborted()
    const work = registration.provider.synthesize(spec.input, combined)
    registration.pending.add(work)
    try {
      const audio = await work
      combined.throwIfAborted()
      return audio
    } finally {
      registration.pending.delete(work)
    }
  }

  private async remove(registration: Registration): Promise<void> {
    if (this.providers.get(registration.provider.info.id) !== registration) return
    this.providers.delete(registration.provider.info.id)
    registration.lifetime.abort(new Error('Synthesis provider unloaded'))
    await Promise.allSettled(registration.pending)
  }
}
