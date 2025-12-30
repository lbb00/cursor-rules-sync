import path from 'path'
import fs from 'fs-extra'
import { copyPath, createDir, createEmptyFile, createSymlink, removePath, removeSymlink, renameAtomic } from './fs-ops.js'
import { LinkKind, Logger, Result, Step } from '../types.js'

function nowIso() {
  return new Date().toISOString()
}

function durationMs(start: number) {
  return Date.now() - start
}

function defaultLogger(): Logger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
  }
}

export interface ApplyOptions {
  logger?: Logger
  dryRun?: boolean
}

export async function applyPlan(operation: Result['operation'], steps: Step[], opts: ApplyOptions = {}): Promise<Result> {
  const startTs = Date.now()
  const startedAt = nowIso()
  const logger = opts.logger ?? defaultLogger()

  const result: Result = {
    ok: true,
    operation,
    startedAt,
    finishedAt: startedAt,
    durationMs: 0,
    steps: [],
    warnings: [],
    errors: [],
    changes: [],
  }

  for (const s of steps) {
    const step: Step = { ...s, status: 'planned' }
    try {
      if (opts.dryRun && s.kind !== 'noop') {
        step.status = 'skipped'
        result.steps.push(step)
        continue
      }
      switch (s.kind) {
        case 'noop':
          step.status = 'skipped'
          break
        case 'mkdirp': {
          const dir = s.paths?.dir
          if (!dir) throw new Error('mkdirp step missing dir')
          await createDir(dir)
          step.status = 'executed'
          break
        }
        case 'touch': {
          const file = s.paths?.file
          if (!file) throw new Error('touch step missing file')
          await createEmptyFile(file)
          step.status = 'executed'
          result.changes.push({ action: 'create_source_file', source: file })
          break
        }
        case 'symlink': {
          const source = s.paths?.source
          const target = s.paths?.target
          if (!source || !target) throw new Error('symlink step missing source/target')

          let kind: LinkKind | undefined = (s.paths?.kind as LinkKind | undefined)
          if (!kind) {
            try {
              const st = await fs.lstat(source)
              kind = st.isDirectory() ? 'dir' : 'file'
            } catch {
              kind = 'file'
            }
          }

          await createSymlink(source, target, kind)
          step.status = 'executed'
          result.changes.push({ action: 'symlink', source, target })
          step.undo = { kind: 'unlink', message: 'Rollback: remove created symlink', paths: { target } }
          break
        }
        case 'unlink': {
          const target = s.paths?.target
          if (!target) throw new Error('unlink step missing target')
          await removeSymlink(target)
          step.status = 'executed'
          result.changes.push({ action: 'unlink', target })
          break
        }
        case 'rm': {
          const p = s.paths?.path
          if (!p) throw new Error('rm step missing path')
          await removePath(p)
          step.status = 'executed'
          result.changes.push({ action: 'rm', target: p })
          break
        }
        case 'move': {
          const from = s.paths?.from
          const to = s.paths?.to
          if (!from || !to) throw new Error('move step missing from/to')
          await renameAtomic(from, to)
          step.status = 'executed'
          result.changes.push({ action: 'move', source: from, target: to })
          step.undo = step.undo ?? { kind: 'move', message: 'Rollback: move back', paths: { from: to, to: from } }
          break
        }
        case 'copy': {
          const from = s.paths?.from
          const to = s.paths?.to
          if (!from || !to) throw new Error('copy step missing from/to')
          await copyPath(from, to)
          step.status = 'executed'
          result.changes.push({ action: 'copy', source: from, target: to })
          break
        }
        case 'write_manifest':
        case 'audit':
          step.status = 'skipped'
          break
        default: {
          const _exhaustive: never = s.kind
          throw new Error(`Unknown step kind: ${String(_exhaustive)}`)
        }
      }
      result.steps.push(step)
    } catch (e: any) {
      step.status = 'failed'
      step.error = e?.message ? String(e.message) : String(e)
      result.steps.push(step)
      result.ok = false
      result.errors.push(step.error)
      logger.error(`[linkany] step failed: ${step.kind} ${step.error}`)

      const tmp = step.paths?.target && path.basename(step.paths.target).includes('.tmp.')
        ? step.paths.target
        : undefined
      if (tmp) {
        try { await removePath(tmp) } catch {}
      }
      break
    }
  }

  // Build a best-effort rollback plan in reverse execution order.
  result.rollbackSteps = result.steps
    .filter(s => s.status === 'executed' && s.undo)
    .map(s => s.undo!)
    .reverse()

  result.finishedAt = nowIso()
  result.durationMs = durationMs(startTs)
  return result
}


