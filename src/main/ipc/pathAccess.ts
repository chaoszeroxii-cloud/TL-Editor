import path from 'path'

const approvedPaths = new Set<string>()

function normalizeTarget(target: string): string {
  return path.resolve(target)
}

function isWithin(base: string, target: string): boolean {
  return target === base || target.startsWith(`${base}${path.sep}`)
}

function splitConfigList(value?: string | null): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
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
  pythonExe?: string | null
  pythonScript?: string | null
  pythonCwd?: string | null
  aiPromptPath?: string
  aiGlossaryPath?: string
  ttsOutputPath?: string
}): void {
  approvePath(config.folderPath)
  approvePaths(config.jsonPaths ?? [])
  approvePath(config.pythonExe)
  approvePath(config.pythonCwd)
  approvePath(config.aiPromptPath)
  approvePath(config.aiGlossaryPath)
  approvePath(config.ttsOutputPath)

  for (const scriptPath of splitConfigList(config.pythonScript)) {
    approvePath(scriptPath)
  }
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
