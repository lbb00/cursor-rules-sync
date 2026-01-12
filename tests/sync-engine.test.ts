import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import { linkEntry } from '../src/sync-engine.js';
import { getAdapter } from '../src/adapters/index.js';
import * as projectConfigModule from '../src/project-config.js';
import * as utilsModule from '../src/utils.js';

vi.mock('fs-extra');
vi.mock('../src/project-config.js');
vi.mock('../src/utils.js');

describe('Sync Engine - source directory behavior', () => {
    const mockProjectPath = '/mock/project';
    const mockRepo = {
        name: 'test-repo',
        url: 'http://test.git',
        path: '/mock/repos/test-repo'
    };

    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(fs.pathExists).mockResolvedValue(true);
        vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
        vi.mocked(fs.ensureSymlink).mockResolvedValue(undefined);
        vi.mocked(fs.lstat).mockResolvedValue({ isSymbolicLink: () => true } as any);
        vi.mocked(fs.remove).mockResolvedValue(undefined);
        vi.mocked(utilsModule.addIgnoreEntry).mockResolvedValue(true);
    });

    it('should use default .cursor/rules directory when no config', async () => {
        vi.mocked(projectConfigModule.getRepoSourceConfig).mockResolvedValue({});
        vi.mocked(projectConfigModule.getSourceDir).mockReturnValue('.cursor/rules');

        await linkEntry(getAdapter('cursor', 'rules'), {
            projectPath: mockProjectPath,
            name: 'my-rule',
            repo: mockRepo
        });

        const expectedSourcePath = path.join(mockRepo.path, '.cursor/rules', 'my-rule');
        const expectedTargetPath = path.join(path.resolve(mockProjectPath), '.cursor', 'rules', 'my-rule');

        expect(fs.ensureSymlink).toHaveBeenCalledWith(expectedSourcePath, expectedTargetPath);
    });

    it('should use custom cursor.rules directory when configured', async () => {
        vi.mocked(projectConfigModule.getRepoSourceConfig).mockResolvedValue({
            cursor: { rules: 'custom-rules' }
        });
        vi.mocked(projectConfigModule.getSourceDir).mockReturnValue('custom-rules');

        await linkEntry(getAdapter('cursor', 'rules'), {
            projectPath: mockProjectPath,
            name: 'my-rule',
            repo: mockRepo
        });

        const expectedSourcePath = path.join(mockRepo.path, 'custom-rules', 'my-rule');
        const expectedTargetPath = path.join(path.resolve(mockProjectPath), '.cursor', 'rules', 'my-rule');

        expect(fs.ensureSymlink).toHaveBeenCalledWith(expectedSourcePath, expectedTargetPath);
    });

    it('should use rootPath + cursor.rules when both configured', async () => {
        vi.mocked(projectConfigModule.getRepoSourceConfig).mockResolvedValue({
            rootPath: 'src',
            cursor: { rules: 'rules' }
        });
        vi.mocked(projectConfigModule.getSourceDir).mockReturnValue('src/rules');

        await linkEntry(getAdapter('cursor', 'rules'), {
            projectPath: mockProjectPath,
            name: 'my-rule',
            repo: mockRepo
        });

        const expectedSourcePath = path.join(mockRepo.path, 'src/rules', 'my-rule');
        const expectedTargetPath = path.join(path.resolve(mockProjectPath), '.cursor', 'rules', 'my-rule');

        expect(fs.ensureSymlink).toHaveBeenCalledWith(expectedSourcePath, expectedTargetPath);
    });

    it('should use default .cursor/commands directory for commands', async () => {
        vi.mocked(projectConfigModule.getRepoSourceConfig).mockResolvedValue({});
        vi.mocked(projectConfigModule.getSourceDir).mockReturnValue('.cursor/commands');

        await linkEntry(getAdapter('cursor', 'commands'), {
            projectPath: mockProjectPath,
            name: 'my-command.md',
            repo: mockRepo
        });

        const expectedSourcePath = path.join(mockRepo.path, '.cursor/commands', 'my-command.md');
        const expectedTargetPath = path.join(path.resolve(mockProjectPath), '.cursor', 'commands', 'my-command.md');

        expect(fs.ensureSymlink).toHaveBeenCalledWith(expectedSourcePath, expectedTargetPath);
    });

    it('should use default .github/instructions directory for copilot', async () => {
        vi.mocked(projectConfigModule.getRepoSourceConfig).mockResolvedValue({});
        vi.mocked(projectConfigModule.getSourceDir).mockReturnValue('.github/instructions');

        await linkEntry(getAdapter('copilot', 'instructions'), {
            projectPath: mockProjectPath,
            name: 'coding-style.instructions.md',
            repo: mockRepo
        });

        const expectedSourcePath = path.join(mockRepo.path, '.github/instructions', 'coding-style.instructions.md');
        const expectedTargetPath = path.join(path.resolve(mockProjectPath), '.github', 'instructions', 'coding-style.instructions.md');

        expect(fs.ensureSymlink).toHaveBeenCalledWith(expectedSourcePath, expectedTargetPath);
    });

    it('should use rootPath with default directories', async () => {
        vi.mocked(projectConfigModule.getRepoSourceConfig).mockResolvedValue({
            rootPath: 'config'
        });
        vi.mocked(projectConfigModule.getSourceDir).mockReturnValue('config/.cursor/rules');

        await linkEntry(getAdapter('cursor', 'rules'), {
            projectPath: mockProjectPath,
            name: 'my-rule',
            repo: mockRepo
        });

        const expectedSourcePath = path.join(mockRepo.path, 'config/.cursor/rules', 'my-rule');
        const expectedTargetPath = path.join(path.resolve(mockProjectPath), '.cursor', 'rules', 'my-rule');

        expect(fs.ensureSymlink).toHaveBeenCalledWith(expectedSourcePath, expectedTargetPath);
    });
});

