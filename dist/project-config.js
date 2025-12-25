import fs from 'fs-extra';
import path from 'path';
const CONFIG_FILENAME = 'cursor-rules.json';
const LOCAL_CONFIG_FILENAME = 'cursor-rules.local.json';
async function readConfigFile(filePath) {
    if (await fs.pathExists(filePath)) {
        try {
            return await fs.readJson(filePath);
        }
        catch (e) {
            // ignore
        }
    }
    return {};
}
export async function getProjectConfig(projectPath) {
    return readConfigFile(path.join(projectPath, CONFIG_FILENAME));
}
export async function getCombinedProjectConfig(projectPath) {
    const main = await readConfigFile(path.join(projectPath, CONFIG_FILENAME));
    const local = await readConfigFile(path.join(projectPath, LOCAL_CONFIG_FILENAME));
    return {
        rules: { ...main.rules, ...local.rules }
    };
}
export async function addDependency(projectPath, ruleName, repoUrl, alias, isLocal = false) {
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
    }
    else {
        config.rules[targetName] = repoUrl;
    }
    await fs.writeJson(configPath, config, { spaces: 2 });
}
export async function removeDependency(projectPath, alias) {
    const removedFrom = [];
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
