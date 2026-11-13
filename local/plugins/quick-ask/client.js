/**
 * Quick ask — select text in the conversation and ask about it in a throwaway dialog.
 *
 * The dialog talks to a forked child session: it inherits the main conversation up to
 * the fork point, and everything asked inside it stays in that child. Closing the
 * dialog archives the child, so the main conversation receives nothing.
 */
window.__ModuleLoader__.load({
  id: '@local/quick-ask',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const DICT = {
      zh: {
        trigger: '追问',
        title: '追问',
        hint: '分叉自当前对话 · 关闭即丢弃',
        close: '关闭',
        placeholder: '就这段文字提问…（Enter 发送，Shift+Enter 换行）',
        send: '发送',
        thinking: '正在回答…',
        forking: '正在打开小窗…',
        emptyHint: '直接回车，让它解释这段文字',
        failed: '没能打开小窗',
        sendFailed: '发送失败',
      },
      en: {
        trigger: 'Ask',
        title: 'Quick ask',
        hint: 'Forked from this conversation · discarded on close',
        close: 'Close',
        placeholder: 'Ask about this text… (Enter to send, Shift+Enter for a new line)',
        send: 'Send',
        thinking: 'Answering…',
        forking: 'Opening the dialog…',
        emptyHint: 'Press Enter to ask for an explanation',
        failed: 'The dialog could not open',
        sendFailed: 'The message was not sent',
      },
    }

    const CSS = `
.qa-chip {
  position: fixed; z-index: 70; display: inline-flex; align-items: center; justify-content: center;
  height: 28px; padding: 0 10px; border: none; border-radius: 999px; corner-shape: round;
  background: var(--dsw-alias-button-floating-fill);
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l3);
  box-shadow: var(--dsw-elevation-panel);
  color: var(--dsw-alias-label-primary); font: var(--dsw-font-xs-13); cursor: pointer;
  pointer-events: auto;
}
.qa-chip:hover { background: var(--dsw-alias-button-floating-hover); }
.qa-panel {
  position: fixed; z-index: 80; display: flex; flex-direction: column; overflow: hidden;
  width: min(420px, calc(100vw - 24px)); height: min(540px, calc(100vh - 24px));
  color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-overlay);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 14px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
  pointer-events: auto; font: 13px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.qa-header {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 8px 8px 8px 14px; border-bottom: 1px solid var(--dsw-alias-border-l1);
  cursor: grab; user-select: none; touch-action: none;
}
.qa-panel[data-dragging="true"] .qa-header { cursor: grabbing; }
.qa-headings { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.qa-title { font-size: 13px; font-weight: 500; }
.qa-hint { font-size: 11px; line-height: 1.4; color: var(--dsw-alias-label-secondary); }
.qa-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border: none; border-radius: 6px;
  background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; cursor: pointer;
}
.qa-close:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.qa-quote {
  margin: 10px 14px 0; padding: 8px 10px; max-height: 92px; overflow: auto;
  white-space: pre-wrap; color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-2); border-radius: 8px;
  font-size: 12px; line-height: 1.5; scrollbar-width: thin;
}
.qa-list {
  flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 10px; scrollbar-width: thin;
}
.qa-list::-webkit-scrollbar { width: 8px; }
.qa-list::-webkit-scrollbar-thumb { background: var(--dsw-alias-border-l1); border-radius: 999px; }
.qa-list::-webkit-scrollbar-track { background: transparent; }
.qa-user {
  align-self: flex-end; max-width: 85%; padding: 6px 10px; border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2); white-space: pre-wrap; word-break: break-word;
}
.qa-assistant { align-self: stretch; word-break: break-word; }
.qa-assistant p { margin: 0 0 8px; white-space: pre-wrap; }
.qa-assistant p:last-child { margin-bottom: 0; }
.qa-assistant ul, .qa-assistant ol { margin: 4px 0 8px; padding-left: 20px; }
.qa-assistant li { margin: 2px 0; }
.qa-assistant a { color: var(--dsw-alias-brand-primary); text-decoration: none; }
.qa-assistant a:hover { text-decoration: underline; }
.qa-code {
  padding: 1px 5px; border-radius: 4px; background: var(--dsw-alias-bg-layer-2);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px;
}
.qa-pre {
  margin: 6px 0; padding: 10px 12px; border-radius: 8px; overflow-x: auto;
  background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1);
  scrollbar-width: thin;
}
.qa-pre code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px; line-height: 1.5; white-space: pre;
}
.qa-h { margin: 10px 0 4px; font-weight: 500; }
.qa-h1 { font-size: 16px; }
.qa-h2 { font-size: 15px; }
.qa-h3 { font-size: 14px; }
.qa-h4, .qa-h5, .qa-h6 { font-size: 13px; }
.qa-blockquote {
  margin: 4px 0 8px; padding-left: 10px; border-left: 2px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary); white-space: pre-wrap;
}
.qa-hr { border: none; border-top: 1px solid var(--dsw-alias-border-l1); margin: 8px 0; }
.qa-note { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.qa-error { color: var(--dsw-alias-state-error-primary); font-size: 12px; padding: 0 14px 8px; }
.qa-composer {
  display: flex; align-items: flex-end; gap: 8px; padding: 10px 14px;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.qa-input {
  flex: 1 1 auto; min-height: 36px; max-height: 132px; resize: none;
  padding: 8px 10px; border-radius: 8px; outline: none;
  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary); font: 13px/1.5 inherit;
}
.qa-input:focus { border-color: var(--dsw-alias-brand-primary); }
.qa-send {
  height: 32px; padding: 0 14px; border: none; border-radius: 8px;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
  font: 500 13px/1 system-ui, -apple-system, "Segoe UI", sans-serif; cursor: pointer;
}
.qa-send:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.qa-send:disabled { opacity: 0.4; cursor: not-allowed; }
`

    const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|~~[^~\n]+~~|\[[^\]\n]+\]\([^)\s]+\))/g
    const QUESTION_PREFIX = '请解释下面这段文字：'

    /** @returns the shared, apply-scoped dialogue state. */
    function createRuntime() {
      const scopes = new Map()
      const listeners = new Set()
      let snapshot = { trigger: null, dialog: null }
      return {
        scopes,
        getSnapshot: () => snapshot,
        subscribe(listener) {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        patch(next) {
          snapshot = { ...snapshot, ...next }
          for (const listener of [...listeners]) listener()
        },
      }
    }

    /** @returns the localized text lookup, falling back to Chinese copy. */
    function createTranslate(locale) {
      let bound = null
      try {
        if (locale !== undefined && typeof locale.register === 'function') {
          locale.register('quickAsk', DICT)
          bound = locale.bind('quickAsk')
        }
      } catch {
        bound = null
      }
      return (key) => {
        try {
          const value = bound === null ? undefined : bound(key)
          if (typeof value === 'string' && value !== '') return value
        } catch {
          // Fall through to the bundled copy when the dictionary is unavailable.
        }
        return DICT.zh[key] ?? key
      }
    }

    /** @returns the text of a content-part array, ignoring non-text parts. */
    function partsText(parts) {
      if (!Array.isArray(parts)) return ''
      return parts
        .filter(part => part !== null && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string')
        .map(part => part.text)
        .join('\n')
        .trim()
    }

    /** @returns the largest event seq present in one window. */
    function maxSeq(windowSnapshot) {
      let max = 0
      for (const entry of windowSnapshot.entries) {
        const seq = entry.event?.seq
        if (typeof seq === 'number' && seq > max) max = seq
      }
      return max
    }

    /** @returns the question part of our own first prompt, without the quoted selection. */
    function displayUserText(text) {
      if (!text.startsWith(QUESTION_PREFIX)) return text
      const marker = '」\n\n'
      const index = text.lastIndexOf(marker)
      if (index < 0) return text
      return text.slice(index + marker.length).trim()
    }

    /** @returns settled bubbles plus the streaming assistant text after the fork boundary. */
    function foldMessages(windowSnapshot, boundary) {
      const items = []
      let live = ''
      for (const entry of windowSnapshot.entries) {
        const event = entry.event
        if (entry.type === 'transient') {
          const chunk = event.data?.chunk
          if (event.type === 'assistant/live-chunk' && chunk?.type === 'text-delta' && typeof chunk.text === 'string') {
            live += chunk.text
          }
          continue
        }
        if (typeof event.seq !== 'number' || event.seq <= boundary) continue
        if (event.type === 'user/message') {
          if (event.data?.source?.kind !== 'user') continue
          const text = displayUserText(partsText(event.data?.content))
          if (text !== '') items.push({ id: `u${event.seq}`, kind: 'user', text })
        } else if (event.type === 'assistant/message') {
          const text = partsText(event.data?.message?.content)
          if (text !== '') items.push({ id: `a${event.seq}`, kind: 'assistant', text })
          live = ''
        }
      }
      return { items, live }
    }

    /** @returns inline markdown as React nodes. */
    function renderInline(text, keyBase) {
      const nodes = []
      const parts = String(text).split(INLINE)
      parts.forEach((part, index) => {
        if (part === undefined || part === '') return
        const key = `${keyBase}:${index}`
        if (/^`[^`]*`$/.test(part)) {
          nodes.push(h('code', { key, className: 'qa-code' }, part.slice(1, -1)))
        } else if (/^\*\*[^*]*\*\*$/.test(part) || /^__[^_]*__$/.test(part)) {
          nodes.push(h('strong', { key }, part.slice(2, -2)))
        } else if (/^\*[^*]*\*$/.test(part) || /^_[^_]*_$/.test(part)) {
          nodes.push(h('em', { key }, part.slice(1, -1)))
        } else if (/^~~[^~]*~~$/.test(part)) {
          nodes.push(h('del', { key }, part.slice(2, -2)))
        } else if (/^\[[^\]]*\]\([^)]*\)$/.test(part)) {
          const link = /^\[([^\]]*)\]\(([^)]*)\)$/.exec(part)
          nodes.push(h('a', { key, href: link[2], target: '_blank', rel: 'noreferrer noopener' }, link[1]))
        } else {
          nodes.push(part)
        }
      })
      return nodes
    }

    /** @returns the block-level markdown rendering for one assistant message. */
    function renderMarkdown(text) {
      const lines = String(text).split('\n')
      const blocks = []
      let index = 0
      let key = 0
      const next = () => `b${key++}`
      while (index < lines.length) {
        const line = lines[index]
        if (/^\s*```/.test(line)) {
          const body = []
          index += 1
          while (index < lines.length && !/^\s*```/.test(lines[index])) {
            body.push(lines[index])
            index += 1
          }
          index += 1
          blocks.push(h('pre', { key: next(), className: 'qa-pre' }, h('code', null, body.join('\n'))))
          continue
        }
        if (/^\s*$/.test(line)) { index += 1; continue }
        const heading = /^(#{1,6})\s+(.*)$/.exec(line)
        if (heading !== null) {
          const level = heading[1].length
          blocks.push(h('div', { key: next(), className: `qa-h qa-h${level}` }, renderInline(heading[2], `h${key}`)))
          index += 1
          continue
        }
        const isBullet = /^\s*[-*+]\s+/.test(line)
        const isOrdered = /^\s*\d+\.\s+/.test(line)
        if (isBullet || isOrdered) {
          const items = []
          while (index < lines.length
            && (isOrdered ? /^\s*\d+\.\s+/ : /^\s*[-*+]\s+/).test(lines[index])) {
            const body = lines[index].replace(/^\s*([-*+]|\d+\.)\s+/, '')
            items.push(h('li', { key: `i${key++}` }, renderInline(body, `l${key}`)))
            index += 1
          }
          blocks.push(h(isOrdered ? 'ol' : 'ul', { key: next() }, items))
          continue
        }
        if (/^\s*>/.test(line)) {
          const quoted = []
          while (index < lines.length && /^\s*>/.test(lines[index])) {
            quoted.push(lines[index].replace(/^\s*>\s?/, ''))
            index += 1
          }
          blocks.push(h('blockquote', { key: next(), className: 'qa-blockquote' },
            renderInline(quoted.join('\n'), `q${key}`)))
          continue
        }
        if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
          blocks.push(h('hr', { key: next(), className: 'qa-hr' }))
          index += 1
          continue
        }
        const paragraph = []
        while (index < lines.length
          && !/^\s*$/.test(lines[index])
          && !/^\s*(```|#{1,6}\s|[-*+]\s|\d+\.\s|>|---|\*\*\*|___)/.test(lines[index])) {
          paragraph.push(lines[index])
          index += 1
        }
        blocks.push(h('p', { key: next() }, renderInline(paragraph.join('\n'), `p${key}`)))
      }
      return blocks
    }

    /** @returns the conversation scroll root tracked for one session, or null. */
    function scopeRoot(runtime, sessionId) {
      const locate = runtime.scopes.get(sessionId)
      return locate === undefined ? null : locate()
    }

    /** @returns the live selection inside a tracked conversation, or null. */
    function readSelection(runtime) {
      const selection = document.getSelection()
      if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) return null
      const text = selection.toString().trim()
      if (text === '') return null
      const range = selection.getRangeAt(0)
      const start = range.startContainer
      const element = start.nodeType === Node.ELEMENT_NODE ? start : start.parentElement
      if (!(element instanceof Element)) return null
      const source = element.closest('[data-text-interaction-source]')
      if (source === null) return null
      let owner = null
      for (const [sessionId, locate] of runtime.scopes) {
        const root = locate()
        if (root === null || !root.contains(source) || root.getClientRects().length === 0) continue
        owner = sessionId
        break
      }
      if (owner === null) return null
      const rects = range.getClientRects()
      const rect = rects.length > 0 ? rects[0] : range.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return null
      return {
        sessionId: owner,
        text,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      }
    }

    /** @returns the visible host selection-action bubble inside one conversation, or null. */
    function measureQuoteSurface(root) {
      const scope = root === undefined || root === null ? document : root
      const surface = scope.querySelector('[data-text-interaction-surface]')
      if (!(surface instanceof HTMLElement)) return null
      const style = window.getComputedStyle(surface)
      if (style.visibility === 'hidden' || style.display === 'none') return null
      const rect = surface.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return null
      return { left: rect.left, right: rect.right, top: rect.top, height: rect.height }
    }

    /**
     * Place the chip in the host bubble's row, one gap to its right.
     * @returns fixed-position coordinates, flipped left when the right edge does not fit.
     */
    function chipPlacement(rect, anchor) {
      const width = 64
      const height = 28
      const gap = 6
      const margin = 8
      if (anchor !== undefined && anchor !== null) {
        const top = `${Math.max(margin, anchor.top + (anchor.height - height) / 2)}px`
        const match = { height: `${Math.round(anchor.height)}px` }
        const rightSide = anchor.right + gap
        if (rightSide + width <= window.innerWidth - margin) return { left: `${rightSide}px`, top, ...match }
        const leftSide = anchor.left - gap - width
        if (leftSide >= margin) return { left: `${leftSide}px`, top, ...match }
        return { left: `${Math.max(margin, Math.min(rightSide, window.innerWidth - width - margin))}px`, top, ...match }
      }
      const left = Math.max(margin, Math.min(rect.right + 8, window.innerWidth - width - margin))
      const below = rect.bottom + 8
      const top = below + height <= window.innerHeight - margin
        ? `${below}px`
        : `${Math.max(margin, rect.top - height - 8)}px`
      return { left: `${left}px`, top }
    }

    /** @returns the bottom-right default of the dialog, clamped to the viewport. */
    function defaultPanelPos() {
      const width = Math.min(420, window.innerWidth - 24)
      const height = Math.min(540, window.innerHeight - 24)
      return {
        left: Math.max(8, window.innerWidth - width - 16),
        top: Math.max(8, window.innerHeight - height - 16),
      }
    }

    /**
     * Open a forked child session and swap the dialog into its chat phase.
     * @param runtime - shared dialogue state.
     * @param deps - sessions and workspace services.
     * @param translate - localized copy lookup.
     * @param trigger - the admitted selection.
     */
    async function openDialog(runtime, deps, translate, trigger) {
      runtime.patch({ trigger: null, dialog: { phase: 'forking', quote: trigger.text } })
      try {
        const parent = deps.sessions.binding(trigger.sessionId)
        const boundary = parent === undefined ? 0 : maxSeq(parent.eventSource.getSnapshot())
        const childId = await deps.sessions.fork(boundary > 0
          ? { sessionId: trigger.sessionId, atSeq: boundary }
          : { sessionId: trigger.sessionId })
        const reference = deps.sessions.retain(childId, { source: 'gateway' })
        const binding = await reference.ready
        const forkPoint = boundary > 0 ? boundary : maxSeq(binding.eventSource.getSnapshot())
        runtime.patch({
          dialog: {
            phase: 'chat', quote: trigger.text, childId, reference, binding,
            boundary: forkPoint, pos: defaultPanelPos(), error: null,
          },
        })
      } catch (error) {
        runtime.patch({
          dialog: {
            phase: 'error',
            quote: trigger.text,
            error: `${translate('failed')}: ${error instanceof Error ? error.message : String(error)}`,
          },
        })
      }
    }

    /**
     * Close the dialog: stop and archive the child, release its reference, and drop the state.
     * @param runtime - shared dialogue state.
     * @param deps - sessions and workspace services.
     */
    function closeDialog(runtime, deps) {
      const dialog = runtime.getSnapshot().dialog
      runtime.patch({ dialog: null })
      if (dialog === null || dialog.phase !== 'chat') return
      try { dialog.reference.release() } catch { /* The reference is already gone. */ }
      deps.uiWorkspace?.archiveSession?.(dialog.childId, { stopActivity: true })?.catch(() => {
        // Archiving is best effort: the child still never writes back to the main line.
      })
    }

    /** Hidden dock marker that tells the overlay which conversation a selection belongs to. */
    function ScopeMarker(props) {
      const { runtime, sessionId } = props
      const ref = React.useRef(null)
      React.useEffect(() => {
        if (typeof sessionId !== 'string') return () => {}
        runtime.scopes.set(sessionId, () => (ref.current === null ? null : ref.current.closest('[data-conversation-scroll]')))
        return () => {
          if (runtime.scopes.get(sessionId) !== undefined) runtime.scopes.delete(sessionId)
        }
      }, [runtime, sessionId])
      return h('span', { ref, style: { display: 'none' }, 'aria-hidden': 'true' })
    }

    /** The forked child conversation shown inside the dialog. */
    function MiniChat(props) {
      const { dialog, t } = props
      const getWindow = React.useCallback(() => dialog.binding.eventSource.getSnapshot(), [dialog.binding])
      const subscribeWindow = React.useCallback(fn => dialog.binding.eventSource.subscribe(fn), [dialog.binding])
      const getSession = React.useCallback(() => dialog.binding.session.getSnapshot(), [dialog.binding])
      const subscribeSession = React.useCallback(fn => dialog.binding.session.subscribe(fn), [dialog.binding])
      const windowSnapshot = React.useSyncExternalStore(subscribeWindow, getWindow)
      const sessionSnapshot = React.useSyncExternalStore(subscribeSession, getSession)
      const { items, live } = foldMessages(windowSnapshot, dialog.boundary)
      const [draft, setDraft] = React.useState('')
      const [sending, setSending] = React.useState(false)
      const [error, setError] = React.useState(null)
      const listRef = React.useRef(null)
      const inputRef = React.useRef(null)
      const running = sessionSnapshot.running || sending

      React.useEffect(() => {
        const node = listRef.current
        if (node !== null) node.scrollTop = node.scrollHeight
      }, [items.length, live, running])

      React.useEffect(() => {
        const node = inputRef.current
        if (node !== null) node.focus()
      }, [])

      const send = React.useCallback(async () => {
        if (running) return
        const question = draft.trim()
        const first = items.length === 0
        if (question === '' && !first) return
        const payload = first
          ? `${QUESTION_PREFIX}\n\n「${dialog.quote}」\n\n${question === '' ? '解释一下。' : question}`
          : question
        setSending(true)
        setError(null)
        setDraft('')
        try {
          const result = await dialog.binding.session.prompt([{ type: 'text', text: payload }], 'queue')
          if (result !== undefined && result !== null && result.ok === false) {
            setError(`${t('sendFailed')}: ${result.error?.message ?? ''}`.trim())
          }
        } catch (failure) {
          setError(`${t('sendFailed')}: ${failure instanceof Error ? failure.message : String(failure)}`)
        } finally {
          setSending(false)
        }
      }, [dialog.binding, dialog.quote, draft, items.length, running, t])

      const onKeyDown = (event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent?.isComposing) {
          event.preventDefault()
          void send()
        }
      }

      return h(React.Fragment, null,
        h('div', { className: 'qa-quote', title: dialog.quote }, dialog.quote),
        h('div', { className: 'qa-list', ref: listRef },
          items.length === 0 && live === '' && !running
            ? h('div', { className: 'qa-note' }, t('emptyHint'))
            : null,
          ...items.map(item => (item.kind === 'user'
            ? h('div', { key: item.id, className: 'qa-user' }, item.text)
            : h('div', { key: item.id, className: 'qa-assistant' }, renderMarkdown(item.text)))),
          live !== ''
            ? h('div', { className: 'qa-assistant' }, renderMarkdown(live))
            : null,
          running && live === ''
            ? h('div', { className: 'qa-note' }, t('thinking'))
            : null),
        error === null ? null : h('div', { className: 'qa-error' }, error),
        h('div', { className: 'qa-composer' },
          h('textarea', {
            ref: inputRef,
            className: 'qa-input',
            rows: 1,
            value: draft,
            placeholder: t('placeholder'),
            disabled: running,
            onChange: event => setDraft(event.target.value),
            onKeyDown,
          }),
          h('button', {
            type: 'button',
            className: 'qa-send',
            disabled: running,
            onClick: () => { void send() },
          }, t('send'))))
    }

    /** Root-scope overlay: the selection chip and the draggable throwaway dialog. */
    function QuickAskOverlay(props) {
      const { runtime, deps, t } = props
      const snapshot = React.useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
      const dialog = snapshot.dialog
      const panelRef = React.useRef(null)
      const dragRef = React.useRef(null)
      const [dragging, setDragging] = React.useState(false)

      React.useEffect(() => {
        let frame
        let anchorFrames = 0
        const schedule = () => {
          if (frame !== undefined) return
          frame = window.requestAnimationFrame(() => {
            frame = undefined
            if (runtime.getSnapshot().dialog !== null) return
            const next = readSelection(runtime)
            if (next === null) {
              runtime.patch({ trigger: null })
              return
            }
            const anchor = measureQuoteSurface(scopeRoot(runtime, next.sessionId))
            anchorFrames = 0
            runtime.patch({ trigger: { ...next, anchor } })
            if (anchor === null) settleAnchor()
          })
        }
        /**
         * The host bubble renders a frame or two after the gesture; keep looking for it
         * so the chip joins its row instead of falling back to the selection corner.
         */
        const settleAnchor = () => {
          const current = runtime.getSnapshot().trigger
          if (current === null || current.anchor !== null || current.anchor === undefined) return
          const anchor = measureQuoteSurface(scopeRoot(runtime, current.sessionId))
          if (anchor !== null) {
            runtime.patch({ trigger: { ...current, anchor } })
            return
          }
          anchorFrames += 1
          if (anchorFrames < 40) window.requestAnimationFrame(settleAnchor)
        }
        const clear = () => {
          if (runtime.getSnapshot().trigger !== null) runtime.patch({ trigger: null })
        }
        const onPointerDown = (event) => {
          const path = typeof event.composedPath === 'function' ? event.composedPath() : []
          const inside = path.some(node => node instanceof Element && node.hasAttribute('data-quick-ask-surface'))
          if (!inside) clear()
        }
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return
          if (runtime.getSnapshot().dialog !== null) closeDialog(runtime, deps)
          else clear()
        }
        const onScroll = () => clear()
        document.addEventListener('selectionchange', schedule)
        document.addEventListener('pointerup', schedule)
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown)
        document.addEventListener('scroll', onScroll, true)
        window.addEventListener('resize', onScroll)
        return () => {
          if (frame !== undefined) window.cancelAnimationFrame(frame)
          document.removeEventListener('selectionchange', schedule)
          document.removeEventListener('pointerup', schedule)
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown)
          document.removeEventListener('scroll', onScroll, true)
          window.removeEventListener('resize', onScroll)
        }
      }, [runtime, deps])

      const movePanel = React.useCallback((pos) => {
        const current = runtime.getSnapshot().dialog
        if (current === null || current.phase !== 'chat') return
        runtime.patch({ dialog: { ...current, pos } })
      }, [runtime])

      const onHeaderPointerDown = (event) => {
        const target = event.target
        if (target instanceof Element && target.closest('button') !== null) return
        const node = panelRef.current
        if (node === null) return
        const rect = node.getBoundingClientRect()
        dragRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top }
        setDragging(true)
        event.currentTarget.setPointerCapture?.(event.pointerId)
        event.preventDefault()
      }
      const onHeaderPointerMove = (event) => {
        const drag = dragRef.current
        const node = panelRef.current
        if (drag === null || node === null) return
        const width = node.offsetWidth
        const height = node.offsetHeight
        const left = Math.max(8, Math.min(event.clientX - drag.dx, window.innerWidth - width - 8))
        const top = Math.max(8, Math.min(event.clientY - drag.dy, window.innerHeight - height - 8))
        movePanel({ left, top })
      }
      const onHeaderPointerUp = (event) => {
        dragRef.current = null
        setDragging(false)
        event.currentTarget.releasePointerCapture?.(event.pointerId)
      }

      const trigger = snapshot.trigger
      const hoverPlacement = trigger === null ? null : chipPlacement(trigger, trigger.anchor)
      return h(React.Fragment, null,
        h('style', null, CSS),
        trigger === null || dialog !== null
          ? null
          : h('button', {
            type: 'button',
            'data-quick-ask-surface': '',
            className: 'qa-chip',
            style: {
              left: hoverPlacement.left,
              top: hoverPlacement.top,
              ...(hoverPlacement.height === undefined ? {} : { height: hoverPlacement.height }),
            },
            onPointerDown: event => event.preventDefault(),
            onClick: () => { void openDialog(runtime, deps, t, trigger) },
          }, t('trigger')),
        dialog === null
          ? null
          : h('div', {
            'data-quick-ask-surface': '',
            'data-dragging': dragging ? 'true' : 'false',
            className: 'qa-panel',
            ref: panelRef,
            style: dialog.phase === 'chat' && dialog.pos !== undefined
              ? { left: `${dialog.pos.left}px`, top: `${dialog.pos.top}px`, right: 'auto', bottom: 'auto' }
              : { right: '16px', bottom: '16px' },
          },
          h('div', {
            className: 'qa-header',
            onPointerDown: onHeaderPointerDown,
            onPointerMove: onHeaderPointerMove,
            onPointerUp: onHeaderPointerUp,
            onPointerCancel: onHeaderPointerUp,
          },
          h('div', { className: 'qa-headings' },
            h('span', { className: 'qa-title' }, t('title')),
            h('span', { className: 'qa-hint' }, t('hint'))),
          h('button', {
            type: 'button',
            className: 'qa-close',
            onClick: () => closeDialog(runtime, deps),
            title: t('close'),
            'aria-label': t('close'),
          }, '✕')),
          dialog.phase === 'chat'
            ? h(MiniChat, { dialog, t })
            : h('div', { className: 'qa-note', style: { padding: '16px 14px' } },
              dialog.phase === 'error' ? (dialog.error ?? t('failed')) : t('forking'))),
      )
    }

    return {
      name: 'quick-ask',
      // The dialog cannot do anything without these; waiting on the services keeps a
      // boot-time activation from running before the session face exists.
      inject: ['slots', 'sessions', 'uiWorkspace', 'locale'],
      apply(ctx) {
        const sessions = ctx.get('sessions')
        const uiWorkspace = ctx.get('uiWorkspace')
        const locale = ctx.get('locale')
        if (sessions === undefined) return
        const runtime = createRuntime()
        const t = createTranslate(locale)
        const deps = { sessions, uiWorkspace }

        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock', id: 'quick-ask-scope', order: 90,
        }, props => h(ScopeMarker, { runtime, sessionId: props.sessionId })))

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay', id: 'quick-ask', order: 60,
        }, () => h(QuickAskOverlay, { runtime, deps, t })))
      },
    }
  },
})
