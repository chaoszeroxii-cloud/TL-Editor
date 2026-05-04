import { memo, useRef, useCallback, JSX } from 'react'
import type { GlossaryEntry } from '../../types'
import { Row, ROW_H } from './Row'
import type { FindRange } from './findHighlight'
import type { ToneName, VoiceGender } from '../../constants/tones'

export interface VRowPairProps {
  rowIndex: number
  rowNum: number
  tgtText: string
  srcText: string
  glossary: GlossaryEntry[]
  isActive: boolean
  onMouseEnter: (i: number) => void
  isEditing: boolean
  editingCol: 'tgt' | 'src'
  focusAtStart: boolean
  pendingCursor: number | null
  onStartEdit: (i: number, col: 'tgt' | 'src') => void
  onStopEdit: (i: number | null) => void
  onCommit: (i: number, v: string) => void
  onSrcCommit: (i: number, v: string) => void
  onUndo: () => void
  onRedo: () => void
  onSrcUndo: () => void
  onSrcRedo: () => void
  onEnterPressed: (i: number, b: string, a: string) => void
  onSrcEnterPressed: (i: number, b: string, a: string) => void
  onMultiLinePaste: (i: number, lines: string[]) => void
  onSrcMultiLinePaste: (i: number, lines: string[]) => void
  onBackspaceAtStart: (i: number, text: string) => void
  onSrcBackspaceAtStart: (i: number, text: string) => void
  onNavUp: (rowIdx: number, col: number) => void
  onNavDown: (rowIdx: number, col: number) => void
  onNavLeft: (rowIdx: number) => void
  onNavRight: (rowIdx: number) => void
  navCol: number | null
  navDir: 'up' | 'down' | null
  tgtFindRanges?: FindRange[]
  srcFindRanges?: FindRange[]
  activeMatchIdx?: number
  splitPos?: number
  tone?: ToneName
  onToneChange?: (rowIdx: number, tone: ToneName) => void
  voiceGender?: VoiceGender
  onVoiceGenderChange?: (rowIdx: number, gender: VoiceGender) => void
}

