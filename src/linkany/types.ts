export type LinkKind = 'file' | 'dir'

export type Operation = 'install' | 'uninstall' | 'add' | 'remove'

export type StepKind =
  | 'noop'
  | 'mkdirp'
  | 'touch'
  | 'symlink'
  | 'unlink'
  | 'rm'
  | 'move'
  | 'copy'
  | 'write_manifest'
  | 'audit'

export interface Step {
  kind: StepKind
  message: string
  /**
   * Optional paths involved in the step, for observability and auditing.
   */
  paths?: Record<string, string>
  /**
   * Whether the step was executed or skipped.
   */
  status?: 'planned' | 'executed' | 'skipped' | 'failed'
  /**
   * Optional error message for failed steps.
   */
  error?: string
  /**
   * Optional rollback hint for this step (protocol only; may be partial).
   * If present and the step was executed, a future rollback can apply this.
   */
  undo?: Omit<Step, 'status' | 'error' | 'undo'>
}

export interface Result {
  ok: boolean
  operation: Operation
  manifestPath?: string
  startedAt: string
  finishedAt: string
  durationMs: number
  steps: Step[]
  warnings: string[]
  errors: string[]
  /**
   * Summary of changes that occurred.
   */
  changes: Array<{ target?: string; source?: string; action: string }>
  /**
   * Optional rollback plan (best-effort) in reverse order of execution.
   */
  rollbackSteps?: Step[]
  /**
   * Optional human-readable plan / summary text (best-effort).
   */
  planText?: string
}

export interface Logger {
  info(msg: string): void
  warn(msg: string): void
  error(msg: string): void
}

export interface CommonOptions {
  /**
   * If provided, we append one JSON line per operation (Result summary).
   * Default strategy (V1): `${manifestPath}.log.jsonl` when manifestPath is known.
   */
  auditLogPath?: string
  logger?: Logger
  /**
   * If true, do not perform filesystem writes; only return the planned steps/result.
   */
  dryRun?: boolean
  /**
   * If true, return plan text in Result.planText (best-effort).
   */
  includePlanText?: boolean
}


