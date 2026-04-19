# 🔍 PR Checklist: Code Review Fixes

**This checklist tracks the implementation of all fixes identified in CODE_REVIEW.md**

---

## 📋 PHASE 1: BLOCKING ISSUES (Critical)

Must be fixed before release. Estimated effort: **3-4 hours**

### [ ] BUG-001: Fix TypeScript Compilation Error (JsonRawEditorModal.tsx:869)

**File:** `src/renderer/src/components/JsonManager/JsonRawEditorModal.tsx`

**Change:**

```diff
  const newEndPos =
    newStartPos +
    newLines
-     .slice(endLineIdx + 1, endLineIdx + 1 + duplicated.length)
-     .join('\n').length
+     .slice(endLineIdx + 1, endLineIdx + 1 + duplicated.length)
+     .join('\n').length
```

**Verification:**

- [ ] TypeScript compilation passes (`npm run typecheck`)
- [ ] Build succeeds (`npm run build`)
- [ ] No new errors in IDE
- [ ] Prettier formatting accepted

**Notes:** Remove line break before `.join()` to fix ambiguous AST parsing.

---

### [ ] BUG-002: Fix TypeScript Configuration Deprecation Warning

**File:** `tsconfig.web.json`

**Change:**

```diff
  {
    "compilerOptions": {
      "baseUrl": ".",
      "paths": { "@renderer": ["src"] },
+     "ignoreDeprecations": "6.0"
    }
  }
```

**Verification:**

- [ ] `npm run typecheck` completes without deprecation warnings
- [ ] No TS 6.0 compatibility warnings in future
- [ ] Path resolution still works (`@renderer` alias resolves correctly)

**Alternative approach:**

- [ ] Migrated to modern `compilerOptions` (without `baseUrl`)

---

### [ ] SEC-001: Move API Keys to OS Keychain

**Files affected:**

- `src/main/ipc/config.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/setup/SetupWizard.tsx`

**Installation:**

```bash
npm install keytar
```

**Changes required:**

#### Step 1: Update config handler

- [ ] Create helper functions: `saveApiKey()`, `loadApiKey()`
- [ ] Remove plaintext API key from config.json persistence
- [ ] Add fallback for new installs (load from config if exists, migrate to keychain)

**Code to add in `src/main/ipc/config.ts`:**

```typescript
import keytar from 'keytar'

const SERVICE_NAME = 'translation-editor'

export async function saveApiKey(account: string, key: string): Promise<void> {
  try {
    await keytar.setPassword(SERVICE_NAME, account, key)
  } catch (err) {
    console.error(`Failed to save API key to keychain: ${err}`)
    // Fallback: save to config (not ideal, but app remains usable)
  }
}

export async function loadApiKey(account: string): Promise<string | null> {
  try {
    return await keytar.getPassword(SERVICE_NAME, account)
  } catch (err) {
    console.error(`Failed to load API key from keychain: ${err}`)
    return null
  }
}
```

#### Step 2: Update config save handler

- [ ] Intercept `aiApiKey` and `ttsApiKey` saves
- [ ] Call `saveApiKey()` instead of saving to file
- [ ] Remove from JSON serialization

**Code change in IPC handler:**

```typescript
ipcMain.handle('save-config', async (_e, cfg: AppConfig) => {
  approveConfigPaths(cfg)

  // Save API keys to keychain
  if (cfg.aiApiKey) {
    await saveApiKey('openrouter-key', cfg.aiApiKey)
  }
  if (cfg.ttsApiKey) {
    await saveApiKey('novel-tts-key', cfg.ttsApiKey)
  }

  // Remove from config before saving to file
  const { aiApiKey, ttsApiKey, ...safeCfg } = cfg
  fs.writeFileSync(getConfigPath(), JSON.stringify(safeCfg, null, 2), 'utf-8')
})
```

#### Step 3: Update config load handler

- [ ] Load API keys from keychain on startup
- [ ] Add fallback migration (load from old config if exists)

**Code change in IPC handler:**

```typescript
ipcMain.handle('get-env-config', async () => {
  const cfg = loadConfig()
  approveConfigPaths(cfg)

  // Load API keys from keychain
  const aiApiKey = (await loadApiKey('openrouter-key')) ?? cfg.aiApiKey ?? ''
  const ttsApiKey = (await loadApiKey('novel-tts-key')) ?? cfg.ttsApiKey ?? ''

  return {
    // ... existing fields
    aiApiKey,
    ttsApiKey
    // ... rest
  }
})
```

