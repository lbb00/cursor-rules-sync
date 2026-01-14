/**
 * Generic install function that works with any adapter
 */

import path from 'path';
import chalk from 'chalk';
import fs from 'fs-extra';
import { SyncAdapter } from '../adapters/types.js';
import { getCombinedProjectConfig, getConfigSource, RuleEntry, ProjectConfig } from '../project-config.js';
import { getConfig, setConfig, getReposBaseDir, RepoConfig } from '../config.js';
import { cloneOrUpdateRepo } from '../git.js';
import { parseConfigEntry } from './helpers.js';

const LOCAL_CONFIG_FILENAME = 'ai-rules-sync.local.json';

/**
 * Read local config entries for a specific adapter
 */
async function getLocalEntries(
    projectPath: string,
    adapter: SyncAdapter
): Promise<Record<string, RuleEntry>> {
    const source = await getConfigSource(projectPath);
    const localFileName = source === 'new' ? 'ai-rules-sync.local.json' : 'cursor-rules.local.json';
    const localPath = path.join(projectPath, localFileName);

    if (!await fs.pathExists(localPath)) {
        return {};
    }

    try {
        const raw = await fs.readJson(localPath);
        const [topLevel, subLevel] = adapter.configPath;

        if (source === 'new') {
            return (raw as any)?.[topLevel]?.[subLevel] || {};
        } else {
            // Legacy format only has cursor.rules
            return adapter.configPath[0] === 'cursor' && adapter.configPath[1] === 'rules'
                ? (raw?.rules || {})
                : {};
        }
    } catch {
        return {};
    }
}

/**
 * Find or create a repo configuration
 */
async function findOrCreateRepo(
    repos: Record<string, RepoConfig>,
    repoUrl: string,
    entryName: string
): Promise<RepoConfig> {
    // Check if repo already exists
    for (const k in repos) {
        if (repos[k].url === repoUrl) {
            const repo = repos[k];
            if (!await fs.pathExists(repo.path)) {
                await cloneOrUpdateRepo(repo);
            }
            return repo;
        }
    }

    // Create new repo config
    console.log(chalk.yellow(`Repository for ${entryName} not found locally. Configuring...`));

    let name = path.basename(repoUrl, '.git');
    if (!name) name = `repo-${Date.now()}`;
    if (repos[name]) name = `${name}-${Date.now()}`;

    const repoDir = path.join(getReposBaseDir(), name);
    const repoConfig: RepoConfig = { name, url: repoUrl, path: repoDir };

    await setConfig({ repos: { ...repos, [name]: repoConfig } });
    repos[name] = repoConfig;
    await cloneOrUpdateRepo(repoConfig);

    return repoConfig;
}

/**
 * Get entries from project config for a specific adapter
 */
function getEntriesFromConfig(
    config: ProjectConfig,
    adapter: SyncAdapter
): Record<string, RuleEntry> | undefined {
    const [topLevel, subLevel] = adapter.configPath;
    return (config as any)?.[topLevel]?.[subLevel];
}

/**
 * Generic install function - works with any adapter
 */
export async function installEntriesForAdapter(
    adapter: SyncAdapter,
    projectPath: string
): Promise<void> {
    const config = await getCombinedProjectConfig(projectPath);
    const entries = getEntriesFromConfig(config, adapter);

    if (!entries || Object.keys(entries).length === 0) {
        console.log(chalk.yellow(`No ${adapter.tool} ${adapter.subtype} found in ai-rules-sync*.json.`));
        return;
    }

    const globalConfig = await getConfig();
    const repos = globalConfig.repos || {};

    // Get local entries to determine isLocal flag
    const localEntries = await getLocalEntries(projectPath, adapter);

    for (const [key, value] of Object.entries(entries)) {
        const { repoUrl, entryName, alias } = parseConfigEntry(key, value);

        console.log(chalk.blue(`Installing ${adapter.tool} ${adapter.subtype} "${entryName}" (as "${key}") from ${repoUrl}...`));

        const repoConfig = await findOrCreateRepo(repos, repoUrl, entryName);
        const isLocal = Object.prototype.hasOwnProperty.call(localEntries, key);

        await adapter.link({
            projectPath,
            name: entryName,
            repo: repoConfig,
            alias,
            isLocal
        });
    }

    console.log(chalk.green(`All ${adapter.tool} ${adapter.subtype} installed successfully.`));
}

/**
 * Install all entries for a tool (all subtypes)
 */
export async function installEntriesForTool(
    adapters: SyncAdapter[],
    projectPath: string
): Promise<void> {
    for (const adapter of adapters) {
        await installEntriesForAdapter(adapter, projectPath);
    }
}
