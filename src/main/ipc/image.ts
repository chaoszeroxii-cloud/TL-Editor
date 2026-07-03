// src/main/ipc/image.ts
//
// Image generation + reusable asset store for the visual-novel Episode Video
// feature. Backgrounds and transparent character art are generated via the
// bundled chatgpt-api bridge (primary provider) and cached under the novel
// folder's `.assets/` directory so the same art is reused across chapters.
//
// Character art is generated on a flat magenta backdrop, then chroma-keyed to a
// transparent PNG via a border flood-fill (ported from ai-rpg-studio's
// assetPipeline.removeBorderBackground). Style is steered toward manhwa / anime
// (webtoon) via a configurable style directive applied to every prompt.

import { ipcMain, net } from 'electron'
import { createHash } from 'crypto'
import { existsSync, promises as fs } from 'fs'
import path from 'path'
import { PNG } from 'pngjs'
import { assertPathAllowed } from './pathAccess'
import { loadConfig, loadApiKey } from './config'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AssetKind = 'background' | 'character'

export interface AssetRecord {
  id: string
  kind: AssetKind
  name: string
  subject: string
  file: string // relative to <novel>/.assets, forward-slashed
  provider: string
  model: string
  createdAt: number
  glossarySrc?: string
}

interface AssetManifest {
  version: 1
  assets: AssetRecord[]
}

interface GenerateOptions {
  novelDir: string
  kind: AssetKind
  subject: string
  name?: string
  glossarySrc?: string
  force?: boolean
}

const DEFAULT_STYLE =
  'Korean manhwa / anime-style digital illustration, clean line art, cel shading, vibrant colors, soft cinematic lighting, webtoon art'

// ─── Config ─────────────────────────────────────────────────────────────────

interface ImageConfig {
  provider: string
  apiUrl: string
  apiKey: string
  model: string
  style: string
}

async function imageConfig(): Promise<ImageConfig> {
  const cfg = loadConfig()
  const apiKey = (await loadApiKey('chatgpt-bridge-key')) ?? cfg.imageApiKey ?? 'local-dev-key'
  return {
    provider: cfg.imageProvider ?? 'chatgpt-api',
    apiUrl: (cfg.imageApiUrl ?? 'http://127.0.0.1:8765/v1').replace(/\/$/, ''),
    apiKey,
    model: cfg.imageModel ?? 'gpt-image-1',
    style: cfg.imageStyleDirective?.trim() || DEFAULT_STYLE
  }
}

// ─── Prompt building ──────────────────────────────────────────────────────────

function backgroundPrompt(style: string, subject: string): string {
  return [
    style + '.',
    'Wide cinematic background scene: ' + subject + '.',
    'Strong depth layers, atmospheric lighting, 16:9 aspect.',
    'No characters, no people, no text, no logo, no watermark, no frame.'
  ].join(' ')
}

function characterPrompt(style: string, subject: string): string {
  return [
    style + '.',
    'Full-body character illustration: ' + subject + '.',
    'Standing, front view, full body head to toe, centered.',
    'Do NOT use magenta, pink, hot pink, or purple anywhere on the character, clothing, hair, or props —',
    'those colors are reserved strictly for the background chroma key.',
    'The ENTIRE background is one solid flat pure magenta #FF00FF filling every edge —',
    'no scenery, no floor, no shadow, no gradient, no text, no logo, no frame.'
  ].join(' ')
}

// ─── Provider: chatgpt-api bridge ─────────────────────────────────────────────

interface GeneratedImage {
  bytes: Buffer
  ext: string
}

function extOf(p: string): string {
  const m = p.split('?')[0].match(/\.(png|jpe?g|webp)$/i)
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'png'
}

async function postImage(
  cfg: ImageConfig,
  route: string,
  body: Record<string, unknown>
): Promise<GeneratedImage> {
  const res = await net.fetch(cfg.apiUrl + route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const text = (await res.text()).slice(0, 600)
    throw new Error('Image bridge ' + res.status + ': ' + text)
  }
  const payload = (await res.json()) as {
    data?: Array<{ url?: string; download_url?: string; b64_json?: string; path?: string }>
  }
  const item = payload.data?.[0]
  if (!item) throw new Error('Image bridge returned no image')
  if (item.b64_json) return { bytes: Buffer.from(item.b64_json, 'base64'), ext: 'png' }
  // The sidecar wrote the file locally — read it directly (same machine).
  if (item.path && existsSync(item.path)) {
    return { bytes: await fs.readFile(item.path), ext: extOf(item.path) }
  }
  const ref = item.download_url ?? item.url
  if (!ref) throw new Error('Image bridge returned no usable image reference')
  const dl = await net.fetch(ref)
  if (!dl.ok) throw new Error('Image download failed: ' + dl.status)
  return { bytes: Buffer.from(await dl.arrayBuffer()), ext: extOf(ref) }
}