#### Step 4: Update SetupWizard

- [ ] When user enters API keys, they're saved to keychain (not shown in UI after)
- [ ] Display "✓ Saved to system keychain" confirmation instead of storing in state

**Verification:**

- [ ] `npm install keytar` succeeds
- [ ] Config file no longer contains API keys (verify by opening `config.json`)
- [ ] API keys load correctly on app startup
- [ ] Setup wizard saves keys to keychain
- [ ] App works after uninstall/reinstall (keychain is persistent)
- [ ] Test on Windows/macOS (use appropriate keychain system)

**Testing on Windows:**

- [ ] Open Credential Manager (`Win+R` → `credential manager`)
- [ ] Verify keys appear under "Generic Credentials"

**Testing on macOS:**

- [ ] Open Keychain Access
- [ ] Verify keys appear under "Local Items"

---

### [ ] SEC-002: Implement Command Whitelist for `run-command`

**File:** `src/main/ipc/shell.ts`

**Changes:**

#### Step 1: Define allowed commands

```typescript
// Add at top of file
const ALLOWED_COMMANDS = new Set([
  'node',
  'npm',
  'python',
  'python3',
  'bash',
  'sh'
  // Add only commands needed for your use case
])
```

#### Step 2: Update `run-command` handler

```typescript
ipcMain.handle('run-command', (_e, cmd: string, cwd?: string) => {
  // Extract command name (first token)
  const cmdName = cmd.split(/\s+/)[0]
  const cmdBaseName = path.basename(cmdName)

  if (!ALLOWED_COMMANDS.has(cmdBaseName)) {
    throw new Error(
      `Command '${cmdBaseName}' is not allowed. ` +
        `Allowed commands: ${Array.from(ALLOWED_COMMANDS).join(', ')}`
    )
  }

  const approvedCwd = cwd ? assertPathAllowed(cwd) : undefined
  const proc = spawn(cmd, [], { cwd: approvedCwd, shell: true, timeout: 30 * 60_000 })
  // ... rest of handler
})
```

**Alternative approach (safer - no shell):**

```typescript
ipcMain.handle('run-command', (_e, executable: string, args: string[], cwd?: string) => {
  // Change signature to accept array of args instead of full command string
  const exeName = path.basename(executable)

  if (!ALLOWED_COMMANDS.has(exeName)) {
    throw new Error(`Command '${exeName}' is not allowed`)
  }

  const approvedCwd = cwd ? assertPathAllowed(cwd) : undefined
  const proc = spawn(executable, args, {
    cwd: approvedCwd,
    shell: false, // ✅ Disable shell (no injection possible)
    timeout: 30 * 60_000
  })
  // ... rest of handler
})
```

**If using safer approach, update preload:**

```typescript
// src/preload/index.ts
const runCommand = (executable: string, args: string[], cwd?: string) =>
  ipcRenderer.invoke('run-command', executable, args, cwd)
```

**Verification:**

- [ ] `npm run build` succeeds
- [ ] Terminal panel still works (allows Python, Node commands)
- [ ] Attempting to run disallowed command shows error message
- [ ] Error message lists allowed commands
- [ ] No shell metacharacters can bypass whitelist

**Manual testing:**

```javascript
// In renderer console (DevTools):
await window.electron.runCommand('whoami') // ❌ Should fail
await window.electron.runCommand('python') // ✅ Should work
await window.electron.runCommand('rm -rf /') // ❌ Should fail
```

---

### [ ] PERF-001: Add React Error Boundaries

**File:** `src/renderer/src/components/ErrorBoundary.tsx` (create new)

**Step 1: Create ErrorBoundary component**

