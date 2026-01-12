import { SyncAdapter, SyncOptions, LinkResult } from './types.js';
import { linkEntry as engineLinkEntry, unlinkEntry as engineUnlinkEntry } from '../sync-engine.js';
import { addDependencyGeneric, removeDependencyGeneric } from '../project-config.js';

/**
 * Configuration for creating a base adapter
 */
export interface AdapterConfig {
    name: string;
    tool: string;
    subtype: string;
    configPath: [string, string];
    defaultSourceDir: string;
    targetDir: string;
    mode: 'directory' | 'file';
    fileSuffixes?: string[];
    resolveSource?: (repoDir: string, rootPath: string, name: string) => Promise<any>;
    resolveTargetName?: (name: string, alias?: string, sourceSuffix?: string) => string;
}

/**
 * Create a base adapter with common functionality
 * This factory function handles add/remove/link/unlink operations generically
 */
export function createBaseAdapter(config: AdapterConfig): SyncAdapter {
    return {
        name: config.name,
        tool: config.tool,
        subtype: config.subtype,
        configPath: config.configPath,
        defaultSourceDir: config.defaultSourceDir,
        targetDir: config.targetDir,
        mode: config.mode,
        fileSuffixes: config.fileSuffixes,
        resolveSource: config.resolveSource,
        resolveTargetName: config.resolveTargetName,

        async addDependency(projectPath, name, repoUrl, alias, isLocal = false) {
            return addDependencyGeneric(projectPath, config.configPath, name, repoUrl, alias, isLocal);
        },

        async removeDependency(projectPath, alias) {
            return removeDependencyGeneric(projectPath, config.configPath, alias);
        },

        async link(options: SyncOptions): Promise<LinkResult> {
            return engineLinkEntry(this, options);
        },

        async unlink(projectPath: string, alias: string): Promise<void> {
            return engineUnlinkEntry(this, projectPath, alias);
        }
    };
}
