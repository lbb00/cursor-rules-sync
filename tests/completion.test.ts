import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import * as completionModule from '../src/completion.js';
import * as configModule from '../src/config.js';

// Mock fs-extra
vi.mock('fs-extra');

// Mock os
vi.mock('os', () => ({
  default: {
    homedir: () => '/mock/home'
  },
  homedir: () => '/mock/home'
}));

// Mock config module
vi.mock('../src/config.js', () => ({
  getConfig: vi.fn(),
  setConfig: vi.fn()
}));

describe('Completion Module', () => {
  const mockHomeDir = '/mock/home';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('detectShell', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should detect zsh shell', () => {
      process.env.SHELL = '/bin/zsh';
      expect(completionModule.detectShell()).toBe('zsh');
    });

    it('should detect bash shell', () => {
      process.env.SHELL = '/bin/bash';
      expect(completionModule.detectShell()).toBe('bash');
    });

    it('should detect fish shell', () => {
      process.env.SHELL = '/usr/bin/fish';
      expect(completionModule.detectShell()).toBe('fish');
    });

    it('should return unknown for unrecognized shell', () => {
      process.env.SHELL = '/bin/tcsh';
      expect(completionModule.detectShell()).toBe('unknown');
    });

    it('should return unknown when SHELL is not set', () => {
      delete process.env.SHELL;
      expect(completionModule.detectShell()).toBe('unknown');
    });
  });

  describe('getShellConfigPath', () => {
    const originalPlatform = process.platform;

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should return .zshrc for zsh', () => {
      const result = completionModule.getShellConfigPath('zsh');
      expect(result).toBe(path.join(mockHomeDir, '.zshrc'));
    });

    it('should return fish config path for fish', () => {
      const result = completionModule.getShellConfigPath('fish');
      expect(result).toBe(path.join(mockHomeDir, '.config', 'fish', 'config.fish'));
    });

    it('should return .bashrc for bash on Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      const result = completionModule.getShellConfigPath('bash');
      expect(result).toBe(path.join(mockHomeDir, '.bashrc'));
    });

    it('should return .bash_profile for bash on macOS if it exists', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const result = completionModule.getShellConfigPath('bash');
      expect(result).toBe(path.join(mockHomeDir, '.bash_profile'));
    });

    it('should return .bashrc for bash on macOS if .bash_profile does not exist', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = completionModule.getShellConfigPath('bash');
      expect(result).toBe(path.join(mockHomeDir, '.bashrc'));
    });

    it('should return null for unknown shell', () => {
      const result = completionModule.getShellConfigPath('unknown');
      expect(result).toBeNull();
    });
  });

  describe('getCompletionSnippet', () => {
    it('should return fish-style snippet for fish with block markers', () => {
      const result = completionModule.getCompletionSnippet('fish');
      expect(result).toContain('ais completion fish | source');
      expect(result).toContain(completionModule.COMPLETION_START_MARKER);
      expect(result).toContain(completionModule.COMPLETION_END_MARKER);
    });

    it('should return eval-style snippet for bash with block markers', () => {
      const result = completionModule.getCompletionSnippet('bash');
      expect(result).toContain('eval "$(ais completion)"');
      expect(result).toContain(completionModule.COMPLETION_START_MARKER);
      expect(result).toContain(completionModule.COMPLETION_END_MARKER);
    });

    it('should return eval-style snippet for zsh with block markers', () => {
      const result = completionModule.getCompletionSnippet('zsh');
      expect(result).toContain('eval "$(ais completion zsh)"');
      expect(result).toContain(completionModule.COMPLETION_START_MARKER);
      expect(result).toContain(completionModule.COMPLETION_END_MARKER);
    });
  });

  describe('isCompletionInstalled', () => {
    it('should return false if config file does not exist', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(false);
      const result = await completionModule.isCompletionInstalled('/mock/path/.zshrc');
      expect(result).toBe(false);
    });

    it('should return true if config contains new block format', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true);
      const content = `# some config\n${completionModule.COMPLETION_START_MARKER}\neval "$(ais completion)"\n${completionModule.COMPLETION_END_MARKER}`;
      vi.mocked(fs.readFile).mockResolvedValue(content);
      const result = await completionModule.isCompletionInstalled('/mock/path/.zshrc');
      expect(result).toBe(true);
    });

    it('should return true if config contains legacy ais completion marker', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue('# some config\n# ais shell completion\neval "$(ais completion)"');
      const result = await completionModule.isCompletionInstalled('/mock/path/.zshrc');
      expect(result).toBe(true);
    });

    it('should return true if config contains ais completion command', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue('# some config\neval "$(ais completion)"');
      const result = await completionModule.isCompletionInstalled('/mock/path/.zshrc');
      expect(result).toBe(true);
    });

    it('should return false if config does not contain ais completion', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue('# some other config\nexport PATH=$PATH:/usr/local/bin');
      const result = await completionModule.isCompletionInstalled('/mock/path/.zshrc');
      expect(result).toBe(false);
    });
  });

  describe('removeCompletionCode', () => {
    it('should remove new block format', () => {
      const content = `# some config\n${completionModule.COMPLETION_START_MARKER}\neval "$(ais completion)"\n${completionModule.COMPLETION_END_MARKER}\n# more config`;
      const result = completionModule.removeCompletionCode(content);
      expect(result).not.toContain(completionModule.COMPLETION_START_MARKER);
      expect(result).not.toContain(completionModule.COMPLETION_END_MARKER);
      expect(result).not.toContain('ais completion');
      expect(result).toContain('# some config');
      expect(result).toContain('# more config');
    });

    it('should remove legacy bash format', () => {
      const content = '# some config\n# ais shell completion\neval "$(ais completion)"\n# more config';
      const result = completionModule.removeCompletionCode(content);
      expect(result).not.toContain('# ais shell completion');
      expect(result).not.toContain('eval "$(ais completion)"');
      expect(result).toContain('# some config');
      expect(result).toContain('# more config');
    });

    it('should remove legacy zsh format with all lines', () => {
      const content = '# some config\n# ais shell completion\n# Save and source AIS completion script\nais completion > ~/.zsh/ais_completion.zsh 2>/dev/null && source ~/.zsh/ais_completion.zsh\n# more config';
      const result = completionModule.removeCompletionCode(content);
      expect(result).not.toContain('# ais shell completion');
      expect(result).not.toContain('# Save and source AIS completion script');
      expect(result).not.toContain('ais completion > ~/.zsh/ais_completion.zsh');
      expect(result).toContain('# some config');
      expect(result).toContain('# more config');
    });

    it('should remove legacy fish format', () => {
      const content = '# some config\n# ais shell completion\nais completion fish | source\n# more config';
      const result = completionModule.removeCompletionCode(content);
      expect(result).not.toContain('# ais shell completion');
      expect(result).not.toContain('ais completion fish | source');
      expect(result).toContain('# some config');
      expect(result).toContain('# more config');
    });

    it('should handle mixed old and new formats', () => {
      const content = `# config\n# ais shell completion\neval "$(ais completion)"\n${completionModule.COMPLETION_START_MARKER}\nsome content\n${completionModule.COMPLETION_END_MARKER}\n# end`;
      const result = completionModule.removeCompletionCode(content);
      expect(result).not.toContain('# ais shell completion');
      expect(result).not.toContain(completionModule.COMPLETION_START_MARKER);
      expect(result).toContain('# config');
      expect(result).toContain('# end');
    });

    it('should clean up multiple consecutive empty lines', () => {
      const content = '# config\n\n\n\n# ais shell completion\neval "$(ais completion)"\n\n\n# end';
      const result = completionModule.removeCompletionCode(content);
      // Should not have more than 2 consecutive newlines
      expect(result).not.toMatch(/\n{3,}/);
    });
  });

  describe('installCompletionToFile', () => {
    it('should return success false for unknown shell', async () => {
      const result = await completionModule.installCompletionToFile('unknown');
      expect(result).toEqual({ success: false, configPath: null, alreadyInstalled: false });
    });

    it('should return alreadyInstalled true if completion exists (new format)', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue(`${completionModule.COMPLETION_START_MARKER}\neval "$(ais completion)"\n${completionModule.COMPLETION_END_MARKER}`);

      const result = await completionModule.installCompletionToFile('zsh');
      expect(result.alreadyInstalled).toBe(true);
      expect(result.success).toBe(true);
    });

    it('should return alreadyInstalled true if completion exists (legacy format)', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue('# ais shell completion\neval "$(ais completion)"');

      const result = await completionModule.installCompletionToFile('zsh');
      expect(result.alreadyInstalled).toBe(true);
      expect(result.success).toBe(true);
    });

    it('should append completion snippet if not installed', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true);
      vi.mocked(fs.readFile).mockResolvedValue('# existing config');
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.appendFile).mockResolvedValue(undefined);

      const result = await completionModule.installCompletionToFile('zsh');

      expect(result.success).toBe(true);
      expect(result.alreadyInstalled).toBe(false);
      expect(fs.appendFile).toHaveBeenCalledWith(
        path.join(mockHomeDir, '.zshrc'),
        expect.stringContaining(completionModule.COMPLETION_START_MARKER)
      );
    });

    it('should create parent directory for fish config', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(false);
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
      vi.mocked(fs.appendFile).mockResolvedValue(undefined);

      await completionModule.installCompletionToFile('fish');

      expect(fs.ensureDir).toHaveBeenCalledWith(
        path.join(mockHomeDir, '.config', 'fish')
      );
    });
  });
});
