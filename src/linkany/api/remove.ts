import path from 'path'

import { applyPlan } from '../core/apply.js'
import { tryAppendAuditStep } from '../core/audit.js'
import { planUnlink } from '../core/plan.js'
import { getManifestBaseDir, loadManifest, resolveEntry } from '../manifest/types.js'
import { removeEntry, saveManifest } from '../manifest/io.js'
import { CommonOptions, Result, Step } from '../types.js'

export interface RemoveOptions extends CommonOptions {
  /**
   * Default: false. If true, do NOT delete the target link.
   */
  keepLink?: boolean
}

function mkLogger(opts?: CommonOptions) {
  return opts?.logger
}

/**
 * remove: remove an entry from manifest, and by default delete the target symlink.
 * Never deletes sources.
 */
export async function remove(manifestPath: string, key: string, opts?: RemoveOptions): Promise<Result> {
  const started = Date.now()
  const logger = mkLogger(opts)

  const manifest = await loadManifest(manifestPath)
  const baseDir = getManifestBaseDir(manifestPath)

  const entry = manifest.installs.find(e => (e.id && e.id === key) || e.target === key || (e.id || e.target) === key)
  if (!entry) {
    let res: Result = {
      ok: false,
      operation: 'remove',
      manifestPath,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      steps: [],
      warnings: [],
      errors: [`Entry not found in manifest: ${key}`],
      changes: [],
    }
    res.durationMs = Date.now() - started
    res = await tryAppendAuditStep(res, manifestPath, opts)
    return res
  }

  const r = resolveEntry(baseDir, entry)

  const steps: Step[] = []
  if (!opts?.keepLink) {
    steps.push(...await planUnlink({ targetAbs: r.targetAbs }))
  } else {
    steps.push({ kind: 'noop', message: 'keepLink=true; not unlinking target', status: 'skipped', paths: { target: r.targetAbs } })
  }

  let fsRes = await applyPlan('remove', steps, { logger })
  fsRes.manifestPath = manifestPath
  fsRes.durationMs = Date.now() - started

  if (!fsRes.ok) {
    fsRes = await tryAppendAuditStep(fsRes, manifestPath, opts)
    return fsRes
  }

  removeEntry(manifest, entry.id || entry.target)
  try {
    await saveManifest(manifestPath, manifest)
    fsRes.steps.push({ kind: 'write_manifest', message: 'Update manifest', status: 'executed', paths: { file: path.resolve(manifestPath) } })
    fsRes.changes.push({ action: 'manifest_remove', target: r.targetAbs })
  } catch (e: any) {
    const msg = e?.message ? String(e.message) : String(e)
    fsRes.ok = false
    fsRes.errors.push(`Failed to write manifest: ${msg}`)
    fsRes.steps.push({ kind: 'write_manifest', message: 'Update manifest', status: 'failed', error: msg, paths: { file: path.resolve(manifestPath) } })
  }

  fsRes = await tryAppendAuditStep(fsRes, manifestPath, opts)
  logger?.info?.(`[linkany] remove ${fsRes.ok ? 'ok' : 'fail'} (${fsRes.durationMs}ms)`)
  return fsRes
}


