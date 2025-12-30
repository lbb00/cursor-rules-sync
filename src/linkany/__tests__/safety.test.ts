import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs-extra'

import { add } from '../api/add.js'
import { install } from '../api/install.js'
import { remove } from '../api/remove.js'

vi.mock('fs-extra')

describe('linkany safety (minimal)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined as any)
    vi.mocked(fs.appendFile).mockResolvedValue(undefined as any)
    vi.mocked(fs.readJson).mockResolvedValue({ version: 1, installs: [] } as any)
    vi.mocked(fs.writeFile).mockResolvedValue(undefined as any)
    vi.mocked(fs.rename).mockResolvedValue(undefined as any)
  })

  it('add refuses when source and target both exist (not already linked)', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true)
    vi.mocked(fs.lstat).mockResolvedValue({ isSymbolicLink: () => false, isDirectory: () => false } as any)

    const res = await add('/m.json', { source: '/s', target: '/t' })
    expect(res.ok).toBe(false)
    expect(res.errors[0]).toMatch(/source and target both exist/i)
  })

  it('install aborts if target exists and is not a symlink', async () => {
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

  it('remove with dryRun does not unlink', async () => {
    vi.mocked(fs.readJson).mockResolvedValue({ version: 1, installs: [{ source: '/s', target: '/t' }] } as any)
    vi.mocked(fs.pathExists).mockResolvedValue(true)
    vi.mocked(fs.lstat).mockResolvedValue({ isSymbolicLink: () => true } as any)
    vi.mocked(fs.readlink).mockResolvedValue('/s' as any)

    const res = await remove('/m.json', '/t', { dryRun: true })
    expect(res.ok).toBe(true)
    expect(fs.unlink).not.toHaveBeenCalled()
  })
})


