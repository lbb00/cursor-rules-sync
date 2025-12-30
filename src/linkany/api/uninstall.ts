import { runOperation } from '../core/runner.js'
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
  const manifest = await loadManifest(manifestPath)
  const baseDir = getManifestBaseDir(manifestPath)

  const allSteps: Step[] = []
  for (const entry of manifest.installs) {
    const r = resolveEntry(baseDir, entry)
    allSteps.push(...await planUnlink({ targetAbs: r.targetAbs }))
  }

  return await runOperation({
    operation: 'uninstall',
    manifestPath,
    steps: allSteps,
    opts,
  })
}


