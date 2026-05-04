# TL/EDITOR — Renderer Source Structure

## Complete File Tree

```
src/
├── main/
│   ├── index.ts                          ← createWindow, app events
│   └── ipc/
│       ├── fs.ts                         ← readFile, writeFile, readTree, readGlossary
│       ├── dialog.ts                     ← openFolder, openFile, saveDialog
│       ├── config.ts                     ← getEnvConfig, saveConfig, detectPython
│       ├── shell.ts                      ← runCommand, killProcess, runPython
│       └── external.ts                   ← translate, openrouterChat, tts
│
├── renderer/
│   ├── main.tsx                          ← entry point (StrictMode + createRoot)
│   ├── App.tsx                           ← layout shell only (~150 lines)
│   │
│   ├── types/
│   │   └── index.ts                      ← TreeNode, GlossaryEntry, GlossaryFileFormat,
│   │                                        OpenGlossaryFile, AITranslateConfig, EnvConfig,
│   │                                        Window.electron declaration
│   │
│   ├── store/
│   │   ├── useFileStore.ts               ← tgtPath/srcPath, content, dirty, undo/redo, rename
│   │   ├── useGlossaryStore.ts           ← glossary[], sourceFilePaths, formats, AI entries
│   │   └── useAppStore.ts               ← rootDir, tree, panel open/close, aiConfig
│   │
│   ├── hooks/                            ★ NEW
│   │   ├── index.ts                      ← barrel re-exports
│   │   ├── useKeyboardShortcuts.ts       ← Ctrl+S/Z/Y/B/G/R/J/C all in one place
│   │   └── useChapterPairing.ts          ← findTranslationPair, flattenFiles, extractChapterNum
│   │
│   ├── utils/
│   │   ├── highlight.ts                  ← tokenize, countMatches, HL_COLORS
│   │   ├── glossaryParsers.ts            ← parseGlossaryFile, serialize*, hasNestedPaths
│   │   └── pathHelpers.ts               ← extractChapterNum, flattenFiles, collectJsonFiles
│   │
│   └── components/
│       ├── Sidebar/
│       │   ├── index.tsx                 ← Sidebar shell + DnD context provider
│       │   ├── NodeItem.tsx              ← file/folder row with rename
│       │   └── useDragDrop.ts           ← DnD logic (mousedown → mousemove → drop)
│       │
│       ├── DualView/
│       │   ├── index.tsx                 ← layout + Find state + row orchestration
│       │   ├── Row.tsx                   ← single editable row (textarea + render)
│       │   ├── VRowPair.tsx              ← tgt + src pair
│       │   ├── FindBar.tsx               ← find & replace UI (DualView variant)
│       │   ├── ContextMenu.tsx           ← right-click translate/TTS/glossary menu
│       │   ├── TranslatePopup.tsx        ← Google translate floating popup
│       │   └── findHighlight.ts         ← buildRenderSegs, FindMatch, FindRange, FindSeg
│       │
│       ├── GlossaryPanel/
│       │   ├── exports.ts               ← barrel
│       │   ├── CascadingPathSelect.tsx   ★ NEW — cascading <select> for nested paths
│       │   ├── index.tsx                 ← panel shell (search, tabs, file filter)
│       │   ├── EntryRow.tsx              ← single entry display/inline-edit
│       │   ├── EntryForm.tsx             ← add/edit form (uses CascadingPathSelect)
│       │   ├── DrillView.tsx             ← tree drill-down navigation
│       │   ├── Dropdowns.tsx            ← ExportDropdown + FileFilterDropdown
│       │   └── (ExportDropdown.tsx)      ← (can also be split from Dropdowns.tsx)
│       │
│       ├── GlossaryEditor/              ★ NEW folder
│       │   ├── exports.ts               ← barrel
│       │   └── index.tsx                ★ NEW — modal table editor UI
│       │
│       ├── AITranslatePanel/            ★ NEW folder
│       │   ├── exports.ts               ← barrel
│       │   ├── extractNewEntries.ts     ★ NEW — parse New_Entry JSON block from AI response
│       │   ├── NewEntryReview.tsx       ★ NEW — pending entries review/select UI
│       │   └── index.tsx                ★ NEW — panel shell (config + translate + review)
│       │
│       ├── Terminal/                    ★ NEW folder
│       │   ├── exports.ts               ← barrel
│       │   ├── OutputView.tsx           ★ NEW — stdout/stderr line renderer
│       │   ├── ScriptPathInput.tsx      ★ NEW — path input + pinned/history dropdown
│       │   ├── PythonTab.tsx            ★ NEW — full python runner UI (~300 lines)
│       │   └── index.tsx                ★ NEW — panel shell (resize, tabs, terminal input)
│       │
│       ├── AudioPlayer/                 ★ NEW folder
│       │   ├── exports.ts               ← barrel
│       │   ├── VolSlider.tsx            ★ NEW — draggable volume slider
│       │   └── index.tsx                ★ UPDATED — imports VolSlider
│       │
│       ├── common/                      ★ NEW folder
│       │   ├── exports.ts               ← barrel
│       │   ├── Tooltip.tsx              ★ MOVED — showTooltip, hideTooltip, Tooltip
│       │   ├── FindBar.tsx              ★ NEW — shared FindBar for editor search flows
│       │   └── icons.tsx                ← all SVG icons (IcoFolder, IcoFile, …)
│       │
│       └── setup/                       ★ NEW folder
│           ├── exports.ts               ← barrel
│           └── SetupWizard.tsx          ★ MOVED — 3-step first-run wizard
```

