# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**TL-Editor** is an Electron + React desktop application for translation management with AI translation (OpenRouter), TTS synthesis (Novel TTS API), glossary management, and audio production (MP3→MP4) capabilities.

## Commands

```bash
# Development
npm run dev              # Start Electron + Vite dev server with HMR

# Build
npm run build            # Typecheck + electron-vite build
npm run build:win        # Windows NSIS installer
npm run build:unpack     # Unpacked build for local testing
npm run start            # Preview built app

# Type checking (main and renderer run separately)
npm run typecheck        # Both main (node) and renderer (web)
npm run typecheck:node   # src/main/ only
npm run typecheck:web    # src/renderer/ only

# Testing
npm test                 # Run all Jest tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage (50% threshold)

# Quality
npm run lint             # ESLint with cache
npm run format           # Prettier write
```

## Architecture

The app follows the standard Electron 3-process model with strict security boundaries:

```
src/
├── main/           # Node.js process — never imports renderer code
│   ├── index.ts    # Window creation, audio:// protocol, CSP headers
│   └── ipc/        # All IPC handlers (config, fs, dialog, external, pathAccess)
├── preload/
│   └── index.ts    # contextBridge — exposes window.electron to renderer
└── renderer/src/   # React app — never uses Node APIs directly
    ├── App.tsx      # Layout shell, panel visibility, keyboard shortcuts
    ├── components/  # UI panels (DualView, Sidebar, GlossaryPanel, Terminal, etc.)
    ├── hooks/       # All state management (no Redux/Zustand)
    ├── types/       # Shared domain types
    └── utils/       # Pure functions (glossary parsing, TTS preprocessing, highlighting)
```

### IPC Bridge Pattern

All renderer→system communication goes through `window.electron` (defined in preload). New capabilities require changes in three places:
1. `src/main/ipc/` — add the handler
2. `src/preload/index.ts` — expose via `contextBridge.exposeInMainWorld`
3. `src/renderer/src/` — call `window.electron.<method>()`

### State Management

Custom hooks only — no external state library:
- `useAppStore` — root folder, file tree, panel toggles, AI/TTS config
- `useFileStore` — open file content (src/tgt), dirty tracking
- `useGlossaryStore` — glossary entries, auto-import from JSON tree
- `useStyleProfileStore` — tone profiles and correction capture

### Path Security

`src/main/ipc/pathAccess.ts` enforces a sandbox: only paths inside user-opened folders or known config dirs are accessible. All file-read IPC handlers call `assertPathAllowed()` before touching the filesystem.

### Audio Streaming

A custom `audio://local/<encoded-path>` protocol is registered in `src/main/index.ts`. It handles HTTP Range requests and enforces the path sandbox. The renderer's `AudioPlayer` component targets this protocol — never raw `file://` URLs.

### External API Integration (`src/main/ipc/external.ts`)

The largest module (~32 KB). Contains:
- **TTS** — Novel TTS API with streaming, progress IPC events, and keep-alive pings
- **AI Translation** — OpenRouter with multi-model support (Claude, Grok, etc.)
- **MP3→MP4** — FFmpeg wrapper using bundled binaries from `resources/tools/`
- **Abort controllers** — per-request cancellation tracking

### Configuration Storage

Config is persisted to `~/.config/translation-editor/config.json` (userData path). API keys are stored in the OS keychain via `keytar`. During development, `.env` is used as fallback.

## Testing

Tests live in `**/__tests__/**/*.test.ts(x)`. The Jest environment is `jsdom`; `src/setupTests.ts` mocks the entire `window.electron` API so renderer tests don't need Electron.

Run a single test file:
```bash
npx jest src/renderer/src/utils/__tests__/glossaryParsers.test.ts
```

## TypeScript

Two separate TS configs with different lib targets:
- `tsconfig.node.json` — main process (Node types, no DOM)
- `tsconfig.web.json` — renderer (DOM types, strict mode, `@renderer/*` alias)

The `@renderer/*` path alias resolves to `src/renderer/src/`.
