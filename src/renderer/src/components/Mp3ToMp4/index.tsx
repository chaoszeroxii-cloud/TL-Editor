import { useState, useCallback, useEffect } from 'react'
import type { JSX } from 'react'
import {
  IcoAlert,
  IcoCheck,
  IcoFolderOpen,
  IcoImage,
  IcoMusic,
  IcoSpinner,
  IcoVideo,
  IcoX
} from '../common/icons'

interface Mp3ToMp4Props {
  onClose?: () => void
}

export function Mp3ToMp4({ onClose }: Mp3ToMp4Props): JSX.Element {
  const [imagePath, setImagePath] = useState<string>('')
  const [audioPaths, setAudioPaths] = useState<string[]>([])
  const [outputDir, setOutputDir] = useState<string>('')
  const [converting, setConverting] = useState(false)
  const [results, setResults] = useState<{ outputs: string[]; errors: string[] } | null>(null)
  const [isDraggingOverImage, setIsDraggingOverImage] = useState(false)
  const [isDraggingOverAudio, setIsDraggingOverAudio] = useState(false)
  const [imagePreviewSrc, setImagePreviewSrc] = useState('')

  useEffect(() => {
    let canceled = false

    if (!imagePath) {
      setImagePreviewSrc('')
      return
    }

    window.electron
      .readImageDataUrl(imagePath)
      .then((src) => {
        if (!canceled) setImagePreviewSrc(src)
      })
      .catch(() => {
        if (!canceled) setImagePreviewSrc('')
      })

    return () => {
      canceled = true
    }
  }, [imagePath])

  const resolveDroppedFiles = useCallback(async (dataTransfer: DataTransfer): Promise<File[]> => {
    const files = Array.from(dataTransfer.files ?? [])
    const resolvedPaths = files
      .map((file) => window.electron.getPathForFile(file))
      .filter((path): path is string => Boolean(path))

    if (resolvedPaths.length > 0) {
      await window.electron.approvePaths(resolvedPaths)
    }

    return files
  }, [])

  const browseImage = useCallback(async () => {
    const p = await window.electron.openFile([
      { name: 'Image', extensions: ['jpg', 'jpeg', 'png'] }
    ])
    if (p) setImagePath(p)
  }, [])

  const browseAudio = useCallback(async () => {
    const files = await window.electron.openFile([{ name: 'MP3 Audio', extensions: ['mp3'] }])
    if (files) {
      // openFile returns single path; if multiple needed, use openDialog manually
      setAudioPaths((prev) => [...prev, files])
    }
  }, [])

  // Drag handlers for image
  const handleImageDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOverImage(true)
  }, [])

  const handleImageDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOverImage(false)
  }, [])

  const handleImageDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDraggingOverImage(false)

      const files = await resolveDroppedFiles(e.dataTransfer)
      for (const file of files) {
        if (!/\.(jpg|jpeg|png)$/i.test(file.name)) continue
        const path = window.electron.getPathForFile(file)
        if (!path) continue
        setImagePath(path)
        break
      }
    },
    [resolveDroppedFiles]
  )

  // Drag handlers for audio
  const handleAudioDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOverAudio(true)
  }, [])

  const handleAudioDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOverAudio(false)
  }, [])

  const handleAudioDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDraggingOverAudio(false)

      const files = await resolveDroppedFiles(e.dataTransfer)
      const paths: string[] = []
      for (const file of files) {
        if (!/\.mp3$/i.test(file.name)) continue
        const path = window.electron.getPathForFile(file)
        if (path) paths.push(path)
      }
      if (paths.length > 0) {
        setAudioPaths((prev) => [...prev, ...paths])
      }
    },
    [resolveDroppedFiles]
  )

  const browseOutputDir = useCallback(async () => {
    const p = await window.electron.openFolder()
    if (p) setOutputDir(p)
  }, [])

  const removeAudio = useCallback((idx: number) => {
    setAudioPaths((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const convert = useCallback(async () => {
    if (!imagePath || audioPaths.length === 0) return
    setConverting(true)
    setResults(null)
    try {
      const res = await window.electron.convertMp3ToMp4({
        imagePath,
        audioPaths,
        outputDir: outputDir || undefined
      })
      setResults(res)
    } catch (err: unknown) {
      setResults({ outputs: [], errors: [(err as Error).message] })
    } finally {
      setConverting(false)
    }
  }, [imagePath, audioPaths, outputDir])

  const canConvert = imagePath && audioPaths.length > 0 && !converting

  return (
    <div style={s.backdrop} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <h3 style={s.title}>
            <IcoMusic size={16} stroke="currentColor" />
            <span>MP3 → MP4 Converter</span>
          </h3>
          {onClose && (
            <button style={s.closeBtn} onClick={onClose} title="Close">
              <IcoX size={14} stroke="currentColor" />
            </button>
          )}
        </div>

        {/* Cover Image */}
        <div style={s.section}>
          <label style={s.label}>Cover Image</label>
          <div
            style={{
              ...s.dropZone,
              ...(isDraggingOverImage ? s.dropZoneActive : {}),
              ...(imagePath ? s.dropZoneCompact : {})
            }}
            onDragOver={handleImageDragOver}
            onDragLeave={handleImageDragLeave}
            onDrop={handleImageDrop}
            onClick={browseImage}
          >
            {imagePath ? (
              <div style={s.previewBox}>
                {imagePreviewSrc ? (
                  <img src={imagePreviewSrc} style={s.previewImg} alt="cover preview" />
                ) : (
                  <div style={s.previewFallback}>
                    <IcoImage size={32} stroke="currentColor" />
                    <span>Loading preview…</span>
                  </div>
                )}
              </div>
            ) : (
              <div style={s.dropZoneContent}>
                <span style={s.dropIcon}>
                  <IcoImage size={32} stroke="currentColor" />
                </span>
                <span style={s.dropText}>Drop image here or click to browse</span>
                <span style={s.dropHint}>.jpg, .jpeg, .png</span>
              </div>
            )}
          </div>
          {imagePath && (
            <div style={s.row}>
              <span style={s.path}>{imagePath.split(/[\\/]/).pop()}</span>
              <button style={s.changeBtn} onClick={browseImage}>
                Change…
              </button>
            </div>
          )}
        </div>

        {/* Audio Files */}
        <div style={s.section}>
          <label style={s.label}>MP3 Files</label>
          <div
            style={{
              ...s.dropZone,
              ...s.audioDropZone,
              ...(isDraggingOverAudio ? s.dropZoneActive : {})
            }}
            onDragOver={handleAudioDragOver}
            onDragLeave={handleAudioDragLeave}
            onDrop={handleAudioDrop}
            onClick={browseAudio}
          >
            <div style={s.dropZoneContent}>
              <span style={s.dropIcon}>
                <IcoMusic size={32} stroke="currentColor" />
              </span>
              <span style={s.dropText}>
                {audioPaths.length > 0
                  ? `Drop more MP3 files or click to add`
                  : 'Drop MP3 files here or click to browse'}
              </span>
              <span style={s.dropHint}>.mp3</span>
            </div>
          </div>
          {audioPaths.length > 0 && (
            <div style={s.list}>
              {audioPaths.map((p, i) => (
                <div key={i} style={s.listItem}>
                  <span style={s.listItemName}>{p ? p.split(/[\\\/]/).pop() : 'Unknown file'}</span>
                  <button style={s.removeBtn} onClick={() => removeAudio(i)}>
                    <IcoX size={12} stroke="currentColor" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Output Directory */}
        <div style={s.section}>
          <label style={s.label}>Output Folder</label>
          <div style={s.row}>
            <button style={s.browseBtn} onClick={browseOutputDir}>
              <IcoFolderOpen size={14} stroke="currentColor" />
              {outputDir ? 'Change…' : 'Select…'}
            </button>
            {outputDir && <span style={s.path}>{outputDir.split(/[\\/]/).pop()}</span>}
          </div>
          {outputDir && <div style={s.pathFull}>{outputDir}</div>}
          <div style={s.hint}>If not selected, you`&apos;`ll be asked for each file.</div>
        </div>

        {/* Convert Button */}
        <button
          style={{
            ...s.convertBtn,
            ...(!canConvert ? s.convertBtnDisabled : {})
          }}
          disabled={!canConvert}
          onClick={convert}
        >
          {converting ? (
            <>
              <IcoSpinner size={14} stroke="currentColor" />
              Converting…
            </>
          ) : (
            <>
              <IcoVideo size={14} stroke="currentColor" />
              Convert to MP4
            </>
          )}
        </button>

        {/* Results */}
        {results && (
          <div style={s.results}>
            {results.outputs.length > 0 && (
              <div style={s.success}>
                <div style={s.resultHeader}>
                  <IcoCheck size={14} stroke="currentColor" />
                  <span>Created {results.outputs.length} file(s):</span>
                </div>
                <ul style={s.resultList}>
                  {results.outputs.map((p, i) => (
                    <li key={i}>{p ? p.split(/[\\\/]/).pop() : 'Unknown file'}</li>
                  ))}
                </ul>
              </div>
            )}
            {results.errors.length > 0 && (
              <div style={s.errors}>
                <div style={s.resultHeader}>
                  <IcoAlert size={14} stroke="currentColor" />
                  <span>Errors:</span>
                </div>
                <ul style={s.resultList}>
                  {results.errors.map((e, i) => (
                    <li key={i} style={{ color: '#f87171' }}>
                      {e}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modal: {
    background: 'var(--bg1)',
    borderRadius: 12,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    maxWidth: 540,
    width: '90%',
    maxHeight: '85vh',
    overflow: 'auto',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
    color: 'var(--text1)'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  title: {
    margin: 0,
    fontSize: 16,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 4,
    borderRadius: 4,
    color: 'var(--text2)',
    display: 'flex',
    alignItems: 'center'
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6
  },
  label: {
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--text2)',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  browseBtn: {
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '6px 12px',
    cursor: 'pointer',
    color: 'var(--text1)',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    gap: 6
  },
  path: {
    fontSize: 13,
    color: 'var(--text2)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 300
  },
  previewBox: {
    marginTop: 8,
    width: 160,
    height: 160,
    borderRadius: 6,
    overflow: 'hidden',
    border: '1px solid var(--border)',
    background: 'var(--bg2)'
  },
  previewImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  previewFallback: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    color: 'var(--text3)',
    fontSize: 12
  },
  list: {
    marginTop: 6,
    display: 'flex',
    flexDirection: 'column',
    gap: 4
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'var(--bg2)',
    padding: '4px 8px',
    borderRadius: 4,
    fontSize: 13
  },
  listItemName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  removeBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 2,
    borderRadius: 4,
    color: 'var(--text2)',
    display: 'flex'
  },
  pathFull: {
    fontSize: 11,
    color: 'var(--text3)',
    wordBreak: 'break-all'
  },
  hint: {
    fontSize: 11,
    color: 'var(--text3)'
  },
  dropZone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'var(--border)',
    borderRadius: 8,
    padding: 20,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    backgroundColor: 'var(--bg2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100
  },
  dropZoneActive: {
    borderColor: 'var(--accent)',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    transform: 'scale(1.02)'
  },
  dropZoneCompact: {
    padding: 8,
    minHeight: 'auto'
  },
  dropZoneContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    color: 'var(--text2)'
  },
  dropIcon: {
    opacity: 0.7,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  dropText: {
    fontSize: 13,
    fontWeight: 500
  },
  dropHint: {
    fontSize: 11,
    color: 'var(--text3)'
  },
  audioDropZone: {
    minHeight: 80
  },
  changeBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '2px 6px',
    fontSize: 12,
    color: 'var(--accent)',
    textDecoration: 'underline'
  },
  convertBtn: {
    marginTop: 8,
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '10px 16px',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  convertBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed'
  },
  results: {
    marginTop: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8
  },
  success: {
    backgroundColor: 'rgba(74,222,128,0.1)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(74,222,128,0.3)',
    borderRadius: 6,
    padding: 10,
    fontSize: 13,
    display: 'flex',
    flexDirection: 'column',
    gap: 6
  },
  errors: {
    backgroundColor: 'rgba(248,113,113,0.1)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(248,113,113,0.3)',
    borderRadius: 6,
    padding: 10,
    fontSize: 13,
    display: 'flex',
    flexDirection: 'column',
    gap: 6
  },
  resultHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6
  },
  resultList: {
    margin: '4px 0 0 0',
    paddingLeft: 20,
    fontSize: 12
  }
}
