/**
 * Backward-compatible link functions.
 * These wrap the new sync engine for compatibility with existing code.
 */

import { RepoConfig } from './config.js';
import { linkEntry, unlinkEntry } from './sync-engine.js';
import { getAdapter } from './adapters/index.js';

// Re-export from sync-engine for new code
export { linkEntry, unlinkEntry } from './sync-engine.js';

/**
 * Link a Cursor rule (backward-compatible wrapper)
 */
export async function linkRule(
    projectPath: string,
    ruleName: string,
    repo: RepoConfig,
    alias?: string,
    isLocal: boolean = false
): Promise<void> {
    const adapter = getAdapter('cursor', 'rules');
    await linkEntry(adapter, {
        projectPath,
        name: ruleName,
        repo,
        alias,
        isLocal
    });
}

/**
 * Unlink a Cursor rule (backward-compatible wrapper)
 */
export async function unlinkRule(projectPath: string, alias: string): Promise<void> {
    const adapter = getAdapter('cursor', 'rules');
    await unlinkEntry(adapter, projectPath, alias);
}

/**
 * Link a Copilot instruction (backward-compatible wrapper)
 */
export async function linkCopilotInstruction(
    projectPath: string,
    ruleName: string,
    repo: RepoConfig,
    alias?: string,
    isLocal: boolean = false
): Promise<{ sourceName: string; targetName: string }> {
    const adapter = getAdapter('copilot', 'instructions');
    const result = await linkEntry(adapter, {
        projectPath,
        name: ruleName,
        repo,
        alias,
        isLocal
    });
    return { sourceName: result.sourceName, targetName: result.targetName };
}

/**
 * Unlink a Copilot instruction (backward-compatible wrapper)
 */
export async function unlinkCopilotInstruction(projectPath: string, alias: string): Promise<void> {
    const adapter = getAdapter('copilot', 'instructions');
    await unlinkEntry(adapter, projectPath, alias);
}

/**
 * Link a Cursor plan (new function)
 */
export async function linkPlan(
    projectPath: string,
    planName: string,
    repo: RepoConfig,
    alias?: string,
    isLocal: boolean = false
): Promise<{ sourceName: string; targetName: string }> {
    const adapter = getAdapter('cursor', 'plans');
    const result = await linkEntry(adapter, {
        projectPath,
        name: planName,
        repo,
        alias,
        isLocal
    });
    return { sourceName: result.sourceName, targetName: result.targetName };
}

/**
 * Unlink a Cursor plan (new function)
 */
export async function unlinkPlan(projectPath: string, alias: string): Promise<void> {
    const adapter = getAdapter('cursor', 'plans');
    await unlinkEntry(adapter, projectPath, alias);
}
