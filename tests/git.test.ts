import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cloneOrUpdateRepo, runGitCommand } from '../src/git.js';
import { execa } from 'execa';
import fs from 'fs-extra';
import { RepoConfig } from '../src/config.js';

vi.mock('execa');
vi.mock('fs-extra');

describe('Git Module', () => {
  const mockRepo: RepoConfig = {
    name: 'test-repo',
    url: 'https://github.com/test/repo.git',
    path: '/mock/path/test-repo'
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('cloneOrUpdateRepo', () => {
    it('should clone if repo directory does not exist', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(false);

      await cloneOrUpdateRepo(mockRepo);

      expect(fs.ensureDir).toHaveBeenCalledWith(mockRepo.path);
      expect(execa).toHaveBeenCalledWith('git', ['clone', mockRepo.url, '.'], { cwd: mockRepo.path, stdio: 'inherit' });
    });

    it('should update (pull) if repo directory and .git exist', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true); // repo dir exists
      vi.mocked(fs.pathExists).mockImplementation(async (p) => {
        if (p === mockRepo.path) return true;
        if (p === `${mockRepo.path}/.git`) return true;
        return false;
      });

      await cloneOrUpdateRepo(mockRepo);

      expect(execa).toHaveBeenCalledWith('git', ['pull'], { cwd: mockRepo.path, stdio: 'inherit' });
      expect(execa).not.toHaveBeenCalledWith('git', ['clone', expect.anything(), expect.anything()], expect.anything());
    });

    it('should re-clone if repo directory exists but is not a git repo', async () => {
      vi.mocked(fs.pathExists).mockImplementation(async (p) => {
        if (p === mockRepo.path) return true;
        if (p === `${mockRepo.path}/.git`) return false;
        return false;
      });

      await cloneOrUpdateRepo(mockRepo);

      expect(fs.remove).toHaveBeenCalledWith(mockRepo.path);
      expect(execa).toHaveBeenCalledWith('git', ['clone', mockRepo.url, '.'], { cwd: mockRepo.path, stdio: 'inherit' });
    });
  });

  describe('runGitCommand', () => {
    it('should execute git command in repo directory', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true);

      await runGitCommand(['status'], mockRepo.path);

      expect(execa).toHaveBeenCalledWith('git', ['status'], { cwd: mockRepo.path, stdio: 'inherit' });
    });

    it('should throw error if repo directory does not exist', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(false);

      await expect(runGitCommand(['status'], mockRepo.path))
        .rejects
        .toThrow(/Cursor rules repository not found/);
    });
  });
});