describe('Sync Engine - new sourceDir format', () => {
    const mockProjectPath = '/mock/project';
    const mockRepo = {
        name: 'test-repo',
        url: 'http://test.git',
        path: '/mock/repos/test-repo'
    };

    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(fs.pathExists).mockResolvedValue(true);
        vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
        vi.mocked(fs.ensureSymlink).mockResolvedValue(undefined);
        vi.mocked(fs.lstat).mockResolvedValue({ isSymbolicLink: () => true } as any);
        vi.mocked(fs.remove).mockResolvedValue(undefined);
        vi.mocked(utilsModule.addIgnoreEntry).mockResolvedValue(true);
    });

    it('should use sourceDir.cursor.rules when specified', async () => {
        // Simulating what getRepoSourceConfig returns for new format
        vi.mocked(projectConfigModule.getRepoSourceConfig).mockResolvedValue({
            cursor: { rules: 'src/rules' }
        });
        vi.mocked(projectConfigModule.getSourceDir).mockReturnValue('src/rules');

        await linkEntry(getAdapter('cursor', 'rules'), {
            projectPath: mockProjectPath,
            name: 'my-rule',
            repo: mockRepo
        });

        const expectedSourcePath = path.join(mockRepo.path, 'src/rules', 'my-rule');
        const expectedTargetPath = path.join(path.resolve(mockProjectPath), '.cursor', 'rules', 'my-rule');

        expect(fs.ensureSymlink).toHaveBeenCalledWith(expectedSourcePath, expectedTargetPath);
    });

    it('should use sourceDir with rootPath combined', async () => {
        // Simulating: rootPath: "src", sourceDir: { cursor: { rules: "rules" } }
        vi.mocked(projectConfigModule.getRepoSourceConfig).mockResolvedValue({
            rootPath: 'src',
            cursor: { rules: 'rules' }
        });
        vi.mocked(projectConfigModule.getSourceDir).mockReturnValue('src/rules');

        await linkEntry(getAdapter('cursor', 'rules'), {
            projectPath: mockProjectPath,
            name: 'my-rule',
            repo: mockRepo
        });

        const expectedSourcePath = path.join(mockRepo.path, 'src/rules', 'my-rule');
        const expectedTargetPath = path.join(path.resolve(mockProjectPath), '.cursor', 'rules', 'my-rule');

        expect(fs.ensureSymlink).toHaveBeenCalledWith(expectedSourcePath, expectedTargetPath);
    });

    it('should use sourceDir.copilot.instructions for copilot', async () => {
        vi.mocked(projectConfigModule.getRepoSourceConfig).mockResolvedValue({
            copilot: { instructions: 'copilot-docs' }
        });
        vi.mocked(projectConfigModule.getSourceDir).mockReturnValue('copilot-docs');

        await linkEntry(getAdapter('copilot', 'instructions'), {
            projectPath: mockProjectPath,
            name: 'coding-style.instructions.md',
            repo: mockRepo
        });

        const expectedSourcePath = path.join(mockRepo.path, 'copilot-docs', 'coding-style.instructions.md');
        const expectedTargetPath = path.join(path.resolve(mockProjectPath), '.github', 'instructions', 'coding-style.instructions.md');

        expect(fs.ensureSymlink).toHaveBeenCalledWith(expectedSourcePath, expectedTargetPath);
    });
});
