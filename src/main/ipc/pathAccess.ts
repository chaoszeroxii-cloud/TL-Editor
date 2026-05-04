import path from 'path'

const approvedPaths = new Set<string>()

function normalizeTarget(target: string): string {
  return path.resolve(target)
}

function isWithin(base: string, target: string): boolean {
  return target === base || target.startsWith(`${base}${path.sep}`)
}

export function approvePath(target?: string | null): void {
  if (!target) return
  approvedPaths.add(normalizeTarget(target))
}

export function approvePaths(targets: Array<string | null | undefined>): void {
  for (const target of targets) approvePath(target)
}

export function approveConfigPaths(config: {
  folderPath?: string | null
  jsonPaths?: string[]
  aiPromptPath?: string
  aiGlossaryPath?: string
  ttsOutputPath?: string
  mp4OutputPath?: string
  mp4ImagePath?: string
  pairingSourcePath?: string
}): void {
  approvePath(config.folderPath)
  approvePaths(config.jsonPaths ?? [])
  approvePath(config.aiPromptPath)
  approvePath(config.aiGlossaryPath)
  approvePath(config.ttsOutputPath)
  approvePath(config.mp4OutputPath)
  approvePath(config.mp4ImagePath)
  approvePath(config.pairingSourcePath)
}

export function assertPathAllowed(target: string): string {
  const normalized = normalizeTarget(target)
  for (const approved of approvedPaths) {
    if (isWithin(approved, normalized) || isWithin(normalized, approved)) {
      return normalized
    }
  }
  throw new Error(`Access denied for path: ${target}`)
}
