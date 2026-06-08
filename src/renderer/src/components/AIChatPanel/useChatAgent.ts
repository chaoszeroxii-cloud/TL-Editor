// AIChatPanel/useChatAgent.ts
// The agent loop: per user message, call openrouter-chat → if the model returns
// tool calls, stage their effects and feed results back → repeat, capped. Owns
// the chat message list + live streaming state (content / thinking separately).

import { useState, useRef, useCallback } from 'react'
import type { ChatMessage, ChatToolCall, ReasoningEffort, ToolContext } from './types'
import { buildRequestMessages } from './contextBuilder'
import { CHAT_TOOLS, TOOL_INSTRUCTIONS, dispatchToolCall } from './tools'

let seq = 0
const mkId = (p: string): string => `${p}-${Date.now()}-${(seq++).toString(36)}`

// Best-effort extraction of the (possibly incomplete) `text` field from a streaming
// tool-call arguments JSON string — used to show a live translation preview while
// the model writes into set_full_translation / replace_lines.
function extractPartialText(args: string): string {
  const m = args.match(/"text"\s*:\s*"/)
  if (!m || m.index === undefined) return ''
  let i = m.index + m[0].length
  let out = ''
  while (i < args.length) {
    const c = args[i]
    if (c === '\\') {
      const n = args[i + 1]
      if (n === undefined) break // incomplete escape at the stream edge
      if (n === 'n') out += '\n'
      else if (n === 't') out += '\t'
      else if (n === 'r') out += '\r'
      else if (n === '"') out += '"'
      else if (n === '\\') out += '\\'
      else if (n === '/') out += '/'
      else if (n === 'u') {
        const hex = args.slice(i + 2, i + 6)
        if (hex.length < 4) break
        out += String.fromCharCode(parseInt(hex, 16))
        i += 6
        continue
      } else out += n
      i += 2
      continue
    }
    if (c === '"') break // closing quote → end of the text value
    out += c
    i++
  }
  return out
}

export interface ContextInputs {
  basePrompt: string
  projectMemory: string
  glossaryNestedJson: string
  srcContent: string
  tgtContent: string
}

export interface UseChatAgentArgs {
  apiKey: string
  model: string
  reasoningEffort: ReasoningEffort
  /** Fresh pinned-context inputs (read live each turn). */
  getContextInputs: () => ContextInputs
  /** Fresh tool context each iteration (live src/tgt + staging callbacks). */
  makeToolContext: () => ToolContext
  maxIterations?: number
}

export interface ChatAgentApi {
  messages: ChatMessage[]
  setMessages: (m: ChatMessage[]) => void
  isRunning: boolean
  liveContent: string
  liveReasoning: string
  liveToolText: string
  error: string | null
  send: (text: string) => Promise<void>
  stop: () => void
  newChat: () => void
}

function reasoningParam(
  effort: ReasoningEffort
): { effort?: string; enabled?: boolean } | undefined {
  if (effort === 'off') return { enabled: false }
  return { effort }
}

interface ApiResponseMessage {
  content: string | null
  reasoning?: string
  tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[]
}

export function useChatAgent(args: UseChatAgentArgs): ChatAgentApi {
  const { apiKey, model, reasoningEffort, getContextInputs, makeToolContext } = args
  const maxIterations = args.maxIterations ?? 6

  const [messages, setMessagesState] = useState<ChatMessage[]>([])
  // messagesRef is updated only inside callbacks (pushMessage / setMessages), never
  // during render, so the agent loop can read the freshest history synchronously.
  const messagesRef = useRef(messages)
  const setMessages = useCallback((m: ChatMessage[]) => {
    messagesRef.current = m
    setMessagesState(m)
  }, [])
  const pushMessage = useCallback((m: ChatMessage) => {
    const next = [...messagesRef.current, m]
    messagesRef.current = next
    setMessagesState(next)
  }, [])

  const [isRunning, setIsRunning] = useState(false)
  const [liveContent, setLiveContent] = useState('')
  const [liveReasoning, setLiveReasoning] = useState('')
  const [liveToolText, setLiveToolText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const currentRequestId = useRef<string | null>(null)
  const stoppedRef = useRef(false)

  const stop = useCallback(() => {
    stoppedRef.current = true
    const id = currentRequestId.current
    if (id) window.electron.cancelNetworkRequest(id).catch(() => {})
  }, [])

  const newChat = useCallback(() => {
    setMessages([])
    setError(null)
    setLiveContent('')
    setLiveReasoning('')
    setLiveToolText('')
  }, [setMessages])

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || isRunning) return
      if (!apiKey.trim()) {
        setError('ยังไม่ได้ใส่ API key')
        return
      }
      stoppedRef.current = false
      setError(null)
      pushMessage({ id: mkId('u'), role: 'user', content: text, createdAt: Date.now() })
      setIsRunning(true)

      try {
        for (let iter = 0; iter < maxIterations; iter++) {
          if (stoppedRef.current) break

          const requestId = mkId('req')
          currentRequestId.current = requestId
          setLiveContent('')
          setLiveReasoning('')
          setLiveToolText('')

          const onChunk = (...a: unknown[]): void => {
            const p = a[1] as { requestId: string; delta: string }
            if (p?.requestId === requestId) setLiveContent((s) => s + p.delta)
          }
          const onReasoning = (...a: unknown[]): void => {
            const p = a[1] as { requestId: string; delta: string }
            if (p?.requestId === requestId) setLiveReasoning((s) => s + p.delta)
          }
          // Live preview of write-tool text (set_full_translation / replace_lines)
          // assembled from streaming tool-call argument deltas, keyed by tool index.
          const argsByIndex = new Map<number, string>()
          const onToolArgs = (...a: unknown[]): void => {
            const p = a[1] as { requestId: string; index: number; name: string; delta: string }
            if (p?.requestId !== requestId) return
            if (p.name !== 'set_full_translation' && p.name !== 'replace_lines') return
            const acc = (argsByIndex.get(p.index) ?? '') + p.delta
            argsByIndex.set(p.index, acc)
            const partial = extractPartialText(acc)
            if (partial) setLiveToolText(partial)
          }
          window.electron.on('openrouter-stream-chunk', onChunk)
          window.electron.on('openrouter-stream-reasoning', onReasoning)
          window.electron.on('openrouter-stream-toolargs', onToolArgs)

          let raw: string
          try {
            const ctx = getContextInputs()
            const reqMessages = buildRequestMessages({
              basePrompt: ctx.basePrompt,
              projectMemory: ctx.projectMemory,
              glossaryNestedJson: ctx.glossaryNestedJson,
              srcContent: ctx.srcContent,
              tgtContent: ctx.tgtContent,
              toolInstructions: TOOL_INSTRUCTIONS,
              history: messagesRef.current
            })
            const resp = await window.electron.openrouterChat({
              apiKey: apiKey.trim(),
              model,
              messages: reqMessages,
              tools: CHAT_TOOLS as unknown as object[],
              reasoning: reasoningParam(reasoningEffort),
              stream: true,
              requestId
            })
            raw = (resp as { data: string }).data
          } finally {
            window.electron.off('openrouter-stream-chunk', onChunk)
            window.electron.off('openrouter-stream-reasoning', onReasoning)
            window.electron.off('openrouter-stream-toolargs', onToolArgs)
          }

          let msg: ApiResponseMessage
          try {
            const parsed = JSON.parse(raw) as { choices?: { message?: ApiResponseMessage }[] }
            msg = parsed.choices?.[0]?.message ?? { content: null }
          } catch {
            throw new Error(`ตอบกลับ parse ไม่ได้: ${String(raw).slice(0, 120)}`)
          }

          const toolCalls: ChatToolCall[] = (msg.tool_calls ?? [])
            .filter((tc) => tc.function?.name)
            .map((tc) => ({ id: tc.id, name: tc.function.name, arguments: tc.function.arguments }))

          pushMessage({
            id: mkId('a'),
            role: 'assistant',
            content: msg.content ?? '',
            reasoning: msg.reasoning || undefined,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            createdAt: Date.now()
          })
          setLiveContent('')
          setLiveReasoning('')
          setLiveToolText('')

          if (toolCalls.length === 0) break

          // Execute (stage) each tool call and feed the result back.
          const ctx = makeToolContext()
          for (const tc of toolCalls) {
            const result = dispatchToolCall(tc.name, tc.arguments, ctx)
            pushMessage({
              id: mkId('t'),
              role: 'tool',
              content: result,
              toolCallId: tc.id,
              toolName: tc.name,
              createdAt: Date.now()
            })
          }

          if (iter === maxIterations - 1) {
            pushMessage({
              id: mkId('a'),
              role: 'assistant',
              content: `⚠ หยุดที่ ${maxIterations} รอบ (cap) — พิมพ์ต่อให้ทำต่อได้`,
              createdAt: Date.now()
            })
          }
        }
      } catch (e) {
        const err = e as Error
        if (err.name !== 'AbortError' && !stoppedRef.current) setError(String(err.message || err))
      } finally {
        currentRequestId.current = null
        setIsRunning(false)
        setLiveContent('')
        setLiveReasoning('')
        setLiveToolText('')
      }
    },
    [
      apiKey,
      model,
      reasoningEffort,
      isRunning,
      maxIterations,
      getContextInputs,
      makeToolContext,
      pushMessage
    ]
  )

  return {
    messages,
    setMessages,
    isRunning,
    liveContent,
    liveReasoning,
    liveToolText,
    error,
    send,
    stop,
    newChat
  }
}
