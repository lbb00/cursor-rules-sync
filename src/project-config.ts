import fs from 'fs-extra';
import path from 'path';

const CONFIG_FILENAME = 'ai-rules-sync.json';
const LOCAL_CONFIG_FILENAME = 'ai-rules-sync.local.json';

// Legacy (temporary) compatibility. Intentionally centralized so it can be removed in a future version.
const LEGACY_CONFIG_FILENAME = 'cursor-rules.json';
const LEGACY_LOCAL_CONFIG_FILENAME = 'cursor-rules.local.json';

export type RuleEntry = string | { url: string; rule?: string };

/**
 * Source directory configuration (for rules repositories)
 * Defines where source files are located in a rules repo
 */
export interface SourceDirConfig {
    cursor?: {
        // Source directory for cursor rules, default: ".cursor/rules"
        rules?: string;
        // Source directory for cursor commands, default: ".cursor/commands"
        commands?: string;
        // Source directory for cursor skills, default: ".cursor/skills"
        skills?: string;
    };
    copilot?: {
        // Source directory for copilot instructions, default: ".github/instructions"
        instructions?: string;
    };
    claude?: {
        // Source directory for claude skills, default: ".claude/skills"
        skills?: string;
        // Source directory for claude agents, default: ".claude/agents"
        agents?: string;
    };
}

/**
 * Unified configuration for ai-rules-sync.json
 * Used both in rules repos (sourceDir) and in projects (cursor/copilot dependencies)
 *
 * In rules repos:
 *   - rootPath: global path prefix
 *   - sourceDir: where source files are located
 *
 * In projects:
 *   - cursor/copilot: dependency records
 */
export interface ProjectConfig {
    // Global path prefix for source directories, default: "" (root directory)
    // Only used in rules repos
    rootPath?: string;
    // Source directory configuration (only used in rules repos)
    sourceDir?: SourceDirConfig;
    // Dependency records (used in projects)
    cursor?: {
        // key is the local alias (target name), value is repo url OR object with url and original rule name
        rules?: Record<string, RuleEntry>;
        commands?: Record<string, RuleEntry>;
        skills?: Record<string, RuleEntry>;
    };
    copilot?: {
        // key is the local alias (target name), value is repo url OR object with url and original rule name
        instructions?: Record<string, RuleEntry>;
    };
    claude?: {
        // key is the local alias (target name), value is repo url OR object with url and original rule name
        skills?: Record<string, RuleEntry>;
        agents?: Record<string, RuleEntry>;
    };
}

/**
 * @deprecated Use ProjectConfig with sourceDir instead
 * Kept for backward compatibility during transition
 */
export interface RepoSourceConfig {
    rootPath?: string;
    cursor?: {
        rules?: string;
        skills?: string;
        commands?: string;
    };
    copilot?: {
        instructions?: string;
    };
    claude?: {
        skills?: string;
        agents?: string;
    };
}

export type ConfigSource = 'new' | 'legacy' | 'none';

async function readConfigFile<T>(filePath: string): Promise<T> {
    if (await fs.pathExists(filePath)) {
        try {
            return await fs.readJson(filePath);
        } catch (e) {
            // ignore
        }
    }
    return {} as T;
}

async function hasAnyNewConfig(projectPath: string): Promise<boolean> {
    return (
        await fs.pathExists(path.join(projectPath, CONFIG_FILENAME)) ||
        await fs.pathExists(path.join(projectPath, LOCAL_CONFIG_FILENAME))
    );
}

async function hasAnyLegacyConfig(projectPath: string): Promise<boolean> {
    return (
        await fs.pathExists(path.join(projectPath, LEGACY_CONFIG_FILENAME)) ||
        await fs.pathExists(path.join(projectPath, LEGACY_LOCAL_CONFIG_FILENAME))
    );
}

function legacyToNew(legacy: { rules?: Record<string, RuleEntry> }): ProjectConfig {
    return {
        cursor: {
            rules: legacy.rules || {}
        }
    };
}

function mergeCombined(main: ProjectConfig, local: ProjectConfig): ProjectConfig {
    return {
        cursor: {
            rules: { ...(main.cursor?.rules || {}), ...(local.cursor?.rules || {}) },
            commands: { ...(main.cursor?.commands || {}), ...(local.cursor?.commands || {}) },
            skills: { ...(main.cursor?.skills || {}), ...(local.cursor?.skills || {}) }
        },
        copilot: {
            instructions: { ...(main.copilot?.instructions || {}), ...(local.copilot?.instructions || {}) }
        },
        claude: {
            skills: { ...(main.claude?.skills || {}), ...(local.claude?.skills || {}) },
            agents: { ...(main.claude?.agents || {}), ...(local.claude?.agents || {}) }
        }
    };
}

