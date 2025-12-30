import fs from 'fs-extra'
import path from 'path'

import { applyPlan } from '../core/apply.js'
import { tryAppendAuditStep } from '../core/audit.js'
import { backupPathForTarget, detectKind, isSymlinkTo, planCopy, planEnsureSource, planUnlink, tmpPathForTarget } from '../core/plan.js'
import { getManifestBaseDir } from '../manifest/types.js'
import { loadOrCreateManifest, saveManifest, upsertEntry } from '../manifest/io.js'
import { CommonOptions, LinkKind, Result, Step } from '../types.js'

export interface Mapping {
  source: string
  target: string
  kind?: LinkKind
  atomic?: boolean
}

function mkLogger(opts?: CommonOptions) {
  return opts?.logger
}

function mkResult(operation: Result['operation'], manifestPath: string): Result {
  const now = new Date()
  return {
    ok: true,
    operation,
    manifestPath,
    startedAt: now.toISOString(),
    finishedAt: now.toISOString(),
    durationMs: 0,
    steps: [],
    warnings: [],
    errors: [],
    changes: [],
  }
}

function linkSteps(sourceAbs: string, targetAbs: string, kind: LinkKind, atomic: boolean): Step[] {
  const steps: Step[] = []
  steps.push({ kind: 'mkdirp', message: 'Ensure target parent directory exists', paths: { dir: path.dirname(targetAbs) } })
  const tmp = atomic ? tmpPathForTarget(targetAbs) : targetAbs
  steps.push({ kind: 'symlink', message: atomic ? 'Create symlink at temp path' : 'Create symlink', paths: { source: sourceAbs, target: tmp, kind } })
  if (atomic) {
    steps.push({ kind: 'move', message: 'Atomically move temp symlink into place', paths: { from: tmp, to: targetAbs } })
  }
  return steps
}

/**
 * add: write manifest + converge target to symlink(source).
 *
 * Safety rules:
 * - If source and target both exist AND target is not already a symlink to source => reject.
 * - If target exists and is not a symlink AND source is missing => migrate:
 *   copy(target -> source), move original target aside to backup, then link target -> source.
 * - If symlink creation fails => error (no copy fallback).
 */
export async function add(manifestPath: string, mapping: Mapping, opts?: CommonOptions): Promise<Result> {
  const started = Date.now()
  const logger = mkLogger(opts)
  const baseDir = getManifestBaseDir(manifestPath)

  const sourceAbs = path.isAbsolute(mapping.source) ? mapping.source : path.resolve(baseDir, mapping.source)
  const targetAbs = path.isAbsolute(mapping.target) ? mapping.target : path.resolve(baseDir, mapping.target)

  const sourceExists = await fs.pathExists(sourceAbs)
  const targetExists = await fs.pathExists(targetAbs)

  if (await isSymlinkTo(targetAbs, sourceAbs)) {
    const manifest = await loadOrCreateManifest(manifestPath)
    upsertEntry(manifest, { source: mapping.source, target: mapping.target, kind: mapping.kind as any, atomic: mapping.atomic })
    await saveManifest(manifestPath, manifest)
    let res = mkResult('add', manifestPath)
    res.steps.push({ kind: 'write_manifest', message: 'Update manifest', status: 'executed', paths: { file: path.resolve(manifestPath) } })
    res.changes.push({ action: 'manifest_upsert', source: sourceAbs, target: targetAbs })
    res.durationMs = Date.now() - started
    res = await tryAppendAuditStep(res, manifestPath, opts)
    return res
  }

  if (sourceExists && targetExists) {
    let res = mkResult('add', manifestPath)
    res.ok = false
    res.errors.push(`Refusing to proceed: source and target both exist: source=${sourceAbs} target=${targetAbs}`)
    res.steps.push({ kind: 'noop', message: 'Safety refusal', status: 'failed', error: res.errors[0] })
    res.durationMs = Date.now() - started
    res = await tryAppendAuditStep(res, manifestPath, opts)
    return res
  }

  let kind: LinkKind = mapping.kind ?? 'file'
  if (targetExists) {
    const st = await fs.lstat(targetAbs)
    if (st.isSymbolicLink()) {
      let res = mkResult('add', manifestPath)
      res.ok = false
      res.errors.push(`Refusing to migrate: target is an existing symlink: ${targetAbs}`)
      res.steps.push({ kind: 'noop', message: 'Safety refusal', status: 'failed', error: res.errors[0] })
      res.durationMs = Date.now() - started
      res = await tryAppendAuditStep(res, manifestPath, opts)
      return res
    }
    kind = st.isDirectory() ? 'dir' : 'file'
  } else if (sourceExists) {
    kind = await detectKind(sourceAbs)
  }

  const atomic = mapping.atomic ?? true
  const steps: Step[] = []

  if (!sourceExists && targetExists) {
    steps.push(...await planCopy({ fromAbs: targetAbs, toAbs: sourceAbs, kind, atomic }))
    const backupAbs = backupPathForTarget(targetAbs)
    steps.push({ kind: 'move', message: 'Move original target aside to backup before linking', paths: { from: targetAbs, to: backupAbs } })
    steps.push(...linkSteps(sourceAbs, targetAbs, kind, atomic))
  } else {
    steps.push(...await planEnsureSource({ sourceAbs, kind }))
    if (targetExists) {
      steps.push(...await planUnlink({ targetAbs }))
    }
    steps.push(...linkSteps(sourceAbs, targetAbs, kind, atomic))
  }

  let fsRes = await applyPlan('add', steps, { logger })
  fsRes.manifestPath = manifestPath
  fsRes.durationMs = Date.now() - started

  if (!fsRes.ok) {
    fsRes = await tryAppendAuditStep(fsRes, manifestPath, opts)
    return fsRes
  }

  const manifest = await loadOrCreateManifest(manifestPath)
  upsertEntry(manifest, { source: mapping.source, target: mapping.target, kind: kind as any, atomic })
  try {
    await saveManifest(manifestPath, manifest)
    fsRes.steps.push({ kind: 'write_manifest', message: 'Update manifest', status: 'executed', paths: { file: path.resolve(manifestPath) } })
    fsRes.changes.push({ action: 'manifest_upsert', source: sourceAbs, target: targetAbs })
  } catch (e: any) {
    const msg = e?.message ? String(e.message) : String(e)
    fsRes.ok = false
    fsRes.errors.push(`Failed to write manifest: ${msg}`)
    fsRes.steps.push({ kind: 'write_manifest', message: 'Update manifest', status: 'failed', error: msg, paths: { file: path.resolve(manifestPath) } })
  }

  fsRes = await tryAppendAuditStep(fsRes, manifestPath, opts)
  logger?.info?.(`[linkany] add ${fsRes.ok ? 'ok' : 'fail'} (${fsRes.durationMs}ms)`)
  return fsRes
}


