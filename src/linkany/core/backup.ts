import { Step } from '../types.js'
import { tmpPathForTarget } from './plan.js'

function rand() {
  return Math.random().toString(16).slice(2)
}

export function backupPathForTarget(targetAbs: string) {
  return `${targetAbs}.bak.${Date.now()}.${rand()}`
}

/**
 * Plan an atomic replace for symlink target:
 * - create tmp symlink (done elsewhere)
 * - move existing target to backup
 * - move tmp into place
 *
 * This does NOT delete backups; leaving backups is safer and aids rollback.
 */
export function planReplaceTargetWithTmp(opts: { targetAbs: string; atomic: boolean }): { backupAbs?: string; steps: Step[]; tmpAbs: string } {
  const steps: Step[] = []
  const tmpAbs = opts.atomic ? tmpPathForTarget(opts.targetAbs) : opts.targetAbs
  if (opts.atomic) {
    const backupAbs = backupPathForTarget(opts.targetAbs)
    steps.push({
      kind: 'move',
      message: 'Move existing target aside to backup before replacement',
      paths: { from: opts.targetAbs, to: backupAbs },
      undo: {
        kind: 'move',
        message: 'Rollback: restore previous target from backup',
        paths: { from: backupAbs, to: opts.targetAbs },
      },
    })
    steps.push({
      kind: 'move',
      message: 'Atomically move temp symlink into place',
      paths: { from: tmpAbs, to: opts.targetAbs },
      undo: {
        kind: 'move',
        message: 'Rollback: move current target back to tmp',
        paths: { from: opts.targetAbs, to: tmpAbs },
      },
    })
    return { backupAbs, steps, tmpAbs }
  }

  return { steps, tmpAbs }
}