```typescript
// src/renderer/src/components/ErrorBoundary.tsx
import React, { ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  name?: string
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(
      `Error in ${this.props.name || 'component'}:`,
      error,
      errorInfo.componentStack
    )
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div style={{
            padding: '20px',
            margin: '10px',
            background: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '12px'
          }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#856404' }}>
              ⚠️ {this.props.name || 'Component'} Error
            </h3>
            <details style={{ marginBottom: '10px' }}>
              <summary style={{ cursor: 'pointer' }}>Error details</summary>
              <pre style={{
                margin: '10px 0 0 0',
                padding: '10px',
                background: '#f5f5f5',
                overflow: 'auto',
                maxHeight: '200px'
              }}>
                {this.state.error?.message}
                {'\n\n'}
                {this.state.error?.stack}
              </pre>
            </details>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '6px 12px',
                background: '#ffc107',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Reload Application
            </button>
          </div>
        )
      )
    }

    return this.props.children
  }
}
```

**Step 2: Wrap components in App.tsx**

- [ ] Wrap DualView in ErrorBoundary
- [ ] Wrap GlossaryPanel in ErrorBoundary
- [ ] Wrap TerminalPanel in ErrorBoundary
- [ ] Wrap AITranslatePanel in ErrorBoundary
- [ ] Wrap entire app in outer ErrorBoundary (fallback for catastrophic errors)

**Example in App.tsx:**

```typescript
<ErrorBoundary name="App">
  <div style={{ display: 'flex', height: '100vh' }}>
    <Sidebar {...sidebarProps} />

    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <ErrorBoundary name="DualView">
        <DualView {...dualViewProps} />
      </ErrorBoundary>

      <div style={{ display: 'flex', gap: '10px' }}>
        <ErrorBoundary name="GlossaryPanel">
          {showGlossary && <GlossaryPanel {...glossaryProps} />}
        </ErrorBoundary>

        <ErrorBoundary name="Terminal">
          {showTerminal && <TerminalPanel {...terminalProps} />}
        </ErrorBoundary>
      </div>
    </div>
  </div>
</ErrorBoundary>
```

**Verification:**

- [ ] App compiles (ErrorBoundary component is valid TypeScript)
- [ ] No console errors on startup
- [ ] When component throws error, ErrorBoundary catches it
- [ ] User sees "⚠️ Component Error" with reload button instead of blank screen
- [ ] Reload button works (reloads app)
- [ ] Other panels remain functional when one crashes

**Manual testing:**

```typescript
// Temporarily add in component to test:
if (Math.random() < 0.1) throw new Error('Test error')
// Then trigger component render → should see error boundary UI
```

---

## 📋 PHASE 2: CRITICAL ISSUES (High Priority)

Implement within 1-2 sprints. Estimated effort: **6-8 hours**

### [ ] BUG-003: Add Timeout & Cancellation to Google Translate

**File:** `src/main/ipc/external.ts`

**Changes:**

Replace the `translate` handler with timeout + request tracking:

```typescript
ipcMain.handle('translate', async (_e, text: string) => {
  const requestId = generateRequestId()
  const url = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=auto&tl=th&dt=t&q=${encodeURIComponent(text)}`

  return new Promise<{ requestId: string; data: string }>((resolve, reject) => {
    const timeout = 15_000 // 15 second timeout

    const timeoutHandle = setTimeout(() => {
      const record = activeRequests.get(requestId)
      if (record) record.req.abort()
      removeActiveRequest(requestId)
      reject(new Error('Google Translate request timed out after 15s'))
    }, timeout)

    const req = net.request(url)
    let body = ''

    req.on('response', (res) => {
      res.on('data', (chunk) => {
        body += chunk.toString()
      })
      res.on('end', () => {
        removeActiveRequest(requestId)
        clearTimeout(timeoutHandle)
        try {
          resolve({ requestId, data: JSON.stringify(JSON.parse(body)) })
        } catch {
          reject(new Error('translate: parse error'))
        }
      })
    })

    req.on('error', (err) => {
      removeActiveRequest(requestId)
      clearTimeout(timeoutHandle)
      reject(err)
    })

    req.on('abort', () => {
      removeActiveRequest(requestId)
      clearTimeout(timeoutHandle)
      reject(new Error('Google Translate request cancelled'))
    })

    // Track this request for cancellation
    activeRequests.set(requestId, { req, timeoutHandle })
    req.end()
  })
})
```

**Verification:**

- [ ] `npm run build` succeeds
- [ ] Translate requests complete within 15 seconds
- [ ] If network is blocked, error shown instead of hanging (test with firewall)
- [ ] Renderer can cancel translate requests via `cancelNetworkRequest(requestId)`
- [ ] Return type includes `requestId` for tracking

---

### [ ] SEC-003: Parameterize Glossary Parser Keys

**File:** `src/renderer/src/utils/glossaryParsers.ts`

**Changes:**

Add configuration interface and update parsing logic:

```typescript
// Add interface at top
export interface GlossaryParseConfig {
  callKey?: string // Default: 'Called'
  detailKey?: string // Default: 'รายละเอียด'
  firstAppKey?: string // Default: 'First Appearance'
}

