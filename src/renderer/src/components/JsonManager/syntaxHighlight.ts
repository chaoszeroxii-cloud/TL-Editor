// ── JSON syntax highlighter ───────────────────────────────────────────────────
// Tokenises in one pass. Every character is inside a colored <span>.
// Guide spans get data-d (depth) and data-l (line index) attributes
// so updateGuides can highlight them without using offsetTop.

function _esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function highlightJson(code: string): string {
  const KEY = '#9cdcfe'
  const STR = '#ce9178'
  const NUM = '#b5cea8'
  const KW = '#569cd6'
  const PUNCT = 'rgba(150,160,180,0.5)'
  const TEXT = 'var(--text0)'
  const GUIDE = 'rgba(80,90,110,0.4)'

  function indentGuides(spaces: string, lineNum: number): string {
    let out = ''
    for (let i = 0; i < spaces.length; i += 2) {
      const chunk = spaces.slice(i, i + 2)
      const depth = i / 2
      if (chunk.length === 2) {
        out += `<span data-d="${depth}" data-l="${lineNum}" style="display:inline-block;width:2ch;border-left:1px solid ${GUIDE};box-sizing:border-box">${_esc(chunk)}</span>`
      } else {
        out += _esc(chunk)
      }
    }
    return out
  }

  const RE =
    /("(?:[^"\\]|\\.)*")(\s*:)|("(?:[^"\\]|\\.)*")|([-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|(true|false|null)|([{}[\],:])|(\n)|( +)|([^\S\n]+)|([^\s"{}[\],:]+)/g

  let out = ''
  let lineStart = true
  let lineNum = 0
  let m: RegExpExecArray | null
  RE.lastIndex = 0

  while ((m = RE.exec(code)) !== null) {
    if (m[1] !== undefined) {
      lineStart = false
      out += `<span style="color:${KEY}">${_esc(m[1])}</span><span style="color:${PUNCT}">${_esc(m[2])}</span>`
    } else if (m[3] !== undefined) {
      lineStart = false
      out += `<span style="color:${STR}">${_esc(m[3])}</span>`
    } else if (m[4] !== undefined) {
      lineStart = false
      out += `<span style="color:${NUM}">${_esc(m[4])}</span>`
    } else if (m[5] !== undefined) {
      lineStart = false
      out += `<span style="color:${KW}">${_esc(m[5])}</span>`
    } else if (m[6] !== undefined) {
      lineStart = false
      out += `<span style="color:${PUNCT}">${_esc(m[6])}</span>`
    } else if (m[7] !== undefined) {
      out += '\n'
      lineNum++
      lineStart = true
    } else if (m[8] !== undefined) {
      out += lineStart ? indentGuides(m[8], lineNum) : _esc(m[8])
      lineStart = false
    } else if (m[9] !== undefined) {
      out += _esc(m[9])
      lineStart = false
    } else {
      lineStart = false
      out += `<span style="color:${TEXT}">${_esc(m[0])}</span>`
    }
  }
  return out + '\n'
}

// ── Escape regex special chars ────────────────────────────────────────────────
export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ── Line helpers ──────────────────────────────────────────────────────────────

export function getLineAt(
  text: string,
  cursor: number
): { lineIdx: number; lineStart: number; lineOffset: number; lines: string[] } {
  const lines = text.split('\n')
  const before = text.slice(0, cursor)
  const lineIdx = before.split('\n').length - 1
  const lineStart = before.lastIndexOf('\n') + 1
  const lineOffset = cursor - lineStart
  return { lineIdx, lineStart, lineOffset, lines }
}

export function lineStartPos(lines: string[], lineIdx: number): number {
  let pos = 0
  for (let i = 0; i < lineIdx; i++) pos += lines[i].length + 1
  return pos
}
