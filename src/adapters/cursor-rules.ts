import fs from 'fs-extra';
import path from 'path';
import { SyncAdapter, ResolvedSource } from './types.js';

/**
 * Adapter for Cursor Rules (.cursor/rules/)
 * Mode: directory - links entire rule directories
 */
export const cursorRulesAdapter: SyncAdapter = {
    name: 'cursor-rules',
    tool: 'cursor',
    subtype: 'rules',
    defaultSourceDir: 'rules',
    targetDir: '.cursor/rules',
    mode: 'directory',

    async resolveSource(repoDir: string, rootPath: string, name: string): Promise<ResolvedSource> {
        const sourcePath = path.join(repoDir, rootPath, name);

        if (!await fs.pathExists(sourcePath)) {
            throw new Error(`Rule "${name}" not found in repository.`);
        }

        return {
            sourceName: name,
            sourcePath,
            suffix: undefined
        };
    },

    resolveTargetName(name: string, alias?: string): string {
        return alias || name;
    }
};
