import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import { linkRule } from '../src/link.js';
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

    it('should link rule using default rules directory', async () => {
        // Mock getProjectConfig to return empty config (no rootPath)
        vi.mocked(projectConfigModule.getProjectConfig).mockResolvedValue({});

        await linkRule(mockProjectPath, 'my-rule', mockRepo);

        const expectedSourcePath = path.join(mockRepo.path, 'rules', 'my-rule');
        const expectedTargetPath = path.join(path.resolve(mockProjectPath), '.cursor', 'rules', 'my-rule');

        expect(fs.ensureSymlink).toHaveBeenCalledWith(expectedSourcePath, expectedTargetPath);
    });

    it('should link rule using configured rootPath from repo config', async () => {
        // Mock getProjectConfig to return config with rootPath
        vi.mocked(projectConfigModule.getProjectConfig).mockResolvedValue({
            rootPath: 'custom/rules/path'
        });

        await linkRule(mockProjectPath, 'my-rule', mockRepo);

        const expectedSourcePath = path.join(mockRepo.path, 'custom/rules/path', 'my-rule');
        const expectedTargetPath = path.join(path.resolve(mockProjectPath), '.cursor', 'rules', 'my-rule');

        expect(fs.ensureSymlink).toHaveBeenCalledWith(expectedSourcePath, expectedTargetPath);
    });

    it('should throw error if source rule does not exist', async () => {
        vi.mocked(projectConfigModule.getProjectConfig).mockResolvedValue({});
        // Mock source path check to return false
        vi.mocked(fs.pathExists).mockImplementation(async (p) => {
            if (typeof p === 'string' && p.includes(mockRepo.path)) {
                return false;
            }
            return true;
        });

        await expect(linkRule(mockProjectPath, 'missing-rule', mockRepo))
            .rejects.toThrow('Rule "missing-rule" not found in repository "test-repo".');
    });
});

