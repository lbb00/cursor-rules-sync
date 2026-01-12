import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import { getConfigSource, getCombinedProjectConfig, migrateLegacyToNew, getRepoSourceConfig, getSourceDir } from '../src/project-config.js';

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
        return { rules: { a: 'url-a' } };
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

describe('getRepoSourceConfig - sourceDir format', () => {
  const repoPath = '/mock/repo';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('parses new sourceDir format correctly', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true);
    vi.mocked(fs.readJson).mockResolvedValue({
      rootPath: 'src',
      sourceDir: {
        cursor: {
          rules: '.cursor/rules',
          commands: '.cursor/commands'
        },
        copilot: {
          instructions: '.github/instructions'
        }
      }
    });

    const config = await getRepoSourceConfig(repoPath);

    expect(config.rootPath).toBe('src');
    expect(config.cursor?.rules).toBe('.cursor/rules');
    expect(config.cursor?.commands).toBe('.cursor/commands');
    expect(config.copilot?.instructions).toBe('.github/instructions');
  });

  it('parses legacy flat format (string values) correctly', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true);
    vi.mocked(fs.readJson).mockResolvedValue({
      rootPath: 'config',
      cursor: {
        rules: 'custom-rules',
        commands: 'custom-commands'
      }
    });

    const config = await getRepoSourceConfig(repoPath);

    expect(config.rootPath).toBe('config');
    expect(config.cursor?.rules).toBe('custom-rules');
    expect(config.cursor?.commands).toBe('custom-commands');
  });

  it('returns empty config when cursor/copilot are dependency records (not source dirs)', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true);
    vi.mocked(fs.readJson).mockResolvedValue({
      cursor: {
        rules: { 'react': 'https://example.com/repo.git' }
      }
    });

    const config = await getRepoSourceConfig(repoPath);

    // Should NOT extract dependency records as source dirs
    expect(config.cursor?.rules).toBeUndefined();
  });

  it('returns empty config when file does not exist', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(false);

    const config = await getRepoSourceConfig(repoPath);

    expect(config).toEqual({});
  });
});

describe('getSourceDir', () => {
  it('returns custom directory from config', () => {
    const config = {
      rootPath: 'src',
      cursor: { rules: 'rules' }
    };

    const dir = getSourceDir(config, 'cursor', 'rules', '.cursor/rules');
    expect(dir).toBe('src/rules');
  });

  it('returns default directory when not configured', () => {
    const config = {};

    const dir = getSourceDir(config, 'cursor', 'rules', '.cursor/rules');
    expect(dir).toBe('.cursor/rules');
  });

  it('applies rootPath to default directory', () => {
    const config = { rootPath: 'config' };

    const dir = getSourceDir(config, 'cursor', 'rules', '.cursor/rules');
    expect(dir).toBe('config/.cursor/rules');
  });

  it('handles copilot instructions', () => {
    const config = {
      copilot: { instructions: 'docs/instructions' }
    };

    const dir = getSourceDir(config, 'copilot', 'instructions', '.github/instructions');
    expect(dir).toBe('docs/instructions');
  });

  it('handles cursor commands', () => {
    const config = {
      cursor: { commands: 'my-commands' }
    };

    const dir = getSourceDir(config, 'cursor', 'commands', '.cursor/commands');
    expect(dir).toBe('my-commands');
  });
});
