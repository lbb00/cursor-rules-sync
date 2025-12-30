import path from 'path'

import { LinkKind, Step } from '../types.js'
import { FS, nodeFS } from './fs.js'

export interface EnsureSourceSpec {
  sourceAbs: string
  kind: LinkKind
}

export interface EnsureLinkSpec {
  sourceAbs: string
  targetAbs: string
  kind: LinkKind
  atomic: boolean
}

export interface UnlinkSpec {
  targetAbs: string
}

export interface CopySpec {
  fromAbs: string
  toAbs: string
  kind: LinkKind
  atomic: boolean
}

function rand() {
  return Math.random().toString(16).slice(2)
}

export function tmpPathForTarget(targetAbs: string) {
  return `${targetAbs}.tmp.${rand()}`
}

export function backupPathForTarget(targetAbs: string) {
  return `${targetAbs}.bak.${Date.now()}.${rand()}`
}

export async function detectKind(p: string): Promise<LinkKind> {
  return detectKindWithFS(nodeFS, p)
}

export async function detectKindWithFS(fs: FS, p: string): Promise<LinkKind> {
  const st = await fs.lstat(p)
  if (st.isDirectory()) return 'dir'
  return 'file'
}

export async function isSymlinkTo(targetAbs: string, sourceAbs: string): Promise<boolean> {
  return isSymlinkToWithFS(nodeFS, targetAbs, sourceAbs)
}

export async function isSymlinkToWithFS(fs: FS, targetAbs: string, sourceAbs: string): Promise<boolean> {
  try {
    const st = await fs.lstat(targetAbs)
    if (!st.isSymbolicLink()) return false
    const link = await fs.readlink(targetAbs)
    const resolved = path.resolve(path.dirname(targetAbs), link)
    return path.normalize(resolved) === path.normalize(sourceAbs)
  } catch {
    return false
  }
}

export async function planEnsureSource(spec: EnsureSourceSpec): Promise<Step[]> {
  return planEnsureSourceWithFS(nodeFS, spec)
}

export async function planEnsureSourceWithFS(fs: FS, spec: EnsureSourceSpec): Promise<Step[]> {
  const steps: Step[] = []
  if (await fs.pathExists(spec.sourceAbs)) return steps

  steps.push({
    kind: 'mkdirp',
    message: `Ensure parent dir for source exists`,
    paths: { dir: path.dirname(spec.sourceAbs) },
  })

  if (spec.kind === 'dir') {
    steps.push({
      kind: 'mkdirp',
      message: `Create source directory`,
      paths: { dir: spec.sourceAbs },
    })
  } else {
    steps.push({
      kind: 'touch',
      message: `Create empty source file`,
      paths: { file: spec.sourceAbs },
    })
  }
  return steps
}

export async function planEnsureLink(spec: EnsureLinkSpec): Promise<{ steps: Step[]; reason: 'noop' | 'create' | 'replace_symlink' | 'conflict' }> {
  return planEnsureLinkWithFS(nodeFS, spec)
}

export async function planEnsureLinkWithFS(fs: FS, spec: EnsureLinkSpec): Promise<{ steps: Step[]; reason: 'noop' | 'create' | 'replace_symlink' | 'conflict' }> {
  const steps: Step[] = []

  if (await isSymlinkToWithFS(fs, spec.targetAbs, spec.sourceAbs)) {
    return { steps, reason: 'noop' }
  }

  const targetExists = await fs.pathExists(spec.targetAbs)
  if (targetExists) {
    const st = await fs.lstat(spec.targetAbs)
    if (!st.isSymbolicLink()) {
      return { steps, reason: 'conflict' }
    }

    steps.push({
      kind: 'unlink',
      message: 'Remove existing symlink before re-link',
      paths: { target: spec.targetAbs },
    })
  }

  steps.push({
    kind: 'mkdirp',
    message: 'Ensure target parent directory exists',
    paths: { dir: path.dirname(spec.targetAbs) },
  })

  const tmp = spec.atomic ? tmpPathForTarget(spec.targetAbs) : spec.targetAbs
  steps.push({
    kind: 'symlink',
    message: spec.atomic ? 'Create symlink at temp path' : 'Create symlink',
    paths: { source: spec.sourceAbs, target: tmp, kind: spec.kind },
  })

  if (spec.atomic) {
    steps.push({
      kind: 'move',
      message: 'Atomically move temp symlink into place',
      paths: { from: tmp, to: spec.targetAbs },
    })
  }

  return { steps, reason: targetExists ? 'replace_symlink' : 'create' }
}

export async function planUnlink(spec: UnlinkSpec): Promise<Step[]> {
  return planUnlinkWithFS(nodeFS, spec)
}

export async function planUnlinkWithFS(fs: FS, spec: UnlinkSpec): Promise<Step[]> {
  const steps: Step[] = []
  if (!await fs.pathExists(spec.targetAbs)) return steps
  const st = await fs.lstat(spec.targetAbs)
  if (!st.isSymbolicLink()) {
    steps.push({
      kind: 'noop',
      message: 'Target exists but is not a symlink; skipping unlink for safety',
      paths: { target: spec.targetAbs },
    })
    return steps
  }
  steps.push({
    kind: 'unlink',
    message: 'Remove target symlink',
    paths: { target: spec.targetAbs },
  })
  return steps
}

export async function planCopy(spec: CopySpec): Promise<Step[]> {
  const steps: Step[] = []
  steps.push({
    kind: 'mkdirp',
    message: 'Ensure destination parent directory exists',
    paths: { dir: path.dirname(spec.toAbs) },
  })

  const tmp = spec.atomic ? tmpPathForTarget(spec.toAbs) : spec.toAbs
  steps.push({
    kind: 'copy',
    message: spec.atomic ? 'Copy to temp destination' : 'Copy to destination',
    paths: { from: spec.fromAbs, to: tmp, kind: spec.kind },
  })

  if (spec.atomic) {
    steps.push({
      kind: 'move',
      message: 'Atomically move copied temp into place',
      paths: { from: tmp, to: spec.toAbs },
    })
  }

  return steps
}


