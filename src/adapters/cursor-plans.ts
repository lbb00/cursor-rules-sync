import fs from 'fs-extra';
import path from 'path';
import { SyncAdapter, ResolvedSource } from './types.js';

/**
 * Adapter for Cursor Plans (.cursor/plans/)
 * Mode: file - links individual plan files (.md)
 */
export const cursorPlansAdapter: SyncAdapter = {
    name: 'cursor-plans',
    tool: 'cursor',
    subtype: 'plans',
    defaultSourceDir: 'plans',
    targetDir: '.cursor/plans',
    mode: 'file',
    fileSuffixes: ['.md'],

    async resolveSource(repoDir: string, rootPath: string, name: string): Promise<ResolvedSource> {
        // If name already has .md suffix, use as-is
        if (name.endsWith('.md')) {
            const sourcePath = path.join(repoDir, rootPath, name);
            if (!await fs.pathExists(sourcePath)) {
                throw new Error(`Plan "${name}" not found in repository.`);
            }
            return {
                sourceName: name,
                sourcePath,
                suffix: '.md'
            };
        }

        // Try adding .md suffix
        const candName = `${name}.md`;
        const candPath = path.join(repoDir, rootPath, candName);

        if (await fs.pathExists(candPath)) {
            return {
                sourceName: candName,
                sourcePath: candPath,
                suffix: '.md'
            };
        }

        // Try without suffix (maybe it's a directory or exact filename)
        const exactPath = path.join(repoDir, rootPath, name);
        if (await fs.pathExists(exactPath)) {
            return {
                sourceName: name,
                sourcePath: exactPath,
                suffix: undefined
            };
        }

        throw new Error(`Plan "${name}" not found in repository.`);
    },

    resolveTargetName(name: string, alias?: string, sourceSuffix?: string): string {
        const base = alias || name;
        // If alias has no suffix but source does, add it
        if (sourceSuffix && !base.endsWith(sourceSuffix)) {
            return `${base}${sourceSuffix}`;
        }
        return base;
    }
};