export async function getConfigSource(projectPath: string): Promise<ConfigSource> {
    if (await hasAnyNewConfig(projectPath)) return 'new';
    if (await hasAnyLegacyConfig(projectPath)) return 'legacy';
    return 'none';
}

/**
 * Read repository-side source configuration (used when `projectPath` is a rules repo).
 * Returns the full config which may contain sourceDir.
 * Supports both new (sourceDir) and legacy (flat cursor/copilot with string values) formats.
 */
export async function getRepoSourceConfig(projectPath: string): Promise<RepoSourceConfig> {
    const newPath = path.join(projectPath, CONFIG_FILENAME);
    if (await fs.pathExists(newPath)) {
        const config = await readConfigFile<ProjectConfig>(newPath);

        // New format: sourceDir is present
        if (config.sourceDir) {
            return {
                rootPath: config.rootPath,
                cursor: config.sourceDir.cursor,
                copilot: config.sourceDir.copilot,
                claude: config.sourceDir.claude
            };
        }

        // Legacy format: cursor.rules/commands/instructions are strings (source dirs)
        // We need to detect if this is a rules repo config (string values) vs project config (object values)
        // Check if cursor.rules is a string (rules repo) or object (project dependencies)
        const cursorRules = config.cursor?.rules;
        const cursorCommands = config.cursor?.commands;
        const cursorSkills = config.cursor?.skills;
        const copilotInstructions = config.copilot?.instructions;

        const isCursorRulesString = typeof cursorRules === 'string';
        const isCursorCommandsString = typeof cursorCommands === 'string';
        const isCursorSkillsString = typeof cursorSkills === 'string';
        const isCopilotInstructionsString = typeof copilotInstructions === 'string';
        const claudeSkills = config.claude?.skills;
        const claudeAgents = config.claude?.agents;
        const isClaudeSkillsString = typeof claudeSkills === 'string';
        const isClaudeAgentsString = typeof claudeAgents === 'string';

        // If any of these are strings, treat as legacy rules repo config
        if (isCursorRulesString || isCursorCommandsString || isCursorSkillsString || isCopilotInstructionsString || isClaudeSkillsString || isClaudeAgentsString) {
            return {
                rootPath: config.rootPath,
                cursor: {
                    rules: isCursorRulesString ? cursorRules : undefined,
                    commands: isCursorCommandsString ? cursorCommands : undefined,
                    skills: isCursorSkillsString ? cursorSkills : undefined
                },
                copilot: {
                    instructions: isCopilotInstructionsString ? copilotInstructions : undefined
                },
                claude: {
                    skills: isClaudeSkillsString ? claudeSkills : undefined,
                    agents: isClaudeAgentsString ? claudeAgents : undefined
                }
            };
        }

        // Not a rules repo config (no sourceDir, no string values)
        return { rootPath: config.rootPath };
    }
    return {};
}

/**
 * Get the source directory for a specific tool type from repo config.
 * @param repoConfig - The repo source configuration
 * @param tool - Tool name: 'cursor', 'copilot', or 'claude'
 * @param subtype - Subtype: 'rules', 'plans', 'instructions', 'skills', 'agents', or 'plugins'
 * @param defaultDir - Default directory if not configured
 */
export function getSourceDir(
    repoConfig: RepoSourceConfig,
    tool: string,
    subtype: string,
    defaultDir: string
): string {
    const rootPath = repoConfig.rootPath || '';
    let toolDir: string | undefined;

    if (tool === 'cursor') {
        if (subtype === 'rules') {
            toolDir = repoConfig.cursor?.rules;
        } else if (subtype === 'commands') {
            toolDir = repoConfig.cursor?.commands;
        } else if (subtype === 'skills') {
            toolDir = repoConfig.cursor?.skills;
        }
    } else if (tool === 'copilot') {
        if (subtype === 'instructions') {
            toolDir = repoConfig.copilot?.instructions;
        }
    } else if (tool === 'claude') {
        if (subtype === 'skills') {
            toolDir = repoConfig.claude?.skills;
        } else if (subtype === 'agents') {
            toolDir = repoConfig.claude?.agents;
        }
    }

    const dir = toolDir ?? defaultDir;
    return rootPath ? path.join(rootPath, dir) : dir;
}

