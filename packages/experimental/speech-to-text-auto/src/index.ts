/**
 * Register a recognizer that routes one recording between an offline-first local provider and a
 * cloud provider. The route is decided before execution from provider facts, never from a model
 * guess: the local provider serves languages it accepts while its resources are ready, the cloud
 * provider serves everything else, an empty local transcript retries the cloud once, and a cloud
 * failure falls back to a ready local model. Targets are explicit ids, so routing never recurses.
 * @module @deepseek-ai/dsh-experimental-speech-to-text-auto
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-experimental-speech-to-text'
import type {
  SpeechProviderId, SpeechProviderView, SpeechSnapshot, SpeechSpec, Transcript,
} from '@deepseek-ai/dsh-experimental-speech-to-text/types'
import type SpeechToText from '@deepseek-ai/dsh-experimental-speech-to-text'
import { Config } from './config.ts'

export { Config } from './config.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'experimental-speech-to-text-auto'

/** The speech seam this routing provider registers into. */
export const inject = ['speechToText']

/** Targets already visited by the current routing chain, shared across nested routers. */
const routingChain = new AsyncLocalStorage<Set<string>>()

/**
 * Register the routing recognizer. Its advertised languages are the union of its two targets',
 * computed at activation because the roster is already composed then.
 * @param ctx - Host registry owning the registration lifetime.
 * @param config - validated target ids and fallback switches.
 */
export function apply(ctx: Context, config: Config): void {
  if (config.providerId === config.localProviderId || config.providerId === config.cloudProviderId) {
    throw new Error(`${config.providerId} cannot route to itself; configure distinct local and cloud providers`)
  }
  const registry = ctx.speechToText
  ctx.effect(() => registry.register({
    info: {
      id: config.providerId as SpeechProviderId,
      name: 'Automatic routing',
      // It may upload audio, so the roster must not present it as host-local.
      location: 'cloud',
      languages: ADVERTISED_LANGUAGES,
    },
    transcribe: async (input, signal) => {
      const visited = routingChain.getStore() ?? new Set<string>()
      return await routingChain.run(visited, async () => await route(registry, config, input, signal, visited))
    },
  }))
}

/**
 * Pick one target and execute it, applying the configured fallbacks.
 * @param registry - live roster the targets register into.
 * @param config - validated target ids and switches.
 * @param input - recording and language hint.
 * @param signal - caller cancellation.
 * @returns the transcript the selected provider produced.
 */
async function route(
  registry: SpeechToText, config: Config, input: { readonly audio: Uint8Array; readonly language: string }, signal: AbortSignal,
  visited: Set<string>,
): Promise<Transcript> {
  const snapshot = registry.snapshot()
  const local = viewOf(snapshot, config.localProviderId)
  const cloud = viewOf(snapshot, config.cloudProviderId)
  const localServes = local !== undefined && ready(local) && accepts(local, input.language)
  if (!localServes && cloud !== undefined) {
    try {
      return await run(registry, cloud.id, input, signal, visited)
    } catch (error) {
      signal.throwIfAborted()
      if (!config.fallbackLocalOnError || local === undefined || !ready(local)) throw error
      return await run(registry, local.id, input, signal, visited)
    }
  }
  if (local === undefined) {
    throw new Error(`Automatic routing needs ${config.localProviderId} or ${config.cloudProviderId} registered`)
  }
  if (!localServes) {
    // The local provider is registered but cannot take this recording; do not run it anyway.
    throw new Error(`Automatic routing cannot serve language ${input.language}: ${config.localProviderId} is not ready and ${config.cloudProviderId} is not registered`)
  }
  const transcript = await run(registry, local.id, input, signal, visited)
  if (config.retryCloudOnEmpty && transcript.text.trim() === '' && cloud !== undefined) {
    return await run(registry, cloud.id, input, signal, visited)
  }
  return transcript
}

/**
 * Execute one explicit target through the registry.
 * @param registry - live roster.
 * @param providerId - target id, never this router.
 * @param input - recording and language hint.
 * @param signal - caller cancellation.
 * @returns that provider's transcript.
 */
async function run(
  registry: SpeechToText, providerId: string, input: { readonly audio: Uint8Array; readonly language: string }, signal: AbortSignal,
  visited: Set<string>,
): Promise<Transcript> {
  // Two routers pointed at each other would otherwise recurse without bound.
  if (visited.has(providerId)) throw new Error(`Automatic routing revisited ${providerId}; check the configured targets`)
  visited.add(providerId)
  // A fallback target that does not advertise the hint must reject it before the registry would.
  const view = viewOf(registry.snapshot(), providerId)
  const language = view !== undefined && accepts(view, input.language) ? input.language : 'auto'
  try {
    const spec: SpeechSpec = registry.resolve({ audio: input.audio, language, providerId: providerId as SpeechProviderId })
    return await registry.transcribe(spec, signal)
  } finally {
    visited.delete(providerId)
  }
}

/**
 * @param snapshot - current roster.
 * @param id - configured target id.
 * @returns that provider's view when registered.
 */
function viewOf(snapshot: SpeechSnapshot, id: string): SpeechProviderView | undefined {
  return snapshot.providers.find(provider => String(provider.id) === id)
}

/**
 * A provider without preparation is always ready; a downloading, loading, or failed one is not.
 * @param view - provider facts and preparation state.
 * @returns whether it can accept work now.
 */
function ready(view: SpeechProviderView): boolean {
  const phase = view.preparation.phase
  return phase === 'ready' || phase === 'standby'
}

/**
 * @param view - local provider facts.
 * @param language - stored hint; `auto` defers to the provider.
 * @returns whether the local provider advertises that language.
 */
function accepts(view: SpeechProviderView, language: string): boolean {
  return language === 'auto' || view.languages.includes(language)
}

/** Language hints the documented cloud target serves; the roster is composed concurrently with this
 * plugin, so reading a union at activation would race the targets' registration. */
const ADVERTISED_LANGUAGES: readonly string[] = [
  'auto', 'zh', 'yue', 'en', 'ja', 'ko', 'de', 'fr', 'es', 'pt', 'it', 'ru',
  'ar', 'hi', 'id', 'vi', 'th', 'tr', 'ms', 'fil', 'pl', 'hu',
]
