import { useEffect } from 'react'

interface UseKeyboardShortcutsProps {
  handleSave: () => void
  handleSrcSave: () => void
  handleUndo: () => void
  handleRedo: () => void
  handleCopyTgt: () => void
  handleCopySrc: () => void
  toggleTerminal: () => void
  toggleSidebar: () => void
  toggleGlossary: () => void
  handleRefresh: () => void
  toggleJsonManager: (hasFiles: boolean) => void
  toggleStyleProfile: () => void
  sourceFilePathsCount: number
}

export function useKeyboardShortcuts({
  handleSave,
  handleSrcSave,
  handleUndo,
  handleRedo,
  handleCopyTgt,
  handleCopySrc,
  toggleTerminal,
  toggleSidebar,
  toggleGlossary,
  handleRefresh,
  toggleJsonManager,
  toggleStyleProfile,
  sourceFilePathsCount
}: UseKeyboardShortcutsProps): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return
      const code = e.code

      if (code === 'KeyS') {
        e.preventDefault()
        if (e.shiftKey) handleSrcSave()
        else handleSave()
        return
      }
      if (code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
        return
      }
      if (code === 'KeyY' || (code === 'KeyZ' && e.shiftKey)) {
        e.preventDefault()
        handleRedo()
        return
      }
      if (code === 'Backquote') {
        e.preventDefault()
        toggleTerminal()
        return
      }
      if (code === 'KeyB') {
        e.preventDefault()
        toggleSidebar()
        return
      }
      if (code === 'KeyG') {
        e.preventDefault()
        toggleGlossary()
        return
      }
      if (code === 'KeyR') {
        e.preventDefault()
        handleRefresh()
        return
      }
      if (code === 'KeyJ') {
        e.preventDefault()
        toggleJsonManager(sourceFilePathsCount > 0)
        return
      }
      if (code === 'KeyC' && e.shiftKey) {
        e.preventDefault()
        handleCopyTgt()
        return
      }
      if (code === 'KeyC' && e.altKey) {
        e.preventDefault()
        handleCopySrc()
        return
      }
      // Ctrl+Shift+P → toggle Style Profile
      if (code === 'KeyP' && e.shiftKey) {
        e.preventDefault()
        toggleStyleProfile()
        return
      }
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('app:save', handleSave)
    window.addEventListener('app:save-src', handleSrcSave)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('app:save', handleSave)
      window.removeEventListener('app:save-src', handleSrcSave)
    }
  }, [
    handleSave,
    handleSrcSave,
    handleUndo,
    handleRedo,
    handleCopyTgt,
    handleCopySrc,
    toggleTerminal,
    toggleSidebar,
    toggleGlossary,
    handleRefresh,
    toggleJsonManager,
    sourceFilePathsCount,
    toggleStyleProfile
  ])
}
