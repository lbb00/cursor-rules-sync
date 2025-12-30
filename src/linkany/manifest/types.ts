import path from 'path'
import fs from 'fs-extra'

export type ManifestVersion = 1
export type InstallKind = 'file' | 'dir'

export interface InstallEntry {
  id?: string
  source: string
  target: string
  kind?: InstallKind
  atomic?: boolean
}

/**
 * Users can add any extra fields.
 */
export interface Manifest {
  version: ManifestVersion
  installs: InstallEntry[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any
}

export interface ResolvedInstallEntry extends InstallEntry {
  sourceAbs: string
  targetAbs: string
  manifestKey: string
  atomic: boolean
}

export function getManifestBaseDir(manifestPath: string): string {
  return path.dirname(path.resolve(manifestPath))
}

export function resolveMaybeRelative(baseDir: string, p: string): string {
  if (!p) return p
  return path.isAbsolute(p) ? path.normalize(p) : path.normalize(path.resolve(baseDir, p))
}

export function getEntryKey(entry: InstallEntry): string {
  return entry.id || entry.target
}

export function resolveEntry(baseDir: string, entry: InstallEntry): ResolvedInstallEntry {
  const sourceAbs = resolveMaybeRelative(baseDir, entry.source)
  const targetAbs = resolveMaybeRelative(baseDir, entry.target)
  return {
    ...entry,
    sourceAbs,
    targetAbs,
    manifestKey: getEntryKey(entry),
    atomic: entry.atomic ?? true,
  }
}

export function normalizeManifest(raw: unknown): Manifest {
  const obj = (raw ?? {}) as Record<string, unknown>
  const version = obj.version
  const installs = obj.installs

  if (version !== 1) {
    throw new Error(`Unsupported manifest version: ${String(version)} (expected 1)`)
  }
  if (!Array.isArray(installs)) {
    throw new Error('Invalid manifest: "installs" must be an array')
  }

  return { ...(obj as any), version: 1, installs: installs as any }
}

export async function loadManifest(manifestPath: string): Promise<Manifest> {
  const abs = path.resolve(manifestPath)
  if (!await fs.pathExists(abs)) {
    throw new Error(`Manifest not found: ${abs}`)
  }
  const json = await fs.readJson(abs)
  return normalizeManifest(json)
}


