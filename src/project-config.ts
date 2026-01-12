import fs from 'fs-extra';
import path from 'path';

const CONFIG_FILENAME = 'ai-rules-sync.json';
const LOCAL_CONFIG_FILENAME = 'ai-rules-sync.local.json';

// Legacy (temporary) compatibility. Intentionally centralized so it can be removed in a future version.
const LEGACY_CONFIG_FILENAME = 'cursor-rules.json';
const LEGACY_LOCAL_CONFIG_FILENAME = 'cursor-rules.local.json';

export type RuleEntry = string | { url: string; rule?: string };

export interface ProjectConfig {
    rootPath?: string; // rules repository root folder, default: "rules"
    cursor?: {
        // key is the local alias (target name), value is repo url OR object with url and original rule name
        rules?: Record<string, RuleEntry>;
        plans?: Record<string, RuleEntry>;
    };
    copilot?: {
        // key is the local alias (target name), value is repo url OR object with url and original rule name
        instructions?: Record<string, RuleEntry>;
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

function legacyToNew(legacy: { rootPath?: string; rules?: Record<string, RuleEntry> }): ProjectConfig {
    return {
        rootPath: legacy.rootPath,
        cursor: {
            rules: legacy.rules || {}
        }
    };
}

function mergeCombined(main: ProjectConfig, local: ProjectConfig): ProjectConfig {
    return {
        rootPath: local.rootPath ?? main.rootPath,
        cursor: {
            rules: { ...(main.cursor?.rules || {}), ...(local.cursor?.rules || {}) },
            plans: { ...(main.cursor?.plans || {}), ...(local.cursor?.plans || {}) }
        },
        copilot: {
            instructions: { ...(main.copilot?.instructions || {}), ...(local.copilot?.instructions || {}) }
        }
    };
}

export async function getConfigSource(projectPath: string): Promise<ConfigSource> {
    if (await hasAnyNewConfig(projectPath)) return 'new';
    if (await hasAnyLegacyConfig(projectPath)) return 'legacy';
    return 'none';
}

/**
 * Read repository-side configuration (used when `projectPath` is a rules repo).
 * - Prefer new `ai-rules-sync.json`
 * - Fall back to legacy `cursor-rules.json` for rootPath only
 */
export async function getProjectConfig(projectPath: string): Promise<ProjectConfig> {
    const newPath = path.join(projectPath, CONFIG_FILENAME);
    if (await fs.pathExists(newPath)) {
        return await readConfigFile<ProjectConfig>(newPath);
    }
    const legacyPath = path.join(projectPath, LEGACY_CONFIG_FILENAME);
    if (await fs.pathExists(legacyPath)) {
        const legacy = await readConfigFile<{ rootPath?: string }>(legacyPath);
        return { rootPath: legacy.rootPath };
    }
    return {};
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

    const legacyMain = await readConfigFile<{ rootPath?: string; rules?: Record<string, RuleEntry> }>(legacyMainPath);
    const legacyLocal = await readConfigFile<{ rootPath?: string; rules?: Record<string, RuleEntry> }>(legacyLocalPath);

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

export async function addCursorDependency(projectPath: string, ruleName: string, repoUrl: string, alias?: string, isLocal: boolean = false): Promise<{ migrated: boolean }> {
    const migration = await migrateLegacyToNew(projectPath);
    const config = await readNewConfigForWrite(projectPath, isLocal);

    config.cursor ??= {};
    config.cursor.rules ??= {};

    const targetName = alias || ruleName;
    config.cursor.rules[targetName] =
        alias && alias !== ruleName
            ? { url: repoUrl, rule: ruleName }
            : repoUrl;

    await writeNewConfig(projectPath, isLocal, config);
    return migration;
}

export async function removeCursorDependency(projectPath: string, alias: string): Promise<{ removedFrom: string[]; migrated: boolean }> {
    const migration = await migrateLegacyToNew(projectPath);
    const removedFrom: string[] = [];

    const mainPath = path.join(projectPath, CONFIG_FILENAME);
    const mainConfig = await readConfigFile<ProjectConfig>(mainPath);
    if (mainConfig.cursor?.rules && mainConfig.cursor.rules[alias]) {
        delete mainConfig.cursor.rules[alias];
        await fs.writeJson(mainPath, mainConfig, { spaces: 2 });
        removedFrom.push(CONFIG_FILENAME);
    }

    const localPath = path.join(projectPath, LOCAL_CONFIG_FILENAME);
    const localConfig = await readConfigFile<ProjectConfig>(localPath);
    if (localConfig.cursor?.rules && localConfig.cursor.rules[alias]) {
        delete localConfig.cursor.rules[alias];
        await fs.writeJson(localPath, localConfig, { spaces: 2 });
        removedFrom.push(LOCAL_CONFIG_FILENAME);
    }

    return { removedFrom, migrated: migration.migrated };
}

export async function addCopilotDependency(projectPath: string, ruleName: string, repoUrl: string, alias?: string, isLocal: boolean = false): Promise<{ migrated: boolean }> {
    // If legacy exists, migrate first to avoid new-config shadowing legacy main rules.
    const migration = await migrateLegacyToNew(projectPath);
    const config = await readNewConfigForWrite(projectPath, isLocal);

    config.copilot ??= {};
    config.copilot.instructions ??= {};

    const targetName = alias || ruleName;
    config.copilot.instructions[targetName] =
        alias && alias !== ruleName
            ? { url: repoUrl, rule: ruleName }
            : repoUrl;

    await writeNewConfig(projectPath, isLocal, config);
    return migration;
}

export async function removeCopilotDependency(projectPath: string, alias: string): Promise<{ removedFrom: string[]; migrated: boolean }> {
    const migration = await migrateLegacyToNew(projectPath);
    const removedFrom: string[] = [];

    const mainPath = path.join(projectPath, CONFIG_FILENAME);
    const mainConfig = await readConfigFile<ProjectConfig>(mainPath);
    if (mainConfig.copilot?.instructions && mainConfig.copilot.instructions[alias]) {
        delete mainConfig.copilot.instructions[alias];
        await fs.writeJson(mainPath, mainConfig, { spaces: 2 });
        removedFrom.push(CONFIG_FILENAME);
    }

    const localPath = path.join(projectPath, LOCAL_CONFIG_FILENAME);
    const localConfig = await readConfigFile<ProjectConfig>(localPath);
    if (localConfig.copilot?.instructions && localConfig.copilot.instructions[alias]) {
        delete localConfig.copilot.instructions[alias];
        await fs.writeJson(localPath, localConfig, { spaces: 2 });
        removedFrom.push(LOCAL_CONFIG_FILENAME);
    }

    return { removedFrom, migrated: migration.migrated };
}

// ============ Plans support ============

export async function addPlanDependency(projectPath: string, planName: string, repoUrl: string, alias?: string, isLocal: boolean = false): Promise<{ migrated: boolean }> {
    const migration = await migrateLegacyToNew(projectPath);
    const config = await readNewConfigForWrite(projectPath, isLocal);

    config.cursor ??= {};
    config.cursor.plans ??= {};

    const targetName = alias || planName;
    config.cursor.plans[targetName] =
        alias && alias !== planName
            ? { url: repoUrl, rule: planName }
            : repoUrl;

    await writeNewConfig(projectPath, isLocal, config);
    return migration;
}

export async function removePlanDependency(projectPath: string, alias: string): Promise<{ removedFrom: string[]; migrated: boolean }> {
    const migration = await migrateLegacyToNew(projectPath);
    const removedFrom: string[] = [];

    const mainPath = path.join(projectPath, CONFIG_FILENAME);
    const mainConfig = await readConfigFile<ProjectConfig>(mainPath);
    if (mainConfig.cursor?.plans && mainConfig.cursor.plans[alias]) {
        delete mainConfig.cursor.plans[alias];
        await fs.writeJson(mainPath, mainConfig, { spaces: 2 });
        removedFrom.push(CONFIG_FILENAME);
    }

    const localPath = path.join(projectPath, LOCAL_CONFIG_FILENAME);
    const localConfig = await readConfigFile<ProjectConfig>(localPath);
    if (localConfig.cursor?.plans && localConfig.cursor.plans[alias]) {
        delete localConfig.cursor.plans[alias];
        await fs.writeJson(localPath, localConfig, { spaces: 2 });
        removedFrom.push(LOCAL_CONFIG_FILENAME);
    }

    return { removedFrom, migrated: migration.migrated };
}

// Backwards-compatible exports for existing code paths (Cursor only). These will be removed once CLI is migrated.
export async function addDependency(projectPath: string, ruleName: string, repoUrl: string, alias?: string, isLocal: boolean = false) {
    return addCursorDependency(projectPath, ruleName, repoUrl, alias, isLocal);
}

export async function removeDependency(projectPath: string, alias: string): Promise<string[]> {
    const { removedFrom } = await removeCursorDependency(projectPath, alias);
    return removedFrom;
}
