/** Read-aloud entry in the finalized-assistant action strip. */
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime, HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { MessageId } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the Chat SlotMap merge, the `useChat` standard hook, and the snapshot contract.
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PlaybackState } from './playback.ts'
import type { ReadAloudKey } from './locales.ts'
import css from './ReadAloudAction.module.css'

/** Business face of one read-aloud entry. */
export interface ReadAloudInjected {
  /** Session this entry belongs to; its audio stops when the entry unmounts. */
  sessionId: string
  hooks: {
    /** The plugin-owned playback state, shared by every message control. */
    playback: HostObservable<PlaybackState>
  }
  /**
   * Read one answer aloud.
   * @param text - complete answer text.
   * @param messageId - durable id of the message being read.
   */
  start: (text: string, messageId: string) => void
  /** Silence the current answer. */
  stop: () => void
}

/** Full props of one read-aloud entry. */
export type ReadAloudActionProps = PropsRuntime<'conversation.chat.assistant-actions'>
  & InjectFace<ReadAloudInjected>
  & PropsLocale<'read-aloud'>

/**
 * Read one Chat Node's durable assistant answer out of the generic node payload.
 * @param data - node payload published by the Chat target.
 * @returns the message id and its text blocks, when the payload carries a final assistant node.
 */
function answerOf(data: unknown): { readonly messageId: string | undefined; readonly blocks: readonly unknown[] } | undefined {
  if (typeof data !== 'object' || data === null || !('finalNode' in data)) return undefined
  const finalNode: unknown = (data as { finalNode?: unknown }).finalNode
  if (typeof finalNode !== 'object' || finalNode === null || !('blocks' in finalNode)) return undefined
  const blocks: unknown = (finalNode as { blocks?: unknown }).blocks
  if (!Array.isArray(blocks)) return undefined
  const messageId = 'messageId' in finalNode && typeof (finalNode as { messageId?: unknown }).messageId === 'string'
    ? (finalNode as { messageId: string }).messageId
    : undefined
  return { messageId, blocks }
}

/**
 * Collect the visible prose of the assistant message with this durable id.
 * @param snapshot - current Chat snapshot.
 * @param messageId - durable message id the action row addresses.
 * @returns concatenated text blocks, empty when the node is not materialized.
 */
function messageText(snapshot: ChatSnapshot, messageId: MessageId): string {
  for (const node of snapshot.nodes.values()) {
    const answer = answerOf(node.data)
    // Compare before joining: a publication must not re-join every other answer's prose.
    if (answer?.messageId !== messageId) continue
    return answer.blocks.flatMap(block => typeof block === 'object' && block !== null && (block as { kind?: unknown }).kind === 'text'
      && typeof (block as { text?: unknown }).text === 'string' ? [(block as { text: string }).text] : []).join('')
  }
  return ''
}

/** Speaker glyph shown on the idle and reading states. */
function SpeakerIcon({ stop }: { readonly stop: boolean }): ReactNode {
  return stop
    ? <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" /></svg>
    : <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 6h2.5L9 3v10L5.5 10H3z" fill="currentColor" /><path d="M11 5.5a3.5 3.5 0 0 1 0 5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" /></svg>
}

/**
 * Render the speaker control for one finalized answer.
 * @param props - composed slot props.
 * @returns the action button, or nothing while the message carries no text.
 */
export function ReadAloudAction({ messageId, sessionId, useChat, usePlayback, start, stop, t }: ReadAloudActionProps) {
  const text = useChat(snapshot => messageText(snapshot, messageId))
  const state = usePlayback(current => current)
  const { phase, failedFor } = state
  // Leaving the session or closing the chat unmounts this row; its audio must not outlive it.
  const owner = useRef(state.owner)
  owner.current = state.owner
  useEffect(() => () => { if (owner.current === sessionId) stop() }, [sessionId, stop])
  if (text.trim() === '') return null
  const speaking = phase === 'working' || phase === 'playing'
  const key: ReadAloudKey = speaking ? 'action.stop' : 'action.read'
  const failed = phase === 'failed' && failedFor === messageId
  return (
    <span className={css.root}>
      <button
        type="button"
        className={css.button}
        title={t(key)}
        onClick={() => { if (speaking) stop(); else start(text, messageId) }}
        data-phase={phase}
      >
        <SpeakerIcon stop={speaking} />
        <span className={css.label}>{t(key)}</span>
      </button>
      <span className={css.failure} role="alert">{failed ? t('error.failed') : ''}</span>
    </span>
  )
}
