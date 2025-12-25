import fs from 'fs-extra';
import path from 'path';
const CONFIG_FILENAME = 'cursor-rules.json';
export async function getProjectConfig(projectPath) {
    const configPath = path.join(projectPath, CONFIG_FILENAME);
    if (await fs.pathExists(configPath)) {
        try {
            return await fs.readJson(configPath);
        }
        catch (e) {
            // ignore
        }
    }
    return {};
}
export async function addDependency(projectPath, ruleName, repoUrl, alias) {
    const configPath = path.join(projectPath, CONFIG_FILENAME);
    const config = await getProjectConfig(projectPath);
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
