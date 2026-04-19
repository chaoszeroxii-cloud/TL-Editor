// ─── glossaryLoader.ts ─────────────────────────────────────────────────────
// Loads glossaries (at_lib.json, bf_lib.json) from target directory
// for TTS API integration

export interface GlossaryLibraries {
  at_lib: Record<string, string>
  bf_lib: Record<string, string>
}

/** Load glossary libraries from config jsonPaths (with fallback to tgt directory) */
export async function loadGlossariesFromConfig(
  jsonPaths?: string[],
  tgtPath?: string | null
): Promise<{ libs: GlossaryLibraries; atPath?: string; bfPath?: string }> {
  let at_lib: Record<string, string> = {}
  let bf_lib: Record<string, string> = {}
  let atPath: string | undefined
  let bfPath: string | undefined

  // First try to load from jsonPaths
  if (jsonPaths && jsonPaths.length > 0) {
    for (const path of jsonPaths) {
      if (path.toLowerCase().includes('at_lib')) {
        try {
          const content = await window.electron.readFileOptional(path)
          if (!content) continue
          at_lib = JSON.parse(content)
          atPath = path
        } catch {
          // Continue to next
        }
      }
      if (path.toLowerCase().includes('bf_lib')) {
        try {
          const content = await window.electron.readFileOptional(path)
          if (!content) continue
          bf_lib = JSON.parse(content)
          bfPath = path
        } catch {
          // Continue to next
        }
      }
    }
  }

  // If not found in config, try tgt directory
  if (!atPath || !bfPath) {
    if (tgtPath) {
      const tgtDir = tgtPath.split(/[\\/]/).slice(0, -1).join('/')

      if (!atPath) {
        try {
          const atContent = await window.electron.readFileOptional(`${tgtDir}/at_lib.json`)
          if (atContent) {
            at_lib = JSON.parse(atContent)
            atPath = `${tgtDir}/at_lib.json`
          }
        } catch {
          // File doesn't exist
        }
      }

      if (!bfPath) {
        try {
          const bfContent = await window.electron.readFileOptional(`${tgtDir}/bf_lib.json`)
          if (bfContent) {
            bf_lib = JSON.parse(bfContent)
            bfPath = `${tgtDir}/bf_lib.json`
          }
        } catch {
          // File doesn't exist
        }
      }
    }
  }

  return { libs: { at_lib, bf_lib }, atPath, bfPath }
}
