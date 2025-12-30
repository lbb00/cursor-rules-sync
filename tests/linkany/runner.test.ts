import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs-extra'

import { add, install } from '../../src/linkany/api/index.js'

vi.mock('fs-extra')

describe('linkany', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
    vi.mocked(fs.appendFile).mockResolvedValue(undefined as any)
    vi.mocked(fs.readJson).mockResolvedValue({ version: 1, installs: [] } as any)
    vi.mocked(fs.writeFile).mockResolvedValue(undefined as any)
    vi.mocked(fs.rename).mockResolvedValue(undefined as any)
  })

  it('add should refuse when source and target both exist and not already linked', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true)
    vi.mocked(fs.lstat).mockResolvedValue({ isSymbolicLink: () => false, isDirectory: () => false } as any)

    const res = await add('/m.json', { source: '/s', target: '/t' })
    expect(res.ok).toBe(false)
    expect(res.errors[0]).toMatch(/source and target both exist/i)
  })

  it('install should abort when target exists and is not a symlink', async () => {
    vi.mocked(fs.readJson).mockResolvedValue({ version: 1, installs: [{ source: '/s', target: '/t' }] } as any)
    vi.mocked(fs.pathExists).mockImplementation(async (p) => {
      if (p === '/m.json') return true
      if (p === '/s') return true
      if (p === '/t') return true
      return false
    })
    vi.mocked(fs.lstat).mockImplementation(async (p) => {
      if (p === '/s') return { isDirectory: () => false, isSymbolicLink: () => false } as any
      if (p === '/t') return { isSymbolicLink: () => false, isDirectory: () => false } as any
      throw new Error('ENOENT')
    })

    const res = await install('/m.json')
    expect(res.ok).toBe(false)
    expect(res.errors[0]).toMatch(/target exists and is not a symlink/i)
    expect(fs.symlink).not.toHaveBeenCalled()
  })
})


