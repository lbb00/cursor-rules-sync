import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import { linkCopilotInstruction } from '../src/link.js';
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
    vi.mocked(projectConfigModule.getProjectConfig).mockResolvedValue({});

    vi.mocked(fs.pathExists).mockImplementation(async (p) => {
      const a = path.join(mockRepo.path, 'rules', 'foo.instructions.md');
      const b = path.join(mockRepo.path, 'rules', 'foo.md');
      const target = path.join(path.resolve(mockProjectPath), '.github', 'instructions', 'foo.md');
      if (p === a) return false;
      if (p === b) return true;
      if (p === target) return false;
      return false;
    });

    await linkCopilotInstruction(mockProjectPath, 'foo', mockRepo as any);

    const expectedSource = path.join(mockRepo.path, 'rules', 'foo.md');
    const expectedTarget = path.join(path.resolve(mockProjectPath), '.github', 'instructions', 'foo.md');
    expect(fs.ensureSymlink).toHaveBeenCalledWith(expectedSource, expectedTarget);
  });

  it('resolves <name>.instructions.md when name has no suffix', async () => {
    vi.mocked(projectConfigModule.getProjectConfig).mockResolvedValue({});
    vi.mocked(fs.pathExists).mockImplementation(async (p) => {
      const a = path.join(mockRepo.path, 'rules', 'bar.instructions.md');
      const b = path.join(mockRepo.path, 'rules', 'bar.md');
      const target = path.join(path.resolve(mockProjectPath), '.github', 'instructions', 'bar.instructions.md');
      if (p === a) return true;
      if (p === b) return false;
      if (p === target) return false;
      return false;
    });

    await linkCopilotInstruction(mockProjectPath, 'bar', mockRepo as any);

    const expectedSource = path.join(mockRepo.path, 'rules', 'bar.instructions.md');
    const expectedTarget = path.join(path.resolve(mockProjectPath), '.github', 'instructions', 'bar.instructions.md');
    expect(fs.ensureSymlink).toHaveBeenCalledWith(expectedSource, expectedTarget);
  });

  it('errors when both <name>.md and <name>.instructions.md exist', async () => {
    vi.mocked(projectConfigModule.getProjectConfig).mockResolvedValue({});
    vi.mocked(fs.pathExists).mockImplementation(async (p) => {
      const a = path.join(mockRepo.path, 'rules', 'dup.instructions.md');
      const b = path.join(mockRepo.path, 'rules', 'dup.md');
      if (p === a) return true;
      if (p === b) return true;
      return false;
    });

    await expect(linkCopilotInstruction(mockProjectPath, 'dup', mockRepo as any))
      .rejects.toThrow(/Both "dup\.instructions\.md" and "dup\.md" exist/);
  });

  it('preserves source suffix when alias has no suffix', async () => {
    vi.mocked(projectConfigModule.getProjectConfig).mockResolvedValue({});
    vi.mocked(fs.pathExists).mockImplementation(async (p) => {
      const a = path.join(mockRepo.path, 'rules', 'x.instructions.md');
      const b = path.join(mockRepo.path, 'rules', 'x.md');
      const target = path.join(path.resolve(mockProjectPath), '.github', 'instructions', 'y.instructions.md');
      if (p === a) return true;
      if (p === b) return false;
      if (p === target) return false;
      return false;
    });

    await linkCopilotInstruction(mockProjectPath, 'x', mockRepo as any, 'y');

    const expectedSource = path.join(mockRepo.path, 'rules', 'x.instructions.md');
    const expectedTarget = path.join(path.resolve(mockProjectPath), '.github', 'instructions', 'y.instructions.md');
    expect(fs.ensureSymlink).toHaveBeenCalledWith(expectedSource, expectedTarget);
  });
});