// Update function signatures
export function parseNestedJson(
  raw: Record<string, unknown>,
  config?: GlossaryParseConfig
): GlossaryEntry[] {
  const cfg = {
    callKey: 'Called',
    detailKey: 'รายละเอียด',
    firstAppKey: 'First Appearance',
    ...config
  }

  const result: GlossaryEntry[] = []
  for (const [key, value] of Object.entries(raw)) {
    parseNestedNode(key, value, [], result, cfg)
  }
  return result
}

function parseNestedNode(
  key: string,
  value: unknown,
  path: string[],
  result: GlossaryEntry[],
  config: Required<GlossaryParseConfig>
): void {
  // Update hardcoded key checks to use config
  if (config.callKey in obj || 'called' in obj) {
    const calledRaw = obj[config.callKey] ?? obj['called']
    // ... rest of logic
  }
  // ...
}
```

**Verification:**

- [ ] Default behavior unchanged (still supports Thai keys)
- [ ] Can parse with different key names by passing config
- [ ] All existing tests pass
- [ ] Documentation updated to show config parameter

---

### [ ] SEC-004: Secure Python Script Temp File Handling

**File:** `src/main/ipc/shell.ts`

**Changes:**

Update `run-python` handler to use secure temp file:

```typescript
ipcMain.handle('run-python', async (_e, code: string, cwd?: string) => {
  const os = await import('os')
  const { writeFile: wf, unlink, chmod } = await import('fs/promises')
  const { join: pjoin } = await import('path')
  const crypto = await import('crypto')

  // Generate secure temp filename
  const randomId = crypto.randomBytes(8).toString('hex')
  const tmpFile = pjoin(os.tmpdir(), `tl_editor_run_${randomId}.py`)

  try {
    // Write with restrictive permissions (owner read/write only)
    await wf(tmpFile, code, 'utf-8')

    // Set permissions to 0600 (read/write for owner only)
    if (process.platform !== 'win32') {
      await chmod(tmpFile, 0o600)
    }

    const pyExe = process.platform === 'win32' ? 'python' : 'python3'
    // ... rest of execution logic
  } finally {
    // Securely delete temp file
    try {
      // Overwrite with random data before deleting
      const stat = await fs.promises.stat(tmpFile)
      const randomData = crypto.randomBytes(stat.size)
      const fd = await fs.promises.open(tmpFile, 'r+')
      await fs.promises.write(fd, randomData)
      await fd.close()
    } catch {
      // Ignore if file already deleted
    }

    await unlink(tmpFile).catch(() => {})
  }
})
```

**Verification:**

- [ ] Temp files created with secure permissions
- [ ] On non-Windows, permissions are 0600 (verified via `ls -la /tmp`)
- [ ] Temp files overwritten before deletion
- [ ] Python scripts execute correctly
- [ ] Cleanup works even if execution fails

---

### [ ] BUG-004: Fix File Store Undo/Redo Stale Closure

**File:** `src/renderer/src/store/useFileStore.ts`

**Changes:**

Update `handleTgtChange` to use state callback:

```typescript
const handleTgtChange = useCallback(
  (content: string) => {
    setTgtContent((prevContent) => {
      // Only add to undo if content actually changed
      if (prevContent !== content) {
        const last = tgtUndoStack.current[tgtUndoStack.current.length - 1]
        // Avoid duplicate undo entries
        if (last !== prevContent) {
          tgtUndoStack.current.push(prevContent)
          if (tgtUndoStack.current.length > UNDO_LIMIT) {
            tgtUndoStack.current.shift()
          }
        }
      }
      // Clear redo on new edit
      tgtRedoStack.current = []
      setIsDirty(true)

      return content
    })
  },
  [] // No external dependencies
)
```

Also update `handleSrcChange` identically.

**Verification:**

- [ ] Rapid edits don't skip undo entries
- [ ] Paste of large text preserves undo history
- [ ] Undo/Redo sequence is correct
- [ ] Unit tests added for undo/redo logic

---

### [ ] MAINT-001: Enable TypeScript Strict Mode

**File:** `tsconfig.json`

**Changes:**

```diff
  {
    "compilerOptions": {
      "strict": true,
+     "noImplicitAny": true,
+     "strictNullChecks": true,
+     "strictFunctionTypes": true,
+     "strictBindCallApply": true,
+     "strictPropertyInitialization": true,
+     "noImplicitThis": true,
+     "alwaysStrict": true,
      // ... existing options
    }
  }
