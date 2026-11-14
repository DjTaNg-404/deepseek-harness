/** Browser entry for the read-aloud control on finalized assistant messages. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-experimental-api-speech-to-text/remote'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import { ReadAloudAction, type ReadAloudInjected } from './ReadAloudAction.tsx'
import { Playback } from './playback.ts'
import { en, ja, es, fr, de, ru, pt, NS, zh } from './locales.ts'

/** Services the browser half requires before it mounts its slot entry. */
export const inject = ['remote', 'remote.speech', 'slots', 'locale']

/**
 * Register the read-aloud entry in the assistant-action strip.
 * @param ctx - Client runtime owning slots, dictionaries, and the speech Remote.
 */
export function apply(ctx: Context): void {
  const playback = new Playback(async (text, signal) => {
    const result = await ctx.remote.speech.synthesize({ text }, signal)
    if (!result.ok) throw result.error
    return result.value
  })
  ctx.effect(() => () => { void playback.dispose() })
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }))
  const actions = (sessionId: string): ReadAloudInjected => ({
    sessionId,
    hooks: { playback: playback.state },
    start: (text, messageId) => { void playback.start(text, messageId, sessionId) },
    stop: () => { playback.stop() },
  })
  ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
    name: 'conversation.chat.assistant-actions', id: 'read-aloud', order: 40, locale: NS,
    inject: sessionId => actions(sessionId),
  }, ReadAloudAction))
}
