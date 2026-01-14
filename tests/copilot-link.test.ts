import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import { linkEntry } from '../src/sync-engine.js';
import { copilotInstructionsAdapter } from '../src/adapters/copilot-instructions.js';
import * as projectConfigModule from '../src/project-config.js';
import * as utilsModule from '../src/utils.js';

vi.mock('fs-extra');
vi.mock('../src/project-config.js');
vi.mock('../src/utils.js');

describe('Copilot instructions linking', () => {
  const mockProjectPath = '/mock/project';
  const mockRepo = {
    name: 'test-repo',
    url: 'http://test.git',
    path: '/mock/repos/test-repo'
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.ensureSymlink).mockResolvedValue(undefined as any);
    vi.mocked(fs.remove).mockResolvedValue(undefined as any);
    vi.mocked(fs.lstat).mockResolvedValue({ isSymbolicLink: () => true } as any);
    vi.mocked(utilsModule.addIgnoreEntry).mockResolvedValue(true);
  });

  it('resolves <name>.md when name has no suffix', async () => {
    vi.mocked(projectConfigModule.getRepoSourceConfig).mockResolvedValue({});
    vi.mocked(projectConfigModule.getSourceDir).mockReturnValue('.github/instructions');

    vi.mocked(fs.pathExists).mockImplementation(async (p) => {
      const a = path.join(mockRepo.path, '.github/instructions', 'foo.instructions.md');
      const b = path.join(mockRepo.path, '.github/instructions', 'foo.md');
      const target = path.join(path.resolve(mockProjectPath), '.github', 'instructions', 'foo.md');
      if (p === a) return false;
      if (p === b) return true;
      if (p === target) return false;
      return false;
    });

    await linkEntry(copilotInstructionsAdapter, {
      projectPath: mockProjectPath,
      name: 'foo',
      repo: mockRepo as any
    });

    const expectedSource = path.join(mockRepo.path, '.github/instructions', 'foo.md');
    const expectedTarget = path.join(path.resolve(mockProjectPath), '.github', 'instructions', 'foo.md');
    expect(fs.ensureSymlink).toHaveBeenCalledWith(expectedSource, expectedTarget);
  });

  it('resolves <name>.instructions.md when name has no suffix', async () => {
    vi.mocked(projectConfigModule.getRepoSourceConfig).mockResolvedValue({});
    vi.mocked(projectConfigModule.getSourceDir).mockReturnValue('.github/instructions');

    vi.mocked(fs.pathExists).mockImplementation(async (p) => {
      const a = path.join(mockRepo.path, '.github/instructions', 'bar.instructions.md');
      const b = path.join(mockRepo.path, '.github/instructions', 'bar.md');
      const target = path.join(path.resolve(mockProjectPath), '.github', 'instructions', 'bar.instructions.md');
      if (p === a) return true;
      if (p === b) return false;
      if (p === target) return false;
      return false;
    });

    await linkEntry(copilotInstructionsAdapter, {
      projectPath: mockProjectPath,
      name: 'bar',
      repo: mockRepo as any
    });

    const expectedSource = path.join(mockRepo.path, '.github/instructions', 'bar.instructions.md');
    const expectedTarget = path.join(path.resolve(mockProjectPath), '.github', 'instructions', 'bar.instructions.md');
    expect(fs.ensureSymlink).toHaveBeenCalledWith(expectedSource, expectedTarget);
  });

  it('errors when both <name>.md and <name>.instructions.md exist', async () => {
    vi.mocked(projectConfigModule.getRepoSourceConfig).mockResolvedValue({});
    vi.mocked(projectConfigModule.getSourceDir).mockReturnValue('.github/instructions');

    vi.mocked(fs.pathExists).mockImplementation(async (p) => {
      const a = path.join(mockRepo.path, '.github/instructions', 'dup.instructions.md');
      const b = path.join(mockRepo.path, '.github/instructions', 'dup.md');
      if (p === a) return true;
      if (p === b) return true;
      return false;
    });

    await expect(linkEntry(copilotInstructionsAdapter, {
      projectPath: mockProjectPath,
      name: 'dup',
      repo: mockRepo as any
    })).rejects.toThrow(/Both "dup\.instructions\.md" and "dup\.md" exist/);
  });

  it('preserves source suffix when alias has no suffix', async () => {
    vi.mocked(projectConfigModule.getRepoSourceConfig).mockResolvedValue({});
    vi.mocked(projectConfigModule.getSourceDir).mockReturnValue('.github/instructions');

    vi.mocked(fs.pathExists).mockImplementation(async (p) => {
      const a = path.join(mockRepo.path, '.github/instructions', 'x.instructions.md');
      const b = path.join(mockRepo.path, '.github/instructions', 'x.md');
      const target = path.join(path.resolve(mockProjectPath), '.github', 'instructions', 'y.instructions.md');
      if (p === a) return true;
      if (p === b) return false;
      if (p === target) return false;
      return false;
    });

    await linkEntry(copilotInstructionsAdapter, {
      projectPath: mockProjectPath,
      name: 'x',
      repo: mockRepo as any,
      alias: 'y'
    });

    const expectedSource = path.join(mockRepo.path, '.github/instructions', 'x.instructions.md');
    const expectedTarget = path.join(path.resolve(mockProjectPath), '.github', 'instructions', 'y.instructions.md');
    expect(fs.ensureSymlink).toHaveBeenCalledWith(expectedSource, expectedTarget);
  });
});


