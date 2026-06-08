// AIChatPanel/useChatSessions.ts
// Free-form ChatGPT-style sessions persisted under <root>/.tl-editor/sessions/.
//   - sessions/index.json holds [{ id, title, updatedAt }] for the browser list
//   - sessions/<id>.json holds the full ChatSession
// Autosaves the current conversation (debounced). Only active when a folder is
// open; otherwise the chat still works, just unsaved.

import { useState, useEffect, useCallback } from 'react'
import type { ChatMessage, ChatSession, SessionMeta } from './types'
import { tlPaths, readJson, writeJson } from './storage'

function mkId(): string {
  return 's-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
}

function titleFrom(messages: ChatMessage[]): string {
  const u = messages.find((m) => m.role === 'user')
  const t = (u?.content ?? '').trim().replace(/\s+/g, ' ')
  return t ? t.slice(0, 40) : 'แชทใหม่'
}

export interface ChatSessionsApi {
  list: SessionMeta[]
  currentId: string | null
  createNew: () => void
  open: (id: string) => void
  remove: (id: string) => void
}

export function useChatSessions(args: {
  rootDir: string | null
  messages: ChatMessage[]
  setMessages: (m: ChatMessage[]) => void
}): ChatSessionsApi {
  const { rootDir, messages, setMessages } = args
  const [list, setList] = useState<SessionMeta[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  // Gate index writes until the folder's index has loaded — prevents clobbering it
  // with [] on mount, and lets deleting the last session persist (empty index).
  const [loadedPath, setLoadedPath] = useState<string | null>(null)

  const indexPath = rootDir ? tlPaths(rootDir).sessionsIndex : null
  const base = rootDir ? tlPaths(rootDir).base : null

  // Load the session index when the folder changes; start a fresh session.
  useEffect(() => {
    let cancelled = false
    if (!indexPath) return
    readJson<SessionMeta[]>(indexPath).then((idx) => {
      if (cancelled) return
      setList(Array.isArray(idx) ? idx : [])
      setCurrentId(mkId())
      setLoadedPath(indexPath)
    })
    return () => {
      cancelled = true
    }
  }, [indexPath])

  // Persist the index whenever the list changes (only after the folder loaded).
  useEffect(() => {
    if (!indexPath || loadedPath !== indexPath) return
    writeJson(indexPath, list).catch(() => {})
  }, [list, indexPath, loadedPath])

  // Debounced autosave of the current conversation.
  useEffect(() => {
    if (!rootDir || !currentId || messages.length === 0) return
    const paths = tlPaths(rootDir)
    const t = setTimeout(() => {
      const now = Date.now()
      const title = titleFrom(messages)
      const session: ChatSession = { id: currentId, title, messages, createdAt: now, updatedAt: now }
      writeJson(paths.sessionFile(currentId), session).catch(() => {})
      setList((prev) => [{ id: currentId, title, updatedAt: now }, ...prev.filter((s) => s.id !== currentId)])
    }, 600)
    return () => clearTimeout(t)
  }, [messages, currentId, rootDir])

  const createNew = useCallback(() => {
    setMessages([])
    setCurrentId(mkId())
  }, [setMessages])

  const open = useCallback(
    async (id: string) => {
      if (!base) return
      const s = await readJson<ChatSession>(tlPaths(rootDir as string).sessionFile(id))
      setMessages(s?.messages ?? [])
      setCurrentId(id)
    },
    [base, rootDir, setMessages]
  )

  const remove = useCallback(
    (id: string) => {
      if (rootDir) window.electron.deleteFile(tlPaths(rootDir).sessionFile(id)).catch(() => {})
      setList((prev) => prev.filter((s) => s.id !== id))
      if (id === currentId) {
        setMessages([])
        setCurrentId(mkId())
      }
    },
    [rootDir, currentId, setMessages]
  )

  return { list, currentId, createNew, open, remove }
}
