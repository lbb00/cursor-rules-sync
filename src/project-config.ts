import fs from 'fs-extra';
import path from 'path';

const CONFIG_FILENAME = 'cursor-rules.json';

export interface RuleDependency {
    rule: string;
    repoUrl: string;
}

export interface ProjectConfig {
    rules?: Record<string, string | { url: string; rule?: string }>;
    // rules: key is the local alias (target name), value is repo url OR object with url and original rule name
}

export async function getProjectConfig(projectPath: string): Promise<ProjectConfig> {
    const configPath = path.join(projectPath, CONFIG_FILENAME);
    if (await fs.pathExists(configPath)) {
        try {
            return await fs.readJson(configPath);
        } catch (e) {
            // ignore
        }
    }
    return {};
}

export async function addDependency(projectPath: string, ruleName: string, repoUrl: string, alias?: string) {
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
    } else {
        config.rules[targetName] = repoUrl;
    }

    await fs.writeJson(configPath, config, { spaces: 2 });
}

