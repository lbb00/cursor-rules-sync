import fs from 'fs-extra'
import path from 'path'
import { CommonOptions, Result, Step } from '../types.js'

export function defaultAuditLogPath(manifestPath: string, opts?: CommonOptions) {
  return opts?.auditLogPath ?? `${path.resolve(manifestPath)}.log.jsonl`
}

export async function appendAudit(logPath: string, result: Result) {
  await fs.ensureDir(path.dirname(logPath))
  const line = JSON.stringify(result) + '\n'
  await fs.appendFile(logPath, line, 'utf8')
}

export async function tryAppendAuditStep(result: Result, manifestPath: string, opts?: CommonOptions): Promise<Result> {
  const logPath = defaultAuditLogPath(manifestPath, opts)
  try {
    await appendAudit(logPath, result)
    result.steps.push({ kind: 'audit', message: 'Append audit log', status: 'executed', paths: { file: logPath } })
  } catch (e: any) {
    const msg = e?.message ? String(e.message) : String(e)
    result.warnings.push(`Failed to write audit log: ${msg}`)
    result.steps.push({ kind: 'audit', message: 'Append audit log', status: 'failed', error: msg, paths: { file: logPath } })
  }
  return result
}


