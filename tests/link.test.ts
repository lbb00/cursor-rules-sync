import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import * as linkany from 'linkany';
import { linkRule } from '../src/link.js';
import * as projectConfigModule from '../src/project-config.js';
import * as utilsModule from '../src/utils.js';

vi.mock('fs-extra');
vi.mock('linkany');
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
        vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
        vi.mocked(fs.ensureFile).mockResolvedValue(undefined as any);
        vi.mocked(fs.symlink).mockResolvedValue(undefined as any);
        vi.mocked(fs.rename).mockResolvedValue(undefined as any);
        vi.mocked(fs.unlink).mockResolvedValue(undefined as any);
        vi.mocked(fs.remove).mockResolvedValue(undefined);
        vi.mocked(utilsModule.addIgnoreEntry).mockResolvedValue(true);
        vi.mocked(fs.readlink).mockResolvedValue('missing' as any);

        vi.mocked(linkany.loadOrCreateManifest).mockResolvedValue({ version: 1, installs: [] } as any);
        vi.mocked(linkany.upsertEntry).mockImplementation(() => { });
        vi.mocked(linkany.saveManifest).mockResolvedValue(undefined as any);
        vi.mocked(linkany.install).mockResolvedValue({ ok: true, errors: [], changes: [{ action: 'symlink' }] } as any);
    });

    it('should link rule using default rules directory', async () => {
        // Mock getProjectConfig to return empty config (no rootPath)
        vi.mocked(projectConfigModule.getProjectConfig).mockResolvedValue({});

        vi.mocked(fs.pathExists).mockImplementation(async (p) => {
            const expectedSourcePath = path.join(mockRepo.path, 'rules', 'my-rule');
            const expectedTargetPath = path.join(path.resolve(mockProjectPath), '.cursor', 'rules', 'my-rule');
            if (p === expectedSourcePath) return true;
            if (p === expectedTargetPath) return false;
            return true;
        });
        vi.mocked(fs.lstat).mockImplementation(async (p) => {
            const expectedSourcePath = path.join(mockRepo.path, 'rules', 'my-rule');
            if (p === expectedSourcePath) {
                return { isDirectory: () => true, isSymbolicLink: () => false } as any;
            }
            throw new Error('ENOENT');
        });

        await linkRule(mockProjectPath, 'my-rule', mockRepo);

        const expectedSourcePath = path.join(mockRepo.path, 'rules', 'my-rule');
        const expectedTargetPath = path.join(path.resolve(mockProjectPath), '.cursor', 'rules', 'my-rule');

        const expectedManifestPath = path.join(path.resolve(mockProjectPath), '.cursor-rules-sync.linkany.json');
        expect(linkany.loadOrCreateManifest).toHaveBeenCalledWith(expectedManifestPath);
        expect(linkany.upsertEntry).toHaveBeenCalledWith(expect.any(Object), { source: expectedSourcePath, target: expectedTargetPath, atomic: true });
        expect(linkany.saveManifest).toHaveBeenCalledWith(expectedManifestPath, expect.any(Object));
        expect(linkany.install).toHaveBeenCalledWith(expectedManifestPath);
    });

    it('should link rule using configured rootPath from repo config', async () => {
        // Mock getProjectConfig to return config with rootPath
        vi.mocked(projectConfigModule.getProjectConfig).mockResolvedValue({
            rootPath: 'custom/rules/path'
        });

        vi.mocked(fs.pathExists).mockImplementation(async (p) => {
            const expectedSourcePath = path.join(mockRepo.path, 'custom/rules/path', 'my-rule');
            const expectedTargetPath = path.join(path.resolve(mockProjectPath), '.cursor', 'rules', 'my-rule');
            if (p === expectedSourcePath) return true;
            if (p === expectedTargetPath) return false;
            return true;
        });
        vi.mocked(fs.lstat).mockImplementation(async (p) => {
            const expectedSourcePath = path.join(mockRepo.path, 'custom/rules/path', 'my-rule');
            if (p === expectedSourcePath) {
                return { isDirectory: () => true, isSymbolicLink: () => false } as any;
            }
            throw new Error('ENOENT');
        });

        await linkRule(mockProjectPath, 'my-rule', mockRepo);

        const expectedSourcePath = path.join(mockRepo.path, 'custom/rules/path', 'my-rule');
        const expectedTargetPath = path.join(path.resolve(mockProjectPath), '.cursor', 'rules', 'my-rule');

        const expectedManifestPath = path.join(path.resolve(mockProjectPath), '.cursor-rules-sync.linkany.json');
        expect(linkany.loadOrCreateManifest).toHaveBeenCalledWith(expectedManifestPath);
        expect(linkany.upsertEntry).toHaveBeenCalledWith(expect.any(Object), { source: expectedSourcePath, target: expectedTargetPath, atomic: true });
        expect(linkany.saveManifest).toHaveBeenCalledWith(expectedManifestPath, expect.any(Object));
        expect(linkany.install).toHaveBeenCalledWith(expectedManifestPath);
    });

    it('should throw error if source rule does not exist', async () => {
        vi.mocked(projectConfigModule.getProjectConfig).mockResolvedValue({});
        vi.mocked(fs.pathExists).mockResolvedValue(false);

        await expect(linkRule(mockProjectPath, 'missing-rule', mockRepo))
            .rejects.toThrow('Rule "missing-rule" not found in repository "test-repo".');
    });
});

