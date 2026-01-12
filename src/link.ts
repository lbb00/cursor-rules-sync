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
 * Link a Cursor command
 */
export async function linkCursorCommand(
    projectPath: string,
    commandName: string,
    repo: RepoConfig,
    alias?: string,
    isLocal: boolean = false
): Promise<{ sourceName: string; targetName: string }> {
    const adapter = getAdapter('cursor', 'commands');
    const result = await linkEntry(adapter, {
        projectPath,
        name: commandName,
        repo,
        alias,
        isLocal
    });
    return { sourceName: result.sourceName, targetName: result.targetName };
}

/**
 * Unlink a Cursor command
 */
export async function unlinkCursorCommand(projectPath: string, alias: string): Promise<void> {
    const adapter = getAdapter('cursor', 'commands');
    await unlinkEntry(adapter, projectPath, alias);
}

/**
 * Link a Cursor skill
 */
export async function linkCursorSkill(
    projectPath: string,
    skillName: string,
    repo: RepoConfig,
    alias?: string,
    isLocal: boolean = false
): Promise<void> {
    const adapter = getAdapter('cursor', 'skills');
    await linkEntry(adapter, {
        projectPath,
        name: skillName,
        repo,
        alias,
        isLocal
    });
}

/**
 * Unlink a Cursor skill
 */
export async function unlinkCursorSkill(projectPath: string, alias: string): Promise<void> {
    const adapter = getAdapter('cursor', 'skills');
    await unlinkEntry(adapter, projectPath, alias);
}

/**
 * Link a Claude skill
 */
export async function linkClaudeSkill(
    projectPath: string,
    skillName: string,
    repo: RepoConfig,
    alias?: string,
    isLocal: boolean = false
): Promise<void> {
    const adapter = getAdapter('claude', 'skills');
    await linkEntry(adapter, {
        projectPath,
        name: skillName,
        repo,
        alias,
        isLocal
    });
}

/**
 * Unlink a Claude skill
 */
export async function unlinkClaudeSkill(projectPath: string, alias: string): Promise<void> {
    const adapter = getAdapter('claude', 'skills');
    await unlinkEntry(adapter, projectPath, alias);
}

/**
 * Link a Claude agent
 */
export async function linkClaudeAgent(
    projectPath: string,
    agentName: string,
    repo: RepoConfig,
    alias?: string,
    isLocal: boolean = false
): Promise<{ sourceName: string; targetName: string }> {
    const adapter = getAdapter('claude', 'agents');
    const result = await linkEntry(adapter, {
        projectPath,
        name: agentName,
        repo,
        alias,
        isLocal
    });
    return { sourceName: result.sourceName, targetName: result.targetName };
}

/**
 * Unlink a Claude agent
 */
export async function unlinkClaudeAgent(projectPath: string, alias: string): Promise<void> {
    const adapter = getAdapter('claude', 'agents');
    await unlinkEntry(adapter, projectPath, alias);
}

