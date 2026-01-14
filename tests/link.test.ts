import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import { linkEntry } from '../src/sync-engine.js';
import { cursorRulesAdapter } from '../src/adapters/cursor-rules.js';
import * as projectConfigModule from '../src/project-config.js';
import * as utilsModule from '../src/utils.js';

vi.mock('fs-extra');
vi.mock('../src/project-config.js');
vi.mock('../src/utils.js');

describe('Link Module', () => {
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

    it('should link rule using default .cursor/rules directory', async () => {
        // Mock getRepoSourceConfig to return empty config
        vi.mocked(projectConfigModule.getRepoSourceConfig).mockResolvedValue({});
        vi.mocked(projectConfigModule.getSourceDir).mockReturnValue('.cursor/rules');

        await linkEntry(cursorRulesAdapter, {
            projectPath: mockProjectPath,
            name: 'my-rule',
            repo: mockRepo
        });

        const expectedSourcePath = path.join(mockRepo.path, '.cursor/rules', 'my-rule');
        const expectedTargetPath = path.join(path.resolve(mockProjectPath), '.cursor', 'rules', 'my-rule');

        expect(fs.ensureSymlink).toHaveBeenCalledWith(expectedSourcePath, expectedTargetPath);
    });

    it('should link rule using configured cursor.rules from repo config', async () => {
        // Mock getRepoSourceConfig to return config with custom rules directory
        vi.mocked(projectConfigModule.getRepoSourceConfig).mockResolvedValue({
            cursor: { rules: 'custom-rules' }
        });
        vi.mocked(projectConfigModule.getSourceDir).mockReturnValue('custom-rules');

        await linkEntry(cursorRulesAdapter, {
            projectPath: mockProjectPath,
            name: 'my-rule',
            repo: mockRepo
        });

        const expectedSourcePath = path.join(mockRepo.path, 'custom-rules', 'my-rule');
        const expectedTargetPath = path.join(path.resolve(mockProjectPath), '.cursor', 'rules', 'my-rule');

        expect(fs.ensureSymlink).toHaveBeenCalledWith(expectedSourcePath, expectedTargetPath);
    });

    it('should throw error if source rule does not exist', async () => {
        vi.mocked(projectConfigModule.getRepoSourceConfig).mockResolvedValue({});
        vi.mocked(projectConfigModule.getSourceDir).mockReturnValue('.cursor/rules');
        // Mock source path check to return false
        vi.mocked(fs.pathExists).mockImplementation(async (p) => {
            if (typeof p === 'string' && p.includes(mockRepo.path)) {
                return false;
            }
            return true;
        });

        await expect(linkEntry(cursorRulesAdapter, {
            projectPath: mockProjectPath,
            name: 'missing-rule',
            repo: mockRepo
        })).rejects.toThrow('Rule "missing-rule" not found in repository.');
    });
});