export const VRowPair = memo(function VRowPair({
  rowIndex,
  rowNum,
  tgtText,
  srcText,
  glossary,
  isActive,
  onMouseEnter,
  isEditing,
  editingCol,
  focusAtStart,
  pendingCursor,
  onStartEdit,
  onStopEdit,
  onCommit,
  onSrcCommit,
  onUndo,
  onRedo,
  onSrcUndo,
  onSrcRedo,
  onEnterPressed,
  onSrcEnterPressed,
  onMultiLinePaste,
  onSrcMultiLinePaste,
  onBackspaceAtStart,
  onSrcBackspaceAtStart,
  onNavUp,
  onNavDown,
  onNavLeft,
  onNavRight,
  navCol,
  navDir,
  tgtFindRanges,
  srcFindRanges,
  activeMatchIdx,
  splitPos = 50,
  tone = 'normal',
  onToneChange,
  voiceGender = 'female',
  onVoiceGenderChange
}: VRowPairProps): JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null)

  const enter = useCallback(() => onMouseEnter(rowIndex), [onMouseEnter, rowIndex])
  const startTgt = useCallback(() => onStartEdit(rowIndex, 'tgt'), [onStartEdit, rowIndex])
  const startSrc = useCallback(() => onStartEdit(rowIndex, 'src'), [onStartEdit, rowIndex])
  const stop = useCallback(() => onStopEdit(null), [onStopEdit])
  const commit = useCallback((v: string) => onCommit(rowIndex, v), [onCommit, rowIndex])
  const srcCommit = useCallback((v: string) => onSrcCommit(rowIndex, v), [onSrcCommit, rowIndex])
  const entered = useCallback(
    (b: string, a: string) => onEnterPressed(rowIndex, b, a),
    [onEnterPressed, rowIndex]
  )
  const srcEntered = useCallback(
    (b: string, a: string) => onSrcEnterPressed(rowIndex, b, a),
    [onSrcEnterPressed, rowIndex]
  )
  const pasted = useCallback(
    (lines: string[]) => onMultiLinePaste(rowIndex, lines),
    [onMultiLinePaste, rowIndex]
  )
  const srcPasted = useCallback(
    (lines: string[]) => onSrcMultiLinePaste(rowIndex, lines),
    [onSrcMultiLinePaste, rowIndex]
  )
  const backspaced = useCallback(
    (t: string) => onBackspaceAtStart(rowIndex, t),
    [onBackspaceAtStart, rowIndex]
  )
  const srcBackspaced = useCallback(
    (t: string) => onSrcBackspaceAtStart(rowIndex, t),
    [onSrcBackspaceAtStart, rowIndex]
  )
  const navUp = useCallback((col: number) => onNavUp(rowIndex, col), [onNavUp, rowIndex])
  const navDown = useCallback((col: number) => onNavDown(rowIndex, col), [onNavDown, rowIndex])
  const navLeft = useCallback(() => onNavLeft(rowIndex), [onNavLeft, rowIndex])
  const navRight = useCallback(() => onNavRight(rowIndex), [onNavRight, rowIndex])
  const toneChanged = useCallback(
    (nextTone: ToneName) => onToneChange?.(rowIndex, nextTone),
    [onToneChange, rowIndex]
  )
  const voiceGenderChanged = useCallback(
    (gender: VoiceGender) => onVoiceGenderChange?.(rowIndex, gender),
    [onVoiceGenderChange, rowIndex]
  )

  const isTgtEditing = isEditing && editingCol === 'tgt'
  const isSrcEditing = isEditing && editingCol === 'src'

  const cellStyle = { minWidth: 0, borderRight: '1px solid var(--border)' }

  return (
    <div
      ref={wrapRef}
      data-row-index={rowIndex}
      data-row={rowIndex}
      style={{ display: 'flex', minHeight: ROW_H, borderBottom: '1px solid rgba(46,51,64,0.5)' }}
    >
      <div style={{ ...cellStyle, flex: `0 0 ${splitPos}%` }}>
        <Row
          rowNum={rowNum}
          text={tgtText}
          glossary={glossary}
          isActive={isActive}
          onMouseEnter={enter}
          editable
          isEditing={isTgtEditing}
          focusAtStart={isTgtEditing && focusAtStart}
          pendingCursor={isTgtEditing ? pendingCursor : null}
          onStartEdit={startTgt}
          onStopEdit={stop}
          onCommit={commit}
          onUndo={onUndo}
          onRedo={onRedo}
          onEnterPressed={entered}
          onMultiLinePaste={pasted}
          onBackspaceAtStart={backspaced}
          onNavUp={navUp}
          onNavDown={navDown}
          onNavLeft={navLeft}
          onNavRight={navRight}
          navCol={isTgtEditing ? navCol : null}
          navDir={isTgtEditing ? navDir : null}
          findRanges={tgtFindRanges}
          activeMatchIdx={activeMatchIdx}
          tone={tone}
          onToneChange={toneChanged}
          voiceGender={voiceGender}
          onVoiceGenderChange={voiceGenderChanged}
        />
      </div>

      <div style={{ width: 4, background: 'transparent', flexShrink: 0 }} />

      <div style={{ ...cellStyle, flex: 1 }}>
        <Row
          rowNum={rowNum}
          text={srcText}
          glossary={glossary}
          isActive={isActive}
          onMouseEnter={enter}
          editable
          isEditing={isSrcEditing}
          focusAtStart={isSrcEditing && focusAtStart}
          pendingCursor={isSrcEditing ? pendingCursor : null}
          onStartEdit={startSrc}
          onStopEdit={stop}
          onCommit={srcCommit}
          onUndo={onSrcUndo}
          onRedo={onSrcRedo}
          onEnterPressed={srcEntered}
          onMultiLinePaste={srcPasted}
          onBackspaceAtStart={srcBackspaced}
          onNavUp={navUp}
          onNavDown={navDown}
          onNavLeft={navLeft}
          onNavRight={navRight}
          navCol={isSrcEditing ? navCol : null}
          navDir={isSrcEditing ? navDir : null}
          findRanges={srcFindRanges}
          activeMatchIdx={activeMatchIdx}
          isSrc
        />
      </div>
    </div>
  )
})