```

**Verification:**

- [ ] Run `npm run typecheck`
- [ ] All errors fixed (use `as any` sparingly with comments explaining why)
- [ ] No remaining implicit `any` types
- [ ] All null/undefined cases handled
- [ ] Build succeeds

---

### [ ] MAINT-002: Add Error Logging to IPC Handlers

**File:** `src/main/ipc/external.ts`

**Changes:**

Add error logging wrapper:

```typescript
function logError(context: string, error: Error, details?: Record<string, any>): void {
  console.error(`[${context}]`, error.message, details)

  // Optional: Send to error tracking service (e.g., Sentry)
  // if (process.env.SENTRY_DSN) {
  //   Sentry.captureException(error, { tags: { context }, extra: details })
  // }
}

// In handlers:
try {
  // ... request logic
  resolve({ requestId, data })
} catch (err) {
  const error = err instanceof Error ? err : new Error(String(err))
  logError('openrouter-chat', error, { requestId, model })
  reject(error)
}
```

**Verification:**

- [ ] Errors logged to console with context
- [ ] Each IPC handler includes try/catch
- [ ] No silent failures
- [ ] Helpful error messages for debugging

---

## 📋 PHASE 3: NICE-TO-HAVE (Backlog)

Implementation optional. Estimated effort: **12-16 hours**

### [ ] PERF-002: Optimize Glossary Parser (O(n²) → O(n))

**File:** `src/renderer/src/utils/glossaryParsers.ts`

**Changes:** Use path mutation instead of spreading:

```typescript
function parseNestedJson(raw: Record<string, unknown>): GlossaryEntry[] {
  const result: GlossaryEntry[] = []
  const path: string[] = [] // Reuse array, don't copy

  function parseNode(key: string, value: unknown) {
    // Mutate path (no spread)
    path.push(key)
    parseNestedNode(key, value, [...path], result) // Still pass copy for safety
    path.pop() // Backtrack
  }

  for (const [key, value] of Object.entries(raw)) {
    parseNode(key, value)
  }

  return result
}
```

**Verification:**

- [ ] Large glossaries (10k+ entries) parse in < 50ms (was 100-500ms)
- [ ] Memory usage reduced
- [ ] Parse results identical to original implementation

---

### [ ] PERF-003: Convert Synchronous File Writes to Async

**File:** `src/main/ipc/config.ts`, `src/main/ipc/fs.ts`

**Changes:**

```typescript
// Before:
fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf-8')

