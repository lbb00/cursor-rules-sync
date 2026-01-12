import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import { getConfigSource, getCombinedProjectConfig, migrateLegacyToNew } from '../src/project-config.js';

vi.mock('fs-extra');

describe('project-config (ai-rules-sync + legacy compat)', () => {
  const projectPath = '/mock/project';

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.readJson).mockResolvedValue({});
    vi.mocked(fs.writeJson).mockResolvedValue(undefined as any);
  });

  it('prefers new config when ai-rules-sync.json exists', async () => {
    vi.mocked(fs.pathExists).mockImplementation(async (p) => {
      if (p === path.join(projectPath, 'ai-rules-sync.json')) return true;
      if (p === path.join(projectPath, 'cursor-rules.json')) return true; // should be ignored
      return false;
    });

    const source = await getConfigSource(projectPath);
    expect(source).toBe('new');
  });

  it('falls back to legacy cursor-rules.json when no new config exists', async () => {
    vi.mocked(fs.pathExists).mockImplementation(async (p) => {
      if (p === path.join(projectPath, 'ai-rules-sync.json')) return false;
      if (p === path.join(projectPath, 'ai-rules-sync.local.json')) return false;
      if (p === path.join(projectPath, 'cursor-rules.json')) return true;
      if (p === path.join(projectPath, 'cursor-rules.local.json')) return false;
      return false;
    });

    vi.mocked(fs.readJson).mockImplementation(async (p) => {
      if (p === path.join(projectPath, 'cursor-rules.json')) {
        return { rules: { react: 'https://example.com/repo.git' } };
      }
      return {};
    });

    const combined = await getCombinedProjectConfig(projectPath);
    expect(combined.cursor?.rules?.react).toBe('https://example.com/repo.git');
    expect(Object.keys(combined.copilot?.instructions || {})).toHaveLength(0);
  });

  it('migrates legacy cursor-rules*.json into ai-rules-sync*.json on write paths', async () => {
    vi.mocked(fs.pathExists).mockImplementation(async (p) => {
      if (p === path.join(projectPath, 'ai-rules-sync.json')) return false;
      if (p === path.join(projectPath, 'ai-rules-sync.local.json')) return false;
      if (p === path.join(projectPath, 'cursor-rules.json')) return true;
      if (p === path.join(projectPath, 'cursor-rules.local.json')) return true;
      return false;
    });

    vi.mocked(fs.readJson).mockImplementation(async (p) => {
      if (p === path.join(projectPath, 'cursor-rules.json')) {
        return { rootPath: 'rules', rules: { a: 'url-a' } };
      }
      if (p === path.join(projectPath, 'cursor-rules.local.json')) {
        return { rules: { b: { url: 'url-b', rule: 'bb' } } };
      }
      return {};
    });

    const res = await migrateLegacyToNew(projectPath);
    expect(res.migrated).toBe(true);

    expect(fs.writeJson).toHaveBeenCalledWith(
      path.join(projectPath, 'ai-rules-sync.json'),
      expect.objectContaining({
        rootPath: 'rules',
        cursor: { rules: { a: 'url-a' } },
      }),
      { spaces: 2 }
    );

    expect(fs.writeJson).toHaveBeenCalledWith(
      path.join(projectPath, 'ai-rules-sync.local.json'),
      expect.objectContaining({
        cursor: { rules: { b: { url: 'url-b', rule: 'bb' } } },
      }),
      { spaces: 2 }
    );
  });
});


