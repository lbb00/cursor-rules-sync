import { applyPlan } from '../core/apply.js'
import { tryAppendAuditStep } from '../core/audit.js'
import { planUnlink } from '../core/plan.js'
import { getManifestBaseDir, loadManifest, resolveEntry } from '../manifest/types.js'
import { CommonOptions, Result, Step } from '../types.js'

function mkLogger(opts?: CommonOptions) {
  return opts?.logger
}

/**
 * Remove all target symlinks listed in manifest. Never deletes sources.
 */
export async function uninstall(manifestPath: string, opts?: CommonOptions): Promise<Result> {
  const started = Date.now()
  const logger = mkLogger(opts)

  const manifest = await loadManifest(manifestPath)
  const baseDir = getManifestBaseDir(manifestPath)

  const allSteps: Step[] = []
  for (const entry of manifest.installs) {
    const r = resolveEntry(baseDir, entry)
    allSteps.push(...await planUnlink({ targetAbs: r.targetAbs }))
  }

  let res = await applyPlan('uninstall', allSteps, { logger })
  res.manifestPath = manifestPath
  res.durationMs = Date.now() - started
  res = await tryAppendAuditStep(res, manifestPath, opts)
  logger?.info?.(`[linkany] uninstall ${res.ok ? 'ok' : 'fail'} (${res.durationMs}ms)`)
  return res
}