---

## Import Patterns

### Hooks

```ts
import { useKeyboardShortcuts, useAutoImport, findTranslationPair } from '../hooks'
// or directly:
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
```

### GlossaryEditor

```ts
import { GlossaryEditor } from './components/GlossaryEditor'
import { parseGlossaryFile, serializeByFormat } from './components/GlossaryEditor/parsers'
```

### AITranslatePanel

```ts
import { AITranslatePanel } from './components/AITranslatePanel'
import type { AITranslateConfig } from './components/AITranslatePanel'
// subcomponents available if needed:
import { extractNewEntries } from './components/AITranslatePanel/extractNewEntries'
import { NewEntryReview } from './components/AITranslatePanel/NewEntryReview'
```

### Terminal

```ts
import { TerminalPanel } from './components/Terminal'
// subcomponents:
import { OutputView } from './components/Terminal/OutputView'
import type { OutputLine } from './components/Terminal/OutputView'
```

### AudioPlayer

```ts
import { AudioPlayer } from './components/AudioPlayer'
import { VolSlider } from './components/AudioPlayer/VolSlider'
```

### Common

```ts
import { Tooltip, showTooltip, hideTooltip } from './components/common/Tooltip'
import { FindBar } from './components/common/FindBar'
import type { FindBarProps } from './components/common/FindBar'
```

### GlossaryPanel helpers

```ts
import { CascadingPathSelect, buildPathTree } from './components/GlossaryPanel/CascadingPathSelect'
import type { PathTree } from './components/GlossaryPanel/CascadingPathSelect'
```

### Setup

```ts
import { SetupWizard } from './components/setup/SetupWizard'
import type { SetupConfig } from './components/setup/SetupWizard'
```

---

## What Changed vs Original

| Original File                  | Split Into                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `AITranslatePanel.tsx`         | `AITranslatePanel/index.tsx` + `extractNewEntries.ts` + `NewEntryReview.tsx`      |
| `AudioPlayer.tsx`              | `AudioPlayer/index.tsx` + `VolSlider.tsx`                                         |
| `GlossaryEditor.tsx`           | `GlossaryEditor/index.tsx` + `parsers.ts`                                         |
| `GlossaryPanel.tsx`            | unchanged + `GlossaryPanel/CascadingPathSelect.tsx` extracted                     |
| `TerminalPanel.tsx`            | `Terminal/index.tsx` + `OutputView.tsx` + `ScriptPathInput.tsx` + `PythonTab.tsx` |
| `Tooltip.tsx`                  | `common/Tooltip.tsx` (moved, imports fixed)                                       |
| `SetupWizard.tsx`              | `setup/SetupWizard.tsx` (moved)                                                   |
| _(App.tsx keyboard handlers)_  | `hooks/useKeyboardShortcuts.ts`                                                   |
| _(App.tsx file pairing logic)_ | `hooks/useChapterPairing.ts`                                                      |
| _(App.tsx JSON auto-import)_   | `hooks/useAutoImport.ts`                                                          |
| _(new shared component)_       | `common/FindBar.tsx` (used by editor search flows)                                |

---
