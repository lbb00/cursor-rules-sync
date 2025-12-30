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
}


