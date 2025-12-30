import fs from 'fs-extra'
import path from 'path'
import { LinkKind } from '../types.js'

export async function ensureParentDir(p: string) {
  await fs.ensureDir(path.dirname(p))
}

export async function createEmptyFile(p: string) {
  await ensureParentDir(p)
  await fs.ensureFile(p)
}

export async function createDir(p: string) {
  await fs.ensureDir(p)
}

/**
 * Create a symlink at target pointing to source.
 * On macOS/Linux we do not fallback to copy. If symlink fails, it throws.
 */
export async function createSymlink(sourceAbs: string, targetAbs: string, kind: LinkKind) {
  await ensureParentDir(targetAbs)
  const rel = path.relative(path.dirname(targetAbs), sourceAbs) || '.'
  await fs.symlink(rel, targetAbs, kind === 'dir' ? 'dir' : 'file')
}

export async function removePath(p: string) {
  await fs.remove(p)
}

/**
 * Remove only if it's a symlink. Throws if it exists but isn't a symlink.
 */
export async function removeSymlink(p: string) {
  const st = await fs.lstat(p)
  if (!st.isSymbolicLink()) {
    throw new Error(`Refusing to remove non-symlink: ${p}`)
  }
  await fs.unlink(p)
}

export async function renameAtomic(from: string, to: string) {
  await fs.rename(from, to)
}

export async function copyPath(from: string, to: string) {
  await ensureParentDir(to)
  await fs.copy(from, to, { dereference: true })
}


