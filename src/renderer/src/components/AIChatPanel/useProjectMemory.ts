// AIChatPanel/useProjectMemory.ts
// Loads <root>/.tl-editor/project-memory.md, exposes its content for context
// injection, and persists rewrites accepted from the review queue.

import { useState, useEffect, useCallback } from 'react'
import { tlPaths, readText, writeText } from './storage'

export const MEMORY_MAX_CHARS = 2000

export interface ProjectMemoryApi {
  content: string
  save: (next: string) => Promise<void>
}

export function useProjectMemory(rootDir: string | null): ProjectMemoryApi {
  const [content, setContent] = useState('')
  const memoryPath = rootDir ? tlPaths(rootDir).memoryFile : null

  useEffect(() => {
    let cancelled = false
    if (!memoryPath) return // no folder → caller ignores `content`
    readText(memoryPath).then((t) => {
      if (!cancelled) setContent(t)
    })
    return () => {
      cancelled = true
    }
  }, [memoryPath])

  const save = useCallback(
    async (next: string) => {
      if (!memoryPath) return
      await writeText(memoryPath, next)
      setContent(next)
    },
    [memoryPath]
  )

  return { content, save }
}