// After:
await fs.promises.writeFile(configPath, JSON.stringify(cfg, null, 2), 'utf-8')
```

**Verification:**

- [ ] Large file saves don't block UI
- [ ] All handlers are async
- [ ] No TypeScript errors

---

### [ ] MAINT-004: Add Unit Tests

**File:** Create `src/**/__tests__/**/*.test.ts`

**Minimal test suite:**

```bash
npm install --save-dev jest @testing-library/react @testing-library/jest-dom ts-jest
```

**Test files to add:**

- [ ] `src/renderer/src/utils/__tests__/glossaryParsers.test.ts` (5-10 tests)
- [ ] `src/renderer/src/store/__tests__/useFileStore.test.ts` (undo/redo tests)
- [ ] `src/renderer/src/utils/__tests__/highlight.test.ts` (find/highlight tests)

**Verification:**

- [ ] `npm test` passes all tests
- [ ] Coverage > 70% for core logic
- [ ] Tests document expected behavior

---

### [ ] SEC-005: Use CSP Nonces in Production

**File:** `src/main/index.ts`

**Changes:**

```typescript
function setupHeaders(isDev: boolean): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    let csp: string

    if (isDev) {
      csp =
        "default-src 'self'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'"
    } else {
      const nonce = crypto.randomBytes(16).toString('hex')
      csp = `default-src 'self'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'`
    }

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })
}
```

**Verification:**

- [ ] Dev mode still uses unsafe-inline (Vite HMR works)
- [ ] Production mode uses nonce-based CSP (stricter)
- [ ] No inline scripts/styles execute without nonce
- [ ] Security scanner (e.g., OWASP ZAP) gives good CSP score

---

## ✅ TESTING CHECKLIST

Run these tests before merging:

### Unit Tests

- [ ] `npm run typecheck` — No TypeScript errors
- [ ] `npm test` — All tests pass (if added)
- [ ] `npm run lint` — No linting errors

### Build & Runtime

- [ ] `npm run build` — Build succeeds
- [ ] `npm run dev` — Dev server starts without errors
- [ ] Open DevTools — No console errors on startup

### Functional Testing

- [ ] Load file → Edit → Save (basic workflow works)
- [ ] Undo/Redo — Multiple edits undo correctly
- [ ] Glossary import — No parse errors on valid/invalid files
- [ ] Terminal panel — Python script execution works
- [ ] AI panel — Translate requests timeout properly (if blocked)
- [ ] File tree — No errors when deleting files externally

### Security Testing

- [ ] API keys not in config file (check with text editor)
- [ ] API keys stored in system keychain (Windows Credential Manager / macOS Keychain)
- [ ] Terminal doesn't allow arbitrary commands (`rm -rf /` fails)
- [ ] Python script temp files have 0600 permissions (non-Windows)

### Error Handling

- [ ] Component error → Boundary catches it (doesn't crash app)
- [ ] Invalid glossary JSON → Error message shown
- [ ] Network timeout → User sees timeout error (not hanging)
- [ ] Missing file → Graceful error (no crash)

---

## 📝 PR DESCRIPTION TEMPLATE

```markdown
## Description

This PR implements fixes identified in the code review (CODE_REVIEW.md).

## Changes

### Phase 1: Blocking Issues

- [x] BUG-001: Fix JsonRawEditorModal compilation error
- [x] BUG-002: Fix TypeScript deprecation warning
- [x] SEC-001: Move API keys to OS Keychain
- [x] SEC-002: Add command whitelist for shell execution
- [x] PERF-001: Add React Error Boundaries

### Phase 2: Critical Issues (Optional)

- [ ] BUG-003: Add timeout to Google Translate
- [ ] SEC-003: Parameterize glossary parser
- [ ] SEC-004: Secure Python temp files
- [ ] BUG-004: Fix undo/redo stale closure
- [ ] MAINT-001: Enable TypeScript strict mode
- [ ] MAINT-002: Add error logging

## Testing

- [x] `npm run typecheck` — Passes
- [x] `npm run build` — Succeeds
- [x] `npm run dev` — No errors
- [x] Manual testing of critical workflows

## Security

- [x] API keys no longer in plaintext
- [x] Shell command injection risk mitigated
- [x] Error boundaries prevent app crashes
- [x] Python temp files use restricted permissions

## Deployment Notes

- Requires Node.js version: `>=18.0.0`
- New dependency: `keytar` (for secure credential storage)
- No database migrations needed
- Config.json format unchanged (backward compatible)

## Related Issues

Closes #XXX (link to issue if applicable)
```

---

## 🚀 DEPLOYMENT CHECKLIST

Before releasing to production:

- [ ] All Phase 1 fixes implemented
- [ ] `npm run build` produces no warnings
- [ ] Signed/notarized installer created (if distributing)
- [ ] Test on Windows / macOS / Linux (as applicable)
- [ ] API keys verified in system keychain (not in config.json)
- [ ] Error boundaries tested (intentionally crash component)
- [ ] Release notes updated (mention security improvements)
- [ ] Users notified of API key re-entry (if upgrading existing installs)

---

## 📞 Questions?

For implementation questions, refer to CODE_REVIEW.md for detailed explanations and code examples.

---

**Last updated:** April 16, 2026  
**Revision:** 1.0  
**Status:** Ready for implementation