function generateViaBridge(cfg: ImageConfig, prompt: string): Promise<GeneratedImage> {
  return postImage(cfg, '/images/generations', { model: cfg.model, prompt, n: 1 })
}

// Image-to-image edit: sends the source image as a reference so the SAME
// character is preserved while applying the change (the bundled bridge was
// patched to return the assistant-generated result, not the uploaded input).
function editViaBridge(
  cfg: ImageConfig,
  prompt: string,
  sourcePath: string,
  aspect: string
): Promise<GeneratedImage> {
  return postImage(cfg, '/images/edits', {
    model: cfg.model,
    prompt,
    image: sourcePath,
    aspect_ratio: aspect,
    response_format: 'url'
  })
}

// ─── Transparent cutout (magenta chroma-key) ───────────────────────────────────

// The character is always rendered on a flat pure magenta (#FF00FF) backdrop, so
// the cutout keys on magenta DIRECTLY: any pixel where red AND blue clearly
// exceed green is background (bg + anti-aliased edge fringe + enclosed pockets).
// This never matches white/gray/skin/black, so a (often white) costume is safe
// even when it reaches the image border — unlike guessing the "border color",
// which ate white robes that touched the edge. A despill pass then neutralises
// the residual pink fringe on the kept edge pixels.
function makeTransparent(bytes: Buffer): Buffer {
  const image = PNG.sync.read(bytes)
  const { width, height, data } = image
  const count = width * height
  for (let i = 0; i < count; i += 1) {
    const o = i * 4
    const r = data[o] ?? 0
    const g = data[o + 1] ?? 0
    const b = data[o + 2] ?? 0
    if (r - g > 45 && b - g > 45 && r > 110 && b > 110) data[o + 3] = 0
  }
  for (let i = 0; i < count; i += 1) {
    const o = i * 4
    if (data[o + 3] === 0) continue
    const r = data[o] ?? 0
    const g = data[o + 1] ?? 0
    const b = data[o + 2] ?? 0
    if (r > g + 12 && b > g + 12 && Math.abs(r - b) < 60) {
      data[o] = Math.min(r, g + 8)
      data[o + 2] = Math.min(b, g + 8)
    }
  }
  return PNG.sync.write(image, { colorType: 6 })
}

// ─── Asset store ──────────────────────────────────────────────────────────────

function assetsDir(novelDir: string): string {
  return path.join(novelDir, '.assets')
}

async function readManifest(novelDir: string): Promise<AssetManifest> {
  const p = path.join(assetsDir(novelDir), 'manifest.json')
  if (!existsSync(p)) return { version: 1, assets: [] }
  try {
    const parsed = JSON.parse(await fs.readFile(p, 'utf-8')) as AssetManifest
    return { version: 1, assets: Array.isArray(parsed.assets) ? parsed.assets : [] }
  } catch {
    return { version: 1, assets: [] }
  }
}

async function writeManifest(novelDir: string, assets: AssetRecord[]): Promise<void> {
  const dir = assetsDir(novelDir)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ version: 1, assets }, null, 2),
    'utf-8'
  )
}

function withAbsPath(novelDir: string, record: AssetRecord): AssetRecord & { path: string } {
  return { ...record, path: path.join(assetsDir(novelDir), record.file) }
}

async function generateAsset(opts: GenerateOptions): Promise<AssetRecord & { path: string }> {
  const novelDir = assertPathAllowed(opts.novelDir)
  const cfg = await imageConfig()
  const subject = opts.subject.trim()
  if (!subject) throw new Error('Asset subject is empty')
  const prompt =
    opts.kind === 'character' ? characterPrompt(cfg.style, subject) : backgroundPrompt(cfg.style, subject)
  const id = createHash('sha256')
    .update([cfg.provider, cfg.model, cfg.style, opts.kind, subject].join('\n'))
    .digest('hex')
    .slice(0, 16)

  const manifest = await readManifest(novelDir)
  const existing = manifest.assets.find((a) => a.id === id)
  if (existing && !opts.force) {
    const abs = path.join(assetsDir(novelDir), existing.file)
    if (existsSync(abs)) return withAbsPath(novelDir, existing)
  }

  const generated = await generateViaBridge(cfg, prompt)
  let bytes = generated.bytes
  const ext = generated.ext
  if (opts.kind === 'character' && ext === 'png') bytes = makeTransparent(bytes)

  const rel = (opts.kind === 'character' ? 'characters' : 'backgrounds') + '/' + id + '.' + ext
  const abs = path.join(assetsDir(novelDir), rel)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, bytes)

  const record: AssetRecord = {
    id,
    kind: opts.kind,
    name: opts.name?.trim() || subject.slice(0, 40),
    subject,
    file: rel,
    provider: cfg.provider,
    model: cfg.model,
    createdAt: Date.now(),
    glossarySrc: opts.glossarySrc
  }
  await writeManifest(novelDir, [...manifest.assets.filter((a) => a.id !== id), record])
  return withAbsPath(novelDir, record)
}

