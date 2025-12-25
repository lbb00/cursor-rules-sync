import fs from 'fs-extra';
import path from 'path';

const CONFIG_FILENAME = 'cursor-rules.json';
const LOCAL_CONFIG_FILENAME = 'cursor-rules.local.json';

export interface ProjectConfig {
    rules?: Record<string, string | { url: string; rule?: string }>;
    // rules: key is the local alias (target name), value is repo url OR object with url and original rule name
    rootPath?: string;
}

async function readConfigFile(filePath: string): Promise<ProjectConfig> {
    if (await fs.pathExists(filePath)) {
        try {
            return await fs.readJson(filePath);
        } catch (e) {
            // ignore
        }
    }
    return {};
}

export async function getProjectConfig(projectPath: string): Promise<ProjectConfig> {
    return readConfigFile(path.join(projectPath, CONFIG_FILENAME));
}

export async function getCombinedProjectConfig(projectPath: string): Promise<ProjectConfig> {
    const main = await readConfigFile(path.join(projectPath, CONFIG_FILENAME));
    const local = await readConfigFile(path.join(projectPath, LOCAL_CONFIG_FILENAME));

    return {
        rules: { ...main.rules, ...local.rules }
    };
}

export async function addDependency(projectPath: string, ruleName: string, repoUrl: string, alias?: string, isLocal: boolean = false) {
    const filename = isLocal ? LOCAL_CONFIG_FILENAME : CONFIG_FILENAME;
    const configPath = path.join(projectPath, filename);
    const config = await readConfigFile(configPath);

    if (!config.rules) {
        config.rules = {};
    }

    const targetName = alias || ruleName;

    if (alias && alias !== ruleName) {
         config.rules[targetName] = {
             url: repoUrl,
             rule: ruleName
         };
    } else {
        config.rules[targetName] = repoUrl;
    }

    await fs.writeJson(configPath, config, { spaces: 2 });
}

export async function removeDependency(projectPath: string, alias: string): Promise<string[]> {
    const removedFrom: string[] = [];

    // Check main config
    const mainConfigPath = path.join(projectPath, CONFIG_FILENAME);
    const mainConfig = await readConfigFile(mainConfigPath);
    if (mainConfig.rules && mainConfig.rules[alias]) {
        delete mainConfig.rules[alias];
        await fs.writeJson(mainConfigPath, mainConfig, { spaces: 2 });
        removedFrom.push(CONFIG_FILENAME);
    }

    // Check local config
    const localConfigPath = path.join(projectPath, LOCAL_CONFIG_FILENAME);
    const localConfig = await readConfigFile(localConfigPath);
    if (localConfig.rules && localConfig.rules[alias]) {
        delete localConfig.rules[alias];
        await fs.writeJson(localConfigPath, localConfig, { spaces: 2 });
        removedFrom.push(LOCAL_CONFIG_FILENAME);
    }

    return removedFrom;
}