export async function getCombinedProjectConfig(projectPath: string): Promise<ProjectConfig> {
    const source = await getConfigSource(projectPath);

    if (source === 'new') {
        const main = await readConfigFile<ProjectConfig>(path.join(projectPath, CONFIG_FILENAME));
        const local = await readConfigFile<ProjectConfig>(path.join(projectPath, LOCAL_CONFIG_FILENAME));
        return mergeCombined(main, local);
    }

    if (source === 'legacy') {
        const legacyMain = await readConfigFile<{ rootPath?: string; rules?: Record<string, RuleEntry> }>(
            path.join(projectPath, LEGACY_CONFIG_FILENAME)
        );
        const legacyLocal = await readConfigFile<{ rootPath?: string; rules?: Record<string, RuleEntry> }>(
            path.join(projectPath, LEGACY_LOCAL_CONFIG_FILENAME)
        );
        return mergeCombined(legacyToNew(legacyMain), legacyToNew(legacyLocal));
    }

    return mergeCombined({}, {});
}

/**
 * Migrate legacy cursor-rules*.json into new ai-rules-sync*.json files.
 * This is ONLY called by write paths (add/remove) to keep legacy-compat removable.
 */
export async function migrateLegacyToNew(projectPath: string): Promise<{ migrated: boolean }> {
    const source = await getConfigSource(projectPath);
    if (source !== 'legacy') return { migrated: false };

    const legacyMainPath = path.join(projectPath, LEGACY_CONFIG_FILENAME);
    const legacyLocalPath = path.join(projectPath, LEGACY_LOCAL_CONFIG_FILENAME);

    const legacyMain = await readConfigFile<{ rules?: Record<string, RuleEntry> }>(legacyMainPath);
    const legacyLocal = await readConfigFile<{ rules?: Record<string, RuleEntry> }>(legacyLocalPath);

    const newMain = legacyToNew(legacyMain);
    const newLocal = legacyToNew(legacyLocal);

    await fs.writeJson(path.join(projectPath, CONFIG_FILENAME), newMain, { spaces: 2 });
    if (Object.keys(newLocal.cursor?.rules || {}).length > 0) {
        await fs.writeJson(path.join(projectPath, LOCAL_CONFIG_FILENAME), newLocal, { spaces: 2 });
    }

    return { migrated: true };
}

async function readNewConfigForWrite(projectPath: string, isLocal: boolean): Promise<ProjectConfig> {
    const configPath = path.join(projectPath, isLocal ? LOCAL_CONFIG_FILENAME : CONFIG_FILENAME);
    return await readConfigFile<ProjectConfig>(configPath);
}

async function writeNewConfig(projectPath: string, isLocal: boolean, config: ProjectConfig): Promise<void> {
    const configPath = path.join(projectPath, isLocal ? LOCAL_CONFIG_FILENAME : CONFIG_FILENAME);
    await fs.writeJson(configPath, config, { spaces: 2 });
}

/**
 * Generic function to add a dependency to project config
 * This function works with any adapter by using the configPath
 * @param projectPath - Path to the project
 * @param configPath - Config path like ['cursor', 'rules'] or ['copilot', 'instructions']
 * @param name - Original name of the dependency
 * @param repoUrl - Repository URL
 * @param alias - Optional alias for the dependency
 * @param isLocal - Whether to store in local config
 */
export async function addDependencyGeneric(
    projectPath: string,
    configPath: [string, string],
    name: string,
    repoUrl: string,
    alias?: string,
    isLocal: boolean = false
): Promise<{ migrated: boolean }> {
    const migration = await migrateLegacyToNew(projectPath);
    const config = await readNewConfigForWrite(projectPath, isLocal);

    const [topLevel, subLevel] = configPath;

    // Initialize nested structure if needed
    (config as any)[topLevel] ??= {};
    (config as any)[topLevel][subLevel] ??= {};

    const targetName = alias || name;
    (config as any)[topLevel][subLevel][targetName] =
        alias && alias !== name
            ? { url: repoUrl, rule: name }
            : repoUrl;

    await writeNewConfig(projectPath, isLocal, config);
    return migration;
}

/**
 * Generic function to remove a dependency from project config
 * This function works with any adapter by using the configPath
 * @param projectPath - Path to the project
 * @param configPath - Config path like ['cursor', 'rules'] or ['copilot', 'instructions']
 * @param alias - Alias of the dependency to remove
 */