async function editAsset(opts: {
  novelDir: string
  sourceId: string
  instruction: string
  name?: string
}): Promise<AssetRecord & { path: string }> {
  const novelDir = assertPathAllowed(opts.novelDir)
  const cfg = await imageConfig()
  const instruction = opts.instruction.trim()
  if (!instruction) throw new Error('Edit instruction is empty')
  const manifest = await readManifest(novelDir)
  const source = manifest.assets.find((a) => a.id === opts.sourceId)
  if (!source) throw new Error('Source asset not found')

  const kind = source.kind
  const sourcePath = path.join(assetsDir(novelDir), source.file)
  const aspect = kind === 'character' ? '3:4' : '16:9'

  // Fallback path: a fresh text→image generation (used if the source file is
  // gone, or if the bridge ever echoes the input back instead of editing).
  const regenerate = (): Promise<GeneratedImage> => {
    const baseSubject = source.subject.split(' / แก้:')[0]
    const subject = baseSubject + '. ' + instruction
    const prompt =
      kind === 'character' ? characterPrompt(cfg.style, subject) : backgroundPrompt(cfg.style, subject)
    return generateViaBridge(cfg, prompt)
  }

  let generated: GeneratedImage
  if (existsSync(sourcePath)) {
    // Image-to-image: keep the SAME character, apply only the requested change.
    const editPrompt = [
      cfg.style + '.',
      instruction + '.',
      'Keep the SAME character, face, hairstyle and proportions; change only what is requested.',
      kind === 'character'
        ? 'Put it on a flat solid pure magenta #FF00FF background; no magenta or pink on the character itself.'
        : 'No characters, no people, no text, no logo.'
    ].join(' ')
    generated = await editViaBridge(cfg, editPrompt, sourcePath, aspect)
    if (Buffer.compare(generated.bytes, await fs.readFile(sourcePath)) === 0) {
      generated = await regenerate() // bridge echoed the input → regenerate instead
    }
  } else {
    generated = await regenerate()
  }

  let bytes = generated.bytes
  const ext = generated.ext
  if (kind === 'character' && ext === 'png') bytes = makeTransparent(bytes)

  const id = createHash('sha256')
    .update([source.id, instruction, String(Date.now())].join('\n'))
    .digest('hex')
    .slice(0, 16)
  const rel = (kind === 'character' ? 'characters' : 'backgrounds') + '/' + id + '.' + ext
  const abs = path.join(assetsDir(novelDir), rel)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, bytes)

  const record: AssetRecord = {
    id,
    kind,
    name: opts.name?.trim() || source.name,
    subject: source.subject + ' / แก้: ' + instruction,
    file: rel,
    provider: cfg.provider,
    model: cfg.model,
    createdAt: Date.now(),
    glossarySrc: source.glossarySrc
  }
  await writeManifest(novelDir, [...manifest.assets, record])
  return withAbsPath(novelDir, record)
}

// ─── IPC ──────────────────────────────────────────────────────────────────────

export function registerImageHandlers(): void {
  ipcMain.handle('image:generate', async (_e, opts: GenerateOptions) => generateAsset(opts))

  ipcMain.handle(
    'image:edit',
    async (_e, opts: { novelDir: string; sourceId: string; instruction: string; name?: string }) =>
      editAsset(opts)
  )

  ipcMain.handle('image:list-assets', async (_e, novelDir: string) => {
    const dir = assertPathAllowed(novelDir)
    const manifest = await readManifest(dir)
    return manifest.assets.map((a) => withAbsPath(dir, a))
  })

  ipcMain.handle('image:delete-asset', async (_e, novelDir: string, id: string) => {
    const dir = assertPathAllowed(novelDir)
    const manifest = await readManifest(dir)
    const target = manifest.assets.find((a) => a.id === id)
    if (target) {
      await fs.rm(path.join(assetsDir(dir), target.file), { force: true }).catch(() => undefined)
    }
    await writeManifest(dir, manifest.assets.filter((a) => a.id !== id))
  })

  ipcMain.handle(
    'image:bind-character',
    async (_e, novelDir: string, id: string, glossarySrc: string) => {
      const dir = assertPathAllowed(novelDir)
      const manifest = await readManifest(dir)
      const assets = manifest.assets.map((a) =>
        a.id === id ? { ...a, glossarySrc: glossarySrc || undefined } : a
      )
      await writeManifest(dir, assets)
    }
  )
}
