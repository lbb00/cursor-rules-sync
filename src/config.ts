import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.ai-rules-sync');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const REPOS_BASE_DIR = path.join(CONFIG_DIR, 'repos');

export interface RepoConfig {
  url: string;
  name: string;
  path: string;
}

export interface Config {
  currentRepo?: string; // name of the current repo
  repos: Record<string, RepoConfig>;
  completionInstalled?: boolean; // whether shell completion setup has been handled
  // Deprecated field for migration
  repoUrl?: string;
}

export async function getConfig(): Promise<Config> {
  try {
    if (await fs.pathExists(CONFIG_FILE)) {
      const config = await fs.readJson(CONFIG_FILE);

      // Migration logic for old config format
      if (config.repoUrl && !config.repos) {
        const defaultName = 'default';
        const defaultPath = path.join(REPOS_BASE_DIR, defaultName);

        // Move old repo dir if exists
        const oldRepoDir = path.join(CONFIG_DIR, 'repo');
        if (await fs.pathExists(oldRepoDir)) {
          await fs.ensureDir(REPOS_BASE_DIR);
          if (!await fs.pathExists(defaultPath)) {
             await fs.move(oldRepoDir, defaultPath);
          }
        }

        return {
          currentRepo: defaultName,
          repos: {
            [defaultName]: {
              name: defaultName,
              url: config.repoUrl,
              path: defaultPath
            }
          }
        };
      }
      return config;
    }
  } catch (error) {
    // ignore error
  }
  return { repos: {} };
}

export async function setConfig(config: Partial<Config>) {
  await fs.ensureDir(CONFIG_DIR);
  const current = await getConfig();
  const newConfig = { ...current, ...config } as Config;

  // Ensure repos object exists if not present
  if (!newConfig.repos) {
      newConfig.repos = {};
  }

  // Clean up deprecated field
  if ('repoUrl' in newConfig) {
    delete (newConfig as any).repoUrl;
  }

  await fs.writeJson(CONFIG_FILE, newConfig, { spaces: 2 });
}

export function getReposBaseDir() {
  return REPOS_BASE_DIR;
}

export async function getCurrentRepo(): Promise<RepoConfig | null> {
  const config = await getConfig();
  if (config.currentRepo && config.repos && config.repos[config.currentRepo]) {
    return config.repos[config.currentRepo];
  }
  return null;
}
