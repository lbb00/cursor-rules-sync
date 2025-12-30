import { applyPlan } from './apply.js'
import { tryAppendAuditStep } from './audit.js'
import { formatPlan } from './format-plan.js'
import { CommonOptions, Result, Step } from '../types.js'

function nowIso() {
  return new Date().toISOString()
}

export interface RunOperationInput {
  operation: Result['operation']
  manifestPath: string
  steps: Step[]
  opts?: CommonOptions
  /**
   * Called after apply (or dry-run) but before audit is appended.
   * Allows callers to push extra steps (e.g., write_manifest) and mark failure.
   */
  finalize?: (result: Result) => Promise<Result> | Result
}

export async function runOperation(input: RunOperationInput): Promise<Result> {
  const startedAt = nowIso()
  const startedMs = Date.now()
  const logger = input.opts?.logger

  let res = await applyPlan(input.operation, input.steps, {
    logger,
    dryRun: input.opts?.dryRun,
  })

  res.operation = input.operation
  res.manifestPath = input.manifestPath
  res.startedAt = startedAt
  res.durationMs = Date.now() - startedMs
  res.finishedAt = nowIso()

  if (input.opts?.includePlanText) {
    res.planText = formatPlan(input.steps)
  }

  if (input.finalize) {
    res = await input.finalize(res)
  }

  res = await tryAppendAuditStep(res, input.manifestPath, input.opts)

  logger?.info?.(`[linkany] ${input.operation} ${res.ok ? 'ok' : 'fail'} (${res.durationMs}ms)`)
  return res
}


