import fs from 'fs-extra'
import path from 'path'
import { InstallEntry, Manifest, ManifestVersion, normalizeManifest } from './types.js'

function defaultManifest(): Manifest {
  return {
    version: 1 as ManifestVersion,
    installs: [],
  }
}

export async function loadOrCreateManifest(manifestPath: string): Promise<Manifest> {
  const abs = path.resolve(manifestPath)
  if (!await fs.pathExists(abs)) {
    return defaultManifest()
  }
  const json = await fs.readJson(abs)
  return normalizeManifest(json)
}

export interface SaveManifestOptions {
  spaces?: number
}

export async function saveManifest(manifestPath: string, manifest: Manifest, opts: SaveManifestOptions = {}) {
  const abs = path.resolve(manifestPath)
  await fs.ensureDir(path.dirname(abs))
  const spaces = opts.spaces ?? 2
  const content = JSON.stringify(manifest, null, spaces) + '\n'
  const tmp = `${abs}.tmp.${Date.now()}.${Math.random().toString(16).slice(2)}`
  await fs.writeFile(tmp, content, 'utf8')
  await fs.rename(tmp, abs)
}

export interface UpsertEntryResult {
  updated: boolean
  created: boolean
  key: string
}

function keyOf(entry: InstallEntry): string {
  return entry.id || entry.target
}

export function upsertEntry(manifest: Manifest, entry: InstallEntry): UpsertEntryResult {
  const key = keyOf(entry)
  if (!key) throw new Error('Entry must have "target" (or "id")')

  const installs = manifest.installs ?? (manifest.installs = [])
  const idx = installs.findIndex(e => keyOf(e) === key)

  if (idx >= 0) {
    installs[idx] = { ...installs[idx], ...entry }
    return { updated: true, created: false, key }
  }

  installs.push(entry)
  return { updated: false, created: true, key }
}

export interface RemoveEntryResult {
  removed: boolean
  key: string
}

export function removeEntry(manifest: Manifest, key: string): RemoveEntryResult {
  if (!key) throw new Error('removeEntry requires a key')
  const installs = manifest.installs ?? (manifest.installs = [])
  const idx = installs.findIndex(e => keyOf(e) === key || e.target === key)
  if (idx < 0) return { removed: false, key }
  installs.splice(idx, 1)
  return { removed: true, key }
}


