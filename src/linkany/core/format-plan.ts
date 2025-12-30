import { Step } from '../types.js'

export function formatPlan(steps: Step[]): string {
  if (!steps.length) return 'No changes.'
  const lines: string[] = []
  for (const s of steps) {
    const paths = s.paths
      ? Object.entries(s.paths)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ')
      : ''
    lines.push(`- ${s.kind}: ${s.message}${paths ? ` (${paths})` : ''}`)
  }
  return lines.join('\n')
}