export async function removeDependencyGeneric(
    projectPath: string,
    configPath: [string, string],
    alias: string
): Promise<{ removedFrom: string[]; migrated: boolean }> {
    const migration = await migrateLegacyToNew(projectPath);
    const removedFrom: string[] = [];

    const [topLevel, subLevel] = configPath;

    const mainPath = path.join(projectPath, CONFIG_FILENAME);
    const mainConfig = await readConfigFile<ProjectConfig>(mainPath);
    if ((mainConfig as any)[topLevel]?.[subLevel]?.[alias]) {
        delete (mainConfig as any)[topLevel][subLevel][alias];
        await fs.writeJson(mainPath, mainConfig, { spaces: 2 });
        removedFrom.push(CONFIG_FILENAME);
    }

    const localPath = path.join(projectPath, LOCAL_CONFIG_FILENAME);
    const localConfig = await readConfigFile<ProjectConfig>(localPath);
    if ((localConfig as any)[topLevel]?.[subLevel]?.[alias]) {
        delete (localConfig as any)[topLevel][subLevel][alias];
        await fs.writeJson(localPath, localConfig, { spaces: 2 });
        removedFrom.push(LOCAL_CONFIG_FILENAME);
    }

    return { removedFrom, migrated: migration.migrated };
}

export async function addCursorDependency(projectPath: string, ruleName: string, repoUrl: string, alias?: string, isLocal: boolean = false): Promise<{ migrated: boolean }> {
    return addDependencyGeneric(projectPath, ['cursor', 'rules'], ruleName, repoUrl, alias, isLocal);
}

export async function removeCursorDependency(projectPath: string, alias: string): Promise<{ removedFrom: string[]; migrated: boolean }> {
    return removeDependencyGeneric(projectPath, ['cursor', 'rules'], alias);
}

export async function addCopilotDependency(projectPath: string, ruleName: string, repoUrl: string, alias?: string, isLocal: boolean = false): Promise<{ migrated: boolean }> {
    return addDependencyGeneric(projectPath, ['copilot', 'instructions'], ruleName, repoUrl, alias, isLocal);
}

export async function removeCopilotDependency(projectPath: string, alias: string): Promise<{ removedFrom: string[]; migrated: boolean }> {
    return removeDependencyGeneric(projectPath, ['copilot', 'instructions'], alias);
}

// ============ Cursor skills support ============

export async function addCursorCommandDependency(projectPath: string, commandName: string, repoUrl: string, alias?: string, isLocal: boolean = false): Promise<{ migrated: boolean }> {
    return addDependencyGeneric(projectPath, ['cursor', 'commands'], commandName, repoUrl, alias, isLocal);
}

export async function removeCursorCommandDependency(projectPath: string, alias: string): Promise<{ removedFrom: string[]; migrated: boolean }> {
    return removeDependencyGeneric(projectPath, ['cursor', 'commands'], alias);
}

// ============ Cursor skills support ============

export async function addCursorSkillDependency(projectPath: string, skillName: string, repoUrl: string, alias?: string, isLocal: boolean = false): Promise<{ migrated: boolean }> {
    return addDependencyGeneric(projectPath, ['cursor', 'skills'], skillName, repoUrl, alias, isLocal);
}

export async function removeCursorSkillDependency(projectPath: string, alias: string): Promise<{ removedFrom: string[]; migrated: boolean }> {
    return removeDependencyGeneric(projectPath, ['cursor', 'skills'], alias);
}

// ============ Claude support ============

export async function addClaudeSkillDependency(projectPath: string, skillName: string, repoUrl: string, alias?: string, isLocal: boolean = false): Promise<{ migrated: boolean }> {
    return addDependencyGeneric(projectPath, ['claude', 'skills'], skillName, repoUrl, alias, isLocal);
}

export async function removeClaudeSkillDependency(projectPath: string, alias: string): Promise<{ removedFrom: string[]; migrated: boolean }> {
    return removeDependencyGeneric(projectPath, ['claude', 'skills'], alias);
}

export async function addClaudeAgentDependency(projectPath: string, agentName: string, repoUrl: string, alias?: string, isLocal: boolean = false): Promise<{ migrated: boolean }> {
    return addDependencyGeneric(projectPath, ['claude', 'agents'], agentName, repoUrl, alias, isLocal);
}

export async function removeClaudeAgentDependency(projectPath: string, alias: string): Promise<{ removedFrom: string[]; migrated: boolean }> {
    return removeDependencyGeneric(projectPath, ['claude', 'agents'], alias);
}

// Backwards-compatible exports for existing code paths (Cursor only). These will be removed once CLI is migrated.
export async function addDependency(projectPath: string, ruleName: string, repoUrl: string, alias?: string, isLocal: boolean = false) {
    return addCursorDependency(projectPath, ruleName, repoUrl, alias, isLocal);
}

export async function removeDependency(projectPath: string, alias: string): Promise<string[]> {
    const { removedFrom } = await removeCursorDependency(projectPath, alias);
    return removedFrom;
}
