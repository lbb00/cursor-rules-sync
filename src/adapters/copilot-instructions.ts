import fs from 'fs-extra';
import path from 'path';
import { SyncAdapter, ResolvedSource } from './types.js';

const SUFFIX_INSTRUCTIONS_MD = '.instructions.md';
const SUFFIX_MD = '.md';

/**
 * Adapter for Copilot Instructions (.github/instructions/)
 * Mode: file - links individual instruction files (.instructions.md or .md)
 */
export const copilotInstructionsAdapter: SyncAdapter = {
    name: 'copilot-instructions',
    tool: 'copilot',
    subtype: 'instructions',
    defaultSourceDir: 'rules',
    targetDir: '.github/instructions',
    mode: 'file',
    fileSuffixes: [SUFFIX_INSTRUCTIONS_MD, SUFFIX_MD],

    async resolveSource(repoDir: string, rootPath: string, name: string): Promise<ResolvedSource> {
        // If name already has a known suffix, use as-is
        if (name.endsWith(SUFFIX_INSTRUCTIONS_MD)) {
            const sourcePath = path.join(repoDir, rootPath, name);
            if (!await fs.pathExists(sourcePath)) {
                throw new Error(`Instruction "${name}" not found in repository.`);
            }
            return {
                sourceName: name,
                sourcePath,
                suffix: SUFFIX_INSTRUCTIONS_MD
            };
        }

        if (name.endsWith(SUFFIX_MD)) {
            const sourcePath = path.join(repoDir, rootPath, name);
            if (!await fs.pathExists(sourcePath)) {
                throw new Error(`Instruction "${name}" not found in repository.`);
            }
            return {
                sourceName: name,
                sourcePath,
                suffix: SUFFIX_MD
            };
        }

        // No suffix provided - try to resolve
        const candA = `${name}${SUFFIX_INSTRUCTIONS_MD}`;
        const candB = `${name}${SUFFIX_MD}`;
        const pathA = path.join(repoDir, rootPath, candA);
        const pathB = path.join(repoDir, rootPath, candB);
        const existsA = await fs.pathExists(pathA);
        const existsB = await fs.pathExists(pathB);

        if (existsA && existsB) {
            throw new Error(`Both "${candA}" and "${candB}" exist in repository. Please specify the suffix explicitly.`);
        }

        if (existsA) {
            return {
                sourceName: candA,
                sourcePath: pathA,
                suffix: SUFFIX_INSTRUCTIONS_MD
            };
        }

        if (existsB) {
            return {
                sourceName: candB,
                sourcePath: pathB,
                suffix: SUFFIX_MD
            };
        }

        throw new Error(`Instruction "${name}" not found in repository.`);
    },

    resolveTargetName(name: string, alias?: string, sourceSuffix?: string): string {
        const base = alias || name;

        // If base already has a known suffix, use as-is
        if (base.endsWith(SUFFIX_INSTRUCTIONS_MD) || base.endsWith(SUFFIX_MD)) {
            return base;
        }

        // Add the source suffix if available
        if (sourceSuffix) {
            return `${base}${sourceSuffix}`;
        }

        return base;
    }
};

/**
 * Helper to strip copilot suffixes from a name (for display purposes)
 */
export function stripCopilotSuffix(name: string): string {
    if (name.endsWith(SUFFIX_INSTRUCTIONS_MD)) {
        return name.slice(0, -SUFFIX_INSTRUCTIONS_MD.length);
    }
    if (name.endsWith(SUFFIX_MD)) {
        return name.slice(0, -SUFFIX_MD.length);
    }
    return name;
}

/**
 * Check if a name has a copilot suffix
 */
export function hasCopilotSuffix(name: string): boolean {
    return name.endsWith(SUFFIX_INSTRUCTIONS_MD) || name.endsWith(SUFFIX_MD);
}
