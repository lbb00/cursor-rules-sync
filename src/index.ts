#!/usr/bin/env node
import { Command } from 'commander'
import chalk from 'chalk'
import path from 'path'
import fs from 'fs-extra'
import { getConfig, setConfig, getReposBaseDir, getCurrentRepo, RepoConfig } from './config.js'
import { cloneOrUpdateRepo, runGitCommand } from './git.js'
import { linkCopilotInstruction, linkRule, unlinkCopilotInstruction, unlinkRule, linkCursorCommand, unlinkCursorCommand, linkCursorSkill, unlinkCursorSkill, linkClaudeSkill, unlinkClaudeSkill, linkClaudeAgent, unlinkClaudeAgent } from './link.js'
import { addIgnoreEntry } from './utils.js'
import { addCopilotDependency, addCursorDependency, removeCopilotDependency, removeCursorDependency, getCombinedProjectConfig, getConfigSource, getRepoSourceConfig, getSourceDir, addCursorCommandDependency, removeCursorCommandDependency, addCursorSkillDependency, removeCursorSkillDependency, addClaudeSkillDependency, removeClaudeSkillDependency, addClaudeAgentDependency, removeClaudeAgentDependency } from './project-config.js'
import { stripCopilotSuffix, adapterRegistry, getAdapter } from './adapters/index.js'
import { checkAndPromptCompletion, forceInstallCompletion } from './completion.js'
import { importEntry } from './sync-engine.js'

const program = new Command()

program.name('ais').description('AI Rules Sync - Sync agent rules from git repository').version('1.0.0')
    .option('-t, --target <repoName>', 'Specify target rule repository (name or URL)');

// Helper to get repo config
async function getTargetRepo(options: any): Promise<RepoConfig> {
  const config = await getConfig();

  if (options.target) {
    const target = options.target;

    // 1. Try as existing name
    if (config.repos && config.repos[target]) {
      return config.repos[target];
    }

    // 2. Try as URL
    if (target.includes('://') || target.includes('git@') || target.endsWith('.git')) {
        // Check if this URL is already configured under ANY name
        if (config.repos) {
            for (const [key, repo] of Object.entries(config.repos)) {
                if (repo.url === target) {
                    return repo;
                }
            }
        }

        // Not found, add it
        console.log(chalk.blue(`Detected URL for target. Configuring repository...`));

        let name = path.basename(target, '.git');
        if (!name) name = 'repo-' + Date.now();

        // Handle name collision: if name exists but URL differs, append suffix
        if (config.repos && config.repos[name] && config.repos[name].url !== target) {
            name = `${name}-${Date.now()}`;
        }

        const repoDir = path.join(getReposBaseDir(), name);
        const newRepo: RepoConfig = {
            name,
            url: target,
            path: repoDir
        };

        await setConfig({
            repos: { ...(config.repos || {}), [name]: newRepo }
        });

        await cloneOrUpdateRepo(newRepo);
        return newRepo;
    }

    throw new Error(`Repository "${target}" not found in configuration.`);
  }

  const currentRepo = await getCurrentRepo();
  if (!currentRepo) {
    throw new Error('No repository configured. Please run "ais use [url]" first.');
  }
  return currentRepo;
}

type DefaultMode = 'cursor' | 'copilot' | 'claude' | 'ambiguous' | 'none';

async function inferDefaultMode(projectPath: string): Promise<DefaultMode> {
  const cfg = await getCombinedProjectConfig(projectPath);
  const cursorCount = Object.keys(cfg.cursor?.rules || {}).length + Object.keys(cfg.cursor?.commands || {}).length + Object.keys(cfg.cursor?.skills || {}).length;
  const copilotCount = Object.keys(cfg.copilot?.instructions || {}).length;
  const claudeCount = Object.keys(cfg.claude?.skills || {}).length + Object.keys(cfg.claude?.agents || {}).length;

  if (cursorCount > 0 && copilotCount === 0 && claudeCount === 0) return 'cursor';
  if (copilotCount > 0 && cursorCount === 0 && claudeCount === 0) return 'copilot';
  if (claudeCount > 0 && cursorCount === 0 && copilotCount === 0) return 'claude';
  if (cursorCount === 0 && copilotCount === 0 && claudeCount === 0) return 'none';
  return 'ambiguous';
}

function requireExplicitMode(mode: DefaultMode): never {
  if (mode === 'ambiguous') {
    throw new Error('Multiple tool configs exist in this project. Please use "ais cursor ...", "ais copilot ...", or "ais claude ..." explicitly.');
  }
  throw new Error('No default mode could be inferred. Please use "ais cursor ...", "ais copilot ...", or "ais claude ..." explicitly.');
}

async function installCursorRules(projectPath: string): Promise<void> {
  const config = await getCombinedProjectConfig(projectPath)
  const rules = config.cursor?.rules

  if (!rules || Object.keys(rules).length === 0) {
    console.log(chalk.yellow('No Cursor rules found in ai-rules-sync*.json (or legacy cursor-rules*.json).'))
    return
  }

  const globalConfig = await getConfig()
  const repos = globalConfig.repos || {}

  const source = await getConfigSource(projectPath)
  const localFileName = source === 'new' ? 'ai-rules-sync.local.json' : 'cursor-rules.local.json'
  let localCursorRules: any = {}
  const localPath = path.join(projectPath, localFileName)
  if (await fs.pathExists(localPath)) {
    try {
      const raw = await fs.readJson(localPath)
      localCursorRules = source === 'new' ? (raw?.cursor?.rules || {}) : (raw?.rules || {})
    } catch {
      localCursorRules = {}
    }
  }

  for (const [key, value] of Object.entries(rules)) {
    let repoUrl: string;
    let ruleName: string;
    let alias: string | undefined;

    if (typeof value === 'string') {
      repoUrl = value;
      ruleName = key;
      alias = undefined;
    } else {
      repoUrl = (value as any).url;
      ruleName = (value as any).rule || key;
      alias = key;
    }

    console.log(chalk.blue(`Installing Cursor rule "${ruleName}" (as "${key}") from ${repoUrl}...`))

    let repoConfig: RepoConfig | undefined
    for (const k in repos) {
      if (repos[k].url === repoUrl) {
        repoConfig = repos[k]
        break
      }
    }

    if (!repoConfig) {
      console.log(chalk.yellow(`Repository for ${ruleName} not found locally. Configuring...`))

      let name = path.basename(repoUrl, '.git')
      if (!name) name = `repo-${Date.now()}`
      if (repos[name]) name = `${name}-${Date.now()}`

      const repoDir = path.join(getReposBaseDir(), name)
      repoConfig = { name, url: repoUrl, path: repoDir }

      await setConfig({ repos: { ...repos, [name]: repoConfig } })
      repos[name] = repoConfig
      await cloneOrUpdateRepo(repoConfig)
    } else {
      if (!(await fs.pathExists(repoConfig.path))) {
        await cloneOrUpdateRepo(repoConfig)
      }
    }

    const isLocal = Object.prototype.hasOwnProperty.call(localCursorRules || {}, key)
    await linkRule(projectPath, ruleName, repoConfig, alias, isLocal)
  }

  console.log(chalk.green('All Cursor rules installed successfully.'))
}

async function installCursorCommands(projectPath: string): Promise<void> {
  const config = await getCombinedProjectConfig(projectPath)
  const commands = config.cursor?.commands

  if (!commands || Object.keys(commands).length === 0) {
    console.log(chalk.yellow('No Cursor commands found in ai-rules-sync*.json.'))
    return
  }

  const globalConfig = await getConfig()
  const repos = globalConfig.repos || {}

  const source = await getConfigSource(projectPath)
  const localFileName = source === 'new' ? 'ai-rules-sync.local.json' : 'cursor-rules.local.json'
  let localCommands: any = {}
  const localPath = path.join(projectPath, localFileName)
  if (await fs.pathExists(localPath)) {
    try {
      const raw = await fs.readJson(localPath)
      localCommands = source === 'new' ? (raw?.cursor?.commands || {}) : {}
    } catch {
      localCommands = {}
    }
  }

  for (const [key, value] of Object.entries(commands)) {
    let repoUrl: string;
    let commandName: string;
    let alias: string | undefined;

    if (typeof value === 'string') {
      repoUrl = value;
      commandName = key;
      alias = undefined;
    } else {
      repoUrl = (value as any).url;
      commandName = (value as any).rule || key;
      alias = key;
    }

    console.log(chalk.blue(`Installing Cursor command "${commandName}" (as "${key}") from ${repoUrl}...`))

    let repoConfig: RepoConfig | undefined
    for (const k in repos) {
      if (repos[k].url === repoUrl) {
        repoConfig = repos[k]
        break
      }
    }

    if (!repoConfig) {
      console.log(chalk.yellow(`Repository for ${commandName} not found locally. Configuring...`))

      let name = path.basename(repoUrl, '.git')
      if (!name) name = `repo-${Date.now()}`
      if (repos[name]) name = `${name}-${Date.now()}`

      const repoDir = path.join(getReposBaseDir(), name)
      repoConfig = { name, url: repoUrl, path: repoDir }

      await setConfig({ repos: { ...repos, [name]: repoConfig } })
      repos[name] = repoConfig
      await cloneOrUpdateRepo(repoConfig)
    } else {
      if (!(await fs.pathExists(repoConfig.path))) {
        await cloneOrUpdateRepo(repoConfig)
      }
    }

    const isLocal = Object.prototype.hasOwnProperty.call(localCommands || {}, key)
    const { sourceName, targetName } = await linkCursorCommand(projectPath, commandName, repoConfig, alias, isLocal)

    const depAlias = targetName === sourceName ? undefined : targetName;
    await addCursorCommandDependency(projectPath, sourceName, repoConfig.url, depAlias, isLocal);
  }

  console.log(chalk.green('All Cursor commands installed successfully.'))
}

async function installCopilotInstructions(projectPath: string): Promise<void> {
  const config = await getCombinedProjectConfig(projectPath)
  const instructions = config.copilot?.instructions

  if (!instructions || Object.keys(instructions).length === 0) {
    console.log(chalk.yellow('No Copilot instructions found in ai-rules-sync*.json.'))
    return
  }

  const globalConfig = await getConfig()
  const repos = globalConfig.repos || {}

  const source = await getConfigSource(projectPath)
  const localFileName = source === 'new' ? 'ai-rules-sync.local.json' : 'cursor-rules.local.json'
  let localInstructions: any = {}
  const localPath = path.join(projectPath, localFileName)
  if (await fs.pathExists(localPath)) {
    try {
      const raw = await fs.readJson(localPath)
      localInstructions = source === 'new' ? (raw?.copilot?.instructions || {}) : {}
    } catch {
      localInstructions = {}
    }
  }

  for (const [key, value] of Object.entries(instructions)) {
    let repoUrl: string;
    let ruleName: string;
    let alias: string | undefined;

    if (typeof value === 'string') {
      repoUrl = value;
      ruleName = key;
      alias = undefined;
    } else {
      repoUrl = (value as any).url;
      ruleName = (value as any).rule || key;
      alias = key;
    }

    console.log(chalk.blue(`Installing Copilot instruction "${ruleName}" (as "${key}") from ${repoUrl}...`))

    let repoConfig: RepoConfig | undefined
    for (const k in repos) {
      if (repos[k].url === repoUrl) {
        repoConfig = repos[k]
        break
      }
    }

    if (!repoConfig) {
      console.log(chalk.yellow(`Repository for ${ruleName} not found locally. Configuring...`))

      let name = path.basename(repoUrl, '.git')
      if (!name) name = `repo-${Date.now()}`
      if (repos[name]) name = `${name}-${Date.now()}`

      const repoDir = path.join(getReposBaseDir(), name)
      repoConfig = { name, url: repoUrl, path: repoDir }

      await setConfig({ repos: { ...repos, [name]: repoConfig } })
      repos[name] = repoConfig
      await cloneOrUpdateRepo(repoConfig)
    }

    await linkCopilotInstruction(projectPath, ruleName, repoConfig, alias)
  }

  console.log(chalk.green('All Copilot instructions installed successfully.'))
}

async function installClaudeSkills(projectPath: string): Promise<void> {
  const config = await getCombinedProjectConfig(projectPath)
  const skills = config.claude?.skills

  if (!skills || Object.keys(skills).length === 0) {
    console.log(chalk.yellow('No Claude skills found in ai-rules-sync*.json.'))
    return
  }

  const globalConfig = await getConfig()
  const repos = globalConfig.repos || {}

  const source = await getConfigSource(projectPath)
  const localFileName = source === 'new' ? 'ai-rules-sync.local.json' : 'cursor-rules.local.json'
  let localSkills: any = {}
  const localPath = path.join(projectPath, localFileName)
  if (await fs.pathExists(localPath)) {
    try {
      const raw = await fs.readJson(localPath)
      localSkills = source === 'new' ? (raw?.claude?.skills || {}) : {}
    } catch {
      localSkills = {}
    }
  }

  for (const [key, value] of Object.entries(skills)) {
    let repoUrl: string;
    let skillName: string;
    let alias: string | undefined;

    if (typeof value === 'string') {
      repoUrl = value;
      skillName = key;
      alias = undefined;
    } else {
      repoUrl = (value as any).url;
      skillName = (value as any).rule || key;
      alias = key;
    }

    console.log(chalk.blue(`Installing Claude skill "${skillName}" (as "${key}") from ${repoUrl}...`))

    let repoConfig: RepoConfig | undefined
    for (const k in repos) {
      if (repos[k].url === repoUrl) {
        repoConfig = repos[k]
        break
      }
    }

    if (!repoConfig) {
      console.log(chalk.yellow(`Repository for ${skillName} not found locally. Configuring...`))

      let name = path.basename(repoUrl, '.git')
      if (!name) name = `repo-${Date.now()}`
      if (repos[name]) name = `${name}-${Date.now()}`

      const repoDir = path.join(getReposBaseDir(), name)
      repoConfig = { name, url: repoUrl, path: repoDir }

      await setConfig({ repos: { ...repos, [name]: repoConfig } })
      repos[name] = repoConfig
      await cloneOrUpdateRepo(repoConfig)
    } else {
      if (!(await fs.pathExists(repoConfig.path))) {
        await cloneOrUpdateRepo(repoConfig)
      }
    }

    const isLocal = Object.prototype.hasOwnProperty.call(localSkills || {}, key)
    await linkClaudeSkill(projectPath, skillName, repoConfig, alias, isLocal)
  }

  console.log(chalk.green('All Claude skills installed successfully.'))
}

async function installClaudeAgents(projectPath: string): Promise<void> {
  const config = await getCombinedProjectConfig(projectPath)
  const agents = config.claude?.agents

  if (!agents || Object.keys(agents).length === 0) {
    console.log(chalk.yellow('No Claude agents found in ai-rules-sync*.json.'))
    return
  }

  const globalConfig = await getConfig()
  const repos = globalConfig.repos || {}

  const source = await getConfigSource(projectPath)
  const localFileName = source === 'new' ? 'ai-rules-sync.local.json' : 'cursor-rules.local.json'
  let localAgents: any = {}
  const localPath = path.join(projectPath, localFileName)
  if (await fs.pathExists(localPath)) {
    try {
      const raw = await fs.readJson(localPath)
      localAgents = source === 'new' ? (raw?.claude?.agents || {}) : {}
    } catch {
      localAgents = {}
    }
  }

  for (const [key, value] of Object.entries(agents)) {
    let repoUrl: string;
    let agentName: string;
    let alias: string | undefined;

    if (typeof value === 'string') {
      repoUrl = value;
      agentName = key;
      alias = undefined;
    } else {
      repoUrl = (value as any).url;
      agentName = (value as any).rule || key;
      alias = key;
    }

    console.log(chalk.blue(`Installing Claude agent "${agentName}" (as "${key}") from ${repoUrl}...`))

    let repoConfig: RepoConfig | undefined
    for (const k in repos) {
      if (repos[k].url === repoUrl) {
        repoConfig = repos[k]
        break
      }
    }

    if (!repoConfig) {
      console.log(chalk.yellow(`Repository for ${agentName} not found locally. Configuring...`))

      let name = path.basename(repoUrl, '.git')
      if (!name) name = `repo-${Date.now()}`
      if (repos[name]) name = `${name}-${Date.now()}`

      const repoDir = path.join(getReposBaseDir(), name)
      repoConfig = { name, url: repoUrl, path: repoDir }

      await setConfig({ repos: { ...repos, [name]: repoConfig } })
      repos[name] = repoConfig
      await cloneOrUpdateRepo(repoConfig)
    } else {
      if (!(await fs.pathExists(repoConfig.path))) {
        await cloneOrUpdateRepo(repoConfig)
      }
    }

    const isLocal = Object.prototype.hasOwnProperty.call(localAgents || {}, key)
    await linkClaudeAgent(projectPath, agentName, repoConfig, alias, isLocal)
  }

  console.log(chalk.green('All Claude agents installed successfully.'))
}

async function installCursorSkills(projectPath: string): Promise<void> {
  const config = await getCombinedProjectConfig(projectPath)
  const skills = config.cursor?.skills

  if (!skills || Object.keys(skills).length === 0) {
    console.log(chalk.yellow('No Cursor skills found in ai-rules-sync*.json.'))
    return
  }

  const globalConfig = await getConfig()
  const repos = globalConfig.repos || {}

  const source = await getConfigSource(projectPath)
  const localFileName = source === 'new' ? 'ai-rules-sync.local.json' : 'cursor-rules.local.json'
  let localSkills: any = {}
  const localPath = path.join(projectPath, localFileName)
  if (await fs.pathExists(localPath)) {
    try {
      const raw = await fs.readJson(localPath)
      localSkills = source === 'new' ? (raw?.cursor?.skills || {}) : {}
    } catch {
      localSkills = {}
    }
  }

  for (const [key, value] of Object.entries(skills)) {
    let repoUrl: string;
    let skillName: string;
    let alias: string | undefined;

    if (typeof value === 'string') {
      repoUrl = value;
      skillName = key;
      alias = undefined;
    } else {
      repoUrl = (value as any).url;
      skillName = (value as any).rule || key;
      alias = key;
    }

    console.log(chalk.blue(`Installing Cursor skill "${skillName}" (as "${key}") from ${repoUrl}...`))

    let repoConfig: RepoConfig | undefined
    for (const k in repos) {
      if (repos[k].url === repoUrl) {
        repoConfig = repos[k]
        break
      }
    }

    if (!repoConfig) {
      console.log(chalk.yellow(`Repository for ${skillName} not found locally. Configuring...`))

      let name = path.basename(repoUrl, '.git')
      if (!name) name = `repo-${Date.now()}`
      if (repos[name]) name = `${name}-${Date.now()}`

      const repoDir = path.join(getReposBaseDir(), name)
      repoConfig = { name, url: repoUrl, path: repoDir }

      await setConfig({ repos: { ...repos, [name]: repoConfig } })
      repos[name] = repoConfig
      await cloneOrUpdateRepo(repoConfig)
    } else {
      if (!(await fs.pathExists(repoConfig.path))) {
        await cloneOrUpdateRepo(repoConfig)
      }
    }

    const isLocal = Object.prototype.hasOwnProperty.call(localSkills || {}, key)
    await linkCursorSkill(projectPath, skillName, repoConfig, alias, isLocal)
  }

  console.log(chalk.green('All Cursor skills installed successfully.'))
}

function resolveCopilotAliasFromConfig(input: string, keys: string[]): string {
  if (input.endsWith('.md') || input.endsWith('.instructions.md')) return input;
  const matches = keys.filter(k => stripCopilotSuffix(k) === input);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`Alias "${input}" matches multiple Copilot entries: ${matches.join(', ')}. Please specify the suffix explicitly.`);
  return input;
}

function stripCommandSuffix(name: string): string {
  if (name.endsWith('.md')) return name.slice(0, -'.md'.length);
  return name;
}

function resolveCommandAliasFromConfig(input: string, keys: string[]): string {
  if (input.endsWith('.md')) return input;
  const matches = keys.filter(k => stripCommandSuffix(k) === input);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`Alias "${input}" matches multiple command entries: ${matches.join(', ')}. Please specify the suffix explicitly.`);
  return input;
}

program
  .command('use')
  .description('Config cursor rules git repository')
  .argument('[urlOrName]', 'Git repository URL or response name')
  .action(async (urlOrName) => {
    try {
      const config = await getConfig()

      // Case 1: No argument provided
      if (!urlOrName) {
        if (config.currentRepo) {
          console.log(chalk.blue(`Current repository: ${config.currentRepo} (${config.repos[config.currentRepo].url})`))
          return
        } else {
          console.error(chalk.red('Error: Please provide a git repository URL or name.'))
          process.exit(1)
        }
      }

      // Case 2: Argument is a known name in config
      if (config.repos && config.repos[urlOrName]) {
        await setConfig({ currentRepo: urlOrName })
        console.log(chalk.green(`Switched to repository: ${urlOrName}`))
        await cloneOrUpdateRepo(config.repos[urlOrName])
        return
      }

      // Case 3: Argument is a URL (or new name)
      const isUrl = urlOrName.includes('://') || urlOrName.includes('git@') || urlOrName.endsWith('.git')

      if (isUrl) {
        const url = urlOrName
        let name = path.basename(url, '.git')
        if (!name) name = 'default'

        // Check if name conflict
        if (config.repos && config.repos[name] && config.repos[name].url !== url) {
          console.log(chalk.yellow(`Warning: Repository with name "${name}" already exists. Overwriting...`))
        }

        const repoDir = path.join(getReposBaseDir(), name)

        const newRepo: RepoConfig = {
          name,
          url,
          path: repoDir,
        }

        const newRepos = { ...(config.repos || {}), [name]: newRepo }
        await setConfig({
          currentRepo: name,
          repos: newRepos,
        })

        console.log(chalk.green(`Configured repository: ${name} (${url})`))
        await cloneOrUpdateRepo(newRepo)
        console.log(chalk.green('Repository ready.'))
      } else {
        // Provided argument is not a URL and not found in config
        console.error(chalk.red(`Error: Repository "${urlOrName}" not found in configuration.`))
        console.log(chalk.yellow(`Use "ais use <url>" to add a new repository.`))
        process.exit(1)
      }
    } catch (error: any) {
      console.error(chalk.red('Error configuring repository:'), error.message)
      process.exit(1)
    }
  })

program
  .command('list')
  .description('List all cursor rules git repositories')
  .action(async () => {
    const config = await getConfig()
    const repos = config.repos || {}
    const names = Object.keys(repos)

    if (names.length === 0) {
      console.log(chalk.yellow('No repositories configured. Use "ais use [url]" to configure.'))
      return
    }

    console.log(chalk.bold('Configured repositories:'))
    for (const name of names) {
      const repo = repos[name]
      const isCurrent = name === config.currentRepo
      const prefix = isCurrent ? chalk.green('* ') : '  '
      console.log(`${prefix}${chalk.cyan(name)} ${chalk.gray(`(${repo.url})`)}`)
      if (isCurrent) {
        console.log(`    Local path: ${repo.path}`)
      }
    }
  })

// Top-level shortcuts: allowed ONLY when the project config implies a single mode.
program
  .command('add')
  .description('Add an entry (auto-detects cursor/copilot if unambiguous)')
  .argument('<name>', 'Rule/Instruction name in the rules repo')
  .argument('[alias]', 'Alias in the project')
  .option('-l, --local', 'Add to ai-rules-sync.local.json (private)')
  .action(async (name, alias, options) => {
    try {
      const projectPath = process.cwd();
      const mode = await inferDefaultMode(projectPath);
      if (mode === 'none' || mode === 'ambiguous') requireExplicitMode(mode);

      const opts = program.opts();
      const currentRepo = await getTargetRepo(opts);
      const isLocal = options.local;

      if (mode === 'cursor') {
        await linkRule(projectPath, name, currentRepo, alias, isLocal);
        const { migrated } = await addCursorDependency(projectPath, name, currentRepo.url, alias, isLocal);
        if (migrated) {
          console.log(chalk.yellow('Detected legacy "cursor-rules*.json". Migrated to "ai-rules-sync*.json". Consider deleting the legacy files to avoid ambiguity.'))
        }
      } else if (mode === 'copilot') {
        const { sourceName, targetName } = await linkCopilotInstruction(projectPath, name, currentRepo, alias, isLocal);
        const depAlias = targetName === sourceName ? undefined : targetName;
        const { migrated } = await addCopilotDependency(projectPath, sourceName, currentRepo.url, depAlias, isLocal);
        if (migrated) {
          console.log(chalk.yellow('Detected legacy "cursor-rules*.json". Migrated to "ai-rules-sync*.json". Consider deleting the legacy files to avoid ambiguity.'))
        }
      } else if (mode === 'claude') {
        // For Claude, we need to determine the subtype from the name or context
        // For now, we'll require explicit commands for Claude components
        throw new Error('For Claude components, please use "ais claude skills/agents/plugins add" explicitly.');
      }

      if (isLocal) {
        const gitignorePath = path.join(projectPath, '.gitignore');
        const added = await addIgnoreEntry(gitignorePath, 'ai-rules-sync.local.json', '# Local AI Rules Sync Config');
        if (added) {
          console.log(chalk.green(`Added "ai-rules-sync.local.json" to .gitignore.`));
        }
      }
    } catch (error: any) {
      console.error(chalk.red('Error adding entry:'), error.message)
      process.exit(1)
    }
  })

program
  .command('remove')
  .description('Remove an entry (auto-detects cursor/copilot if unambiguous)')
  .argument('<alias>', 'Alias/name in the project to remove')
  .action(async (alias) => {
    try {
      const projectPath = process.cwd();
      const cfg = await getCombinedProjectConfig(projectPath);

      const inCursor = Object.prototype.hasOwnProperty.call(cfg.cursor?.rules || {}, alias) ||
                       Object.prototype.hasOwnProperty.call(cfg.cursor?.commands || {}, alias) ||
                       Object.prototype.hasOwnProperty.call(cfg.cursor?.skills || {}, alias);
      const inCopilot = Object.prototype.hasOwnProperty.call(cfg.copilot?.instructions || {}, alias);
      const inClaude = Object.prototype.hasOwnProperty.call(cfg.claude?.skills || {}, alias) ||
                       Object.prototype.hasOwnProperty.call(cfg.claude?.agents || {}, alias);

      const toolCount = [inCursor, inCopilot, inClaude].filter(Boolean).length;
      if (toolCount > 1) {
        throw new Error(`Alias "${alias}" exists in multiple tool configs. Please use explicit commands.`);
      }

      let mode: DefaultMode = 'none';
      if (inCursor) mode = 'cursor';
      else if (inCopilot) mode = 'copilot';
      else if (inClaude) mode = 'claude';
      else mode = await inferDefaultMode(projectPath);

      if (mode === 'none' || mode === 'ambiguous') requireExplicitMode(mode);

      if (mode === 'cursor') {
        await unlinkRule(projectPath, alias);
        const { migrated } = await removeCursorDependency(projectPath, alias);
        if (migrated) {
          console.log(chalk.yellow('Detected legacy "cursor-rules*.json". Migrated to "ai-rules-sync*.json". Consider deleting the legacy files to avoid ambiguity.'))
        }
      } else if (mode === 'copilot') {
        const resolved = resolveCopilotAliasFromConfig(alias, Object.keys(cfg.copilot?.instructions || {}));
        await unlinkCopilotInstruction(projectPath, resolved);
        const { migrated } = await removeCopilotDependency(projectPath, resolved);
        if (migrated) {
          console.log(chalk.yellow('Detected legacy "cursor-rules*.json". Migrated to "ai-rules-sync*.json". Consider deleting the legacy files to avoid ambiguity.'))
        }
      } else if (mode === 'claude') {
        // Try all two subtypes to ensure consistency with explicit commands
        const subtypes = [
          { key: 'skills', unlink: unlinkClaudeSkill, remove: removeClaudeSkillDependency, name: 'skill' },
          { key: 'agents', unlink: unlinkClaudeAgent, remove: removeClaudeAgentDependency, name: 'agent' }
        ] as const;

        let foundAny = false;
        let anyMigrated = false;

        for (const subtype of subtypes) {
          // Always try to unlink (handles symlinks that exist without config entry)
          await subtype.unlink(projectPath, alias);

          // Always try to remove from config
          const { removedFrom, migrated } = await subtype.remove(projectPath, alias);

          if (removedFrom.length > 0) {
            foundAny = true;
            console.log(chalk.green(`Removed ${subtype.name} "${alias}" from configuration: ${removedFrom.join(', ')}`));
          }

          if (migrated) anyMigrated = true;
        }

        // Provide feedback if nothing was found
        if (!foundAny) {
          console.log(chalk.yellow(`Claude entry "${alias}" was not found in any configuration file.`));
        }

        if (anyMigrated) {
          console.log(chalk.yellow('Detected legacy "cursor-rules*.json". Migrated to "ai-rules-sync*.json". Consider deleting the legacy files to avoid ambiguity.'))
        }
      }
    } catch (error: any) {
      console.error(chalk.red('Error removing entry:'), error.message)
      process.exit(1)
    }
  })

program
  .command('install')
  .description('Install all entries from config (cursor + copilot)')
  .action(async () => {
    try {
      const projectPath = process.cwd();
      const mode = await inferDefaultMode(projectPath);

      if (mode === 'none') {
        console.log(chalk.yellow('No Cursor or Copilot config found in ai-rules-sync*.json (or legacy cursor-rules*.json).'))
        return
      }

      if (mode === 'cursor' || mode === 'ambiguous') {
        await installCursorRules(projectPath)
        await installCursorCommands(projectPath)
        await installCursorSkills(projectPath)
      }
      if (mode === 'copilot' || mode === 'ambiguous') {
        await installCopilotInstructions(projectPath)
      }
      if (mode === 'claude' || mode === 'ambiguous') {
        await installClaudeSkills(projectPath)
        await installClaudeAgents(projectPath)
      }
    } catch (error: any) {
      console.error(chalk.red('Error installing entries:'), error.message)
      process.exit(1)
    }
  })

program
  .command('import <name>')
  .description('Import an existing file/directory to rules repository (auto-detects tool)')
  .option('-l, --local', 'Add to ai-rules-sync.local.json (private)')
  .option('-m, --message <message>', 'Custom git commit message')
  .option('-f, --force', 'Overwrite if entry already exists in repository')
  .option('-p, --push', 'Push to remote repository after commit')
  .action(async (name, options) => {
    try {
      const projectPath = process.cwd();
      const opts = program.opts();
      const currentRepo = await getTargetRepo(opts);

      // Try to find the entry in project directories
      let foundAdapter = null;
      const allAdapters = adapterRegistry.all();

      for (const adapter of allAdapters) {
        const targetPath = path.join(projectPath, adapter.targetDir, name);
        if (await fs.pathExists(targetPath)) {
          foundAdapter = adapter;
          break;
        }
      }

      if (!foundAdapter) {
        throw new Error(`Entry "${name}" not found in any known location. Try specifying the tool explicitly: ais import cursor ${name}`);
      }

      console.log(chalk.gray(`Detected ${foundAdapter.tool} ${foundAdapter.subtype}: ${name}`));
      console.log(chalk.gray(`Using repository: ${chalk.cyan(currentRepo.name)} (${currentRepo.url})`));

      await importEntry(foundAdapter, {
        projectPath,
        name,
        repo: currentRepo,
        isLocal: options.local,
        commitMessage: options.message,
        force: options.force,
        push: options.push
      });

      // Add to config
      await foundAdapter.addDependency(projectPath, name, currentRepo.url, undefined, options.local);
      const configFileName = options.local ? 'ai-rules-sync.local.json' : 'ai-rules-sync.json';
      console.log(chalk.green(`Updated ${configFileName} dependency.`));

      if (options.local) {
        const gitignorePath = path.join(projectPath, '.gitignore');
        const added = await addIgnoreEntry(gitignorePath, 'ai-rules-sync.local.json', '# Local AI Rules Sync Config');
        if (added) {
          console.log(chalk.green(`Added "ai-rules-sync.local.json" to .gitignore.`));
        }
      }

      console.log(chalk.bold.green(`\n✓ Successfully imported "${name}"!`));
    } catch (error: any) {
      console.error(chalk.red('Error importing entry:'), error.message);
      process.exit(1);
    }
  })

// ============ Cursor command group ============
const cursor = program
  .command('cursor')
  .description('Manage Cursor rules, commands, and skills in a project')

// Default: cursor add = cursor rules add
cursor
  .command('add')
  .description('Sync Cursor rules to project (.cursor/rules/...)')
  .argument('<ruleName>', 'Name of the rule directory in the rules repo')
  .argument('[alias]', 'Alias for the rule name (e.g. react-v2)')
  .option('-l, --local', 'Add to ai-rules-sync.local.json (private rule)')
  .action(async (ruleName, alias, options) => {
    try {
      const opts = program.opts();
      const currentRepo = await getTargetRepo(opts);
      const projectPath = process.cwd();

      console.log(chalk.gray(`Using repository: ${chalk.cyan(currentRepo.name)} (${currentRepo.url})`))

      const isLocal = options.local;
      await linkRule(projectPath, ruleName, currentRepo, alias, isLocal)

      const { migrated } = await addCursorDependency(projectPath, ruleName, currentRepo.url, alias, isLocal)

      const configFileName = isLocal ? 'ai-rules-sync.local.json' : 'ai-rules-sync.json';
      console.log(chalk.green(`Updated ${configFileName} dependency.`))

      if (migrated) {
        console.log(chalk.yellow('Detected legacy "cursor-rules*.json". Migrated to "ai-rules-sync*.json". Consider deleting the legacy files to avoid ambiguity.'))
      }

      if (isLocal) {
          const gitignorePath = path.join(projectPath, '.gitignore');
        const added = await addIgnoreEntry(gitignorePath, 'ai-rules-sync.local.json', '# Local AI Rules Sync Config');
          if (added) {
          console.log(chalk.green(`Added "ai-rules-sync.local.json" to .gitignore.`));
          }
      }
    } catch (error: any) {
      console.error(chalk.red('Error adding rule:'), error.message)
      process.exit(1)
    }
  })

cursor
  .command('remove')
  .description('Remove a Cursor rule from project')
  .argument('<alias>', 'Alias (or name) of the rule to remove')
  .action(async (alias) => {
    try {
      const projectPath = process.cwd();

      await unlinkRule(projectPath, alias);

      const { removedFrom, migrated } = await removeCursorDependency(projectPath, alias);

      if (removedFrom.length > 0) {
        console.log(chalk.green(`Removed rule "${alias}" from configuration: ${removedFrom.join(', ')}`));
      } else {
        console.log(chalk.yellow(`Rule "${alias}" was not found in any configuration file.`));
      }

      if (migrated) {
        console.log(chalk.yellow('Detected legacy "cursor-rules*.json". Migrated to "ai-rules-sync*.json". Consider deleting the legacy files to avoid ambiguity.'))
      }
    } catch (error: any) {
      console.error(chalk.red('Error removing rule:'), error.message)
      process.exit(1)
    }
  })

cursor
  .command('install')
  .description('Install all Cursor rules, commands, and skills from ai-rules-sync.json')
    .action(async () => {
      try {
      const projectPath = process.cwd()
      await installCursorRules(projectPath)
      await installCursorCommands(projectPath)
      await installCursorSkills(projectPath)
    } catch (error: any) {
      console.error(chalk.red('Error installing Cursor rules:'), error.message)
      process.exit(1)
    }
  })

cursor
  .command('import <name>')
  .description('Import Cursor rule/command/skill from project to repository (auto-detects subtype)')
  .option('-l, --local', 'Add to ai-rules-sync.local.json (private)')
  .option('-m, --message <message>', 'Custom git commit message')
  .option('-f, --force', 'Overwrite if entry already exists in repository')
  .option('-p, --push', 'Push to remote repository after commit')
  .action(async (name, options) => {
    try {
      const projectPath = process.cwd();
      const opts = program.opts();
      const currentRepo = await getTargetRepo(opts);

      // Try to detect subtype by checking which directory it's in
      const cursorAdapters = adapterRegistry.getForTool('cursor');
      let foundAdapter = null;

      for (const adapter of cursorAdapters) {
        const targetPath = path.join(projectPath, adapter.targetDir, name);
        if (await fs.pathExists(targetPath)) {
          foundAdapter = adapter;
          break;
        }
      }

      if (!foundAdapter) {
        throw new Error(`Entry "${name}" not found in .cursor/rules, .cursor/commands, or .cursor/skills. Use explicit command: ais cursor rules import ${name}`);
      }

      console.log(chalk.gray(`Detected ${foundAdapter.subtype}: ${name}`));
      console.log(chalk.gray(`Using repository: ${chalk.cyan(currentRepo.name)} (${currentRepo.url})`));

      await importEntry(foundAdapter, {
        projectPath,
        name,
        repo: currentRepo,
        isLocal: options.local,
        commitMessage: options.message,
        force: options.force,
        push: options.push
      });

      await foundAdapter.addDependency(projectPath, name, currentRepo.url, undefined, options.local);
      const configFileName = options.local ? 'ai-rules-sync.local.json' : 'ai-rules-sync.json';
      console.log(chalk.green(`Updated ${configFileName} dependency.`));

      if (options.local) {
        const gitignorePath = path.join(projectPath, '.gitignore');
        const added = await addIgnoreEntry(gitignorePath, 'ai-rules-sync.local.json', '# Local AI Rules Sync Config');
        if (added) {
          console.log(chalk.green(`Added "ai-rules-sync.local.json" to .gitignore.`));
        }
      }

      console.log(chalk.bold.green(`\n✓ Successfully imported "${name}"!`));
    } catch (error: any) {
      console.error(chalk.red('Error importing entry:'), error.message);
      process.exit(1);
    }
  })

// ============ Cursor rules subcommand (explicit) ============
const cursorRules = cursor
  .command('rules')
  .description('Manage Cursor rules explicitly')

cursorRules
  .command('add')
  .description('Sync Cursor rules to project (.cursor/rules/...)')
  .argument('<ruleName>', 'Name of the rule directory in the rules repo')
  .argument('[alias]', 'Alias for the rule name')
  .option('-l, --local', 'Add to ai-rules-sync.local.json (private rule)')
  .action(async (ruleName, alias, options) => {
    try {
      const opts = program.opts();
      const currentRepo = await getTargetRepo(opts);
      const projectPath = process.cwd();

      console.log(chalk.gray(`Using repository: ${chalk.cyan(currentRepo.name)} (${currentRepo.url})`))

      const isLocal = options.local;
      await linkRule(projectPath, ruleName, currentRepo, alias, isLocal)

      const { migrated } = await addCursorDependency(projectPath, ruleName, currentRepo.url, alias, isLocal)

      const configFileName = isLocal ? 'ai-rules-sync.local.json' : 'ai-rules-sync.json';
      console.log(chalk.green(`Updated ${configFileName} dependency.`))

      if (migrated) {
        console.log(chalk.yellow('Detected legacy "cursor-rules*.json". Migrated to "ai-rules-sync*.json". Consider deleting the legacy files to avoid ambiguity.'))
      }

      if (isLocal) {
          const gitignorePath = path.join(projectPath, '.gitignore');
        const added = await addIgnoreEntry(gitignorePath, 'ai-rules-sync.local.json', '# Local AI Rules Sync Config');
          if (added) {
          console.log(chalk.green(`Added "ai-rules-sync.local.json" to .gitignore.`));
          }
      }
    } catch (error: any) {
      console.error(chalk.red('Error adding rule:'), error.message)
      process.exit(1)
    }
  })

cursorRules
  .command('remove')
  .description('Remove a Cursor rule from project')
  .argument('<alias>', 'Alias (or name) of the rule to remove')
  .action(async (alias) => {
    try {
      const projectPath = process.cwd();

      await unlinkRule(projectPath, alias);

      const { removedFrom, migrated } = await removeCursorDependency(projectPath, alias);

      if (removedFrom.length > 0) {
        console.log(chalk.green(`Removed rule "${alias}" from configuration: ${removedFrom.join(', ')}`));
      } else {
        console.log(chalk.yellow(`Rule "${alias}" was not found in any configuration file.`));
      }

      if (migrated) {
        console.log(chalk.yellow('Detected legacy "cursor-rules*.json". Migrated to "ai-rules-sync*.json". Consider deleting the legacy files to avoid ambiguity.'))
      }
    } catch (error: any) {
      console.error(chalk.red('Error removing rule:'), error.message)
      process.exit(1)
    }
  })

cursorRules
  .command('install')
  .description('Install all Cursor rules from ai-rules-sync.json')
  .action(async () => {
    try {
      await installCursorRules(process.cwd())
    } catch (error: any) {
      console.error(chalk.red('Error installing Cursor rules:'), error.message)
      process.exit(1)
    }
  })

cursorRules
  .command('import <name>')
  .description('Import Cursor rule from project to repository')
  .option('-l, --local', 'Add to ai-rules-sync.local.json (private)')
  .option('-m, --message <message>', 'Custom git commit message')
  .option('-f, --force', 'Overwrite if entry already exists in repository')
  .option('-p, --push', 'Push to remote repository after commit')
  .action(async (name, options) => {
    try {
      const projectPath = process.cwd();
      const opts = program.opts();
      const currentRepo = await getTargetRepo(opts);

      console.log(chalk.gray(`Using repository: ${chalk.cyan(currentRepo.name)} (${currentRepo.url})`));

      const adapter = getAdapter('cursor', 'rules');
      await importEntry(adapter, {
        projectPath,
        name,
        repo: currentRepo,
        isLocal: options.local,
        commitMessage: options.message,
        force: options.force,
        push: options.push
      });

      await adapter.addDependency(projectPath, name, currentRepo.url, undefined, options.local);
      const configFileName = options.local ? 'ai-rules-sync.local.json' : 'ai-rules-sync.json';
      console.log(chalk.green(`Updated ${configFileName} dependency.`));

      if (options.local) {
        const gitignorePath = path.join(projectPath, '.gitignore');
        const added = await addIgnoreEntry(gitignorePath, 'ai-rules-sync.local.json', '# Local AI Rules Sync Config');
        if (added) {
          console.log(chalk.green(`Added "ai-rules-sync.local.json" to .gitignore.`));
        }
      }

      console.log(chalk.bold.green(`\n✓ Successfully imported "${name}"!`));
    } catch (error: any) {
      console.error(chalk.red('Error importing entry:'), error.message);
      process.exit(1);
    }
  })

// ============ Cursor commands subcommand ============
const cursorCommands = cursor
  .command('commands')
  .description('Manage Cursor commands (.cursor/commands/)')

cursorCommands
  .command('add')
  .description('Sync Cursor command to project (.cursor/commands/...)')
  .argument('<commandName>', 'Name of the command file in the rules repo (under commands/)')
  .argument('[alias]', 'Alias for the command name')
  .option('-l, --local', 'Add to ai-rules-sync.local.json (private command)')
  .action(async (commandName, alias, options) => {
    try {
      const opts = program.opts();
      const currentRepo = await getTargetRepo(opts);
      const projectPath = process.cwd();

      console.log(chalk.gray(`Using repository: ${chalk.cyan(currentRepo.name)} (${currentRepo.url})`))

      const isLocal = options.local;
      const { sourceName, targetName } = await linkCursorCommand(projectPath, commandName, currentRepo, alias, isLocal)

      const depAlias = targetName === sourceName ? undefined : targetName
      const { migrated } = await addCursorCommandDependency(projectPath, sourceName, currentRepo.url, depAlias, isLocal)

      const configFileName = isLocal ? 'ai-rules-sync.local.json' : 'ai-rules-sync.json';
      console.log(chalk.green(`Updated ${configFileName} commands dependency.`))

      if (migrated) {
        console.log(chalk.yellow('Detected legacy "cursor-rules*.json". Migrated to "ai-rules-sync*.json". Consider deleting the legacy files to avoid ambiguity.'))
      }

      if (isLocal) {
        const gitignorePath = path.join(projectPath, '.gitignore');
        const added = await addIgnoreEntry(gitignorePath, 'ai-rules-sync.local.json', '# Local AI Rules Sync Config');
        if (added) {
          console.log(chalk.green(`Added "ai-rules-sync.local.json" to .gitignore.`));
        }
      }
    } catch (error: any) {
      console.error(chalk.red('Error adding command:'), error.message)
      process.exit(1)
    }
  })

cursorCommands
  .command('remove')
  .description('Remove a Cursor command from project')
  .argument('<alias>', 'Alias (or name) of the command to remove')
  .action(async (alias) => {
    try {
      const projectPath = process.cwd();
      const cfg = await getCombinedProjectConfig(projectPath);
      const resolved = resolveCommandAliasFromConfig(alias, Object.keys(cfg.cursor?.commands || {}));

      await unlinkCursorCommand(projectPath, resolved);

      const { removedFrom, migrated } = await removeCursorCommandDependency(projectPath, resolved);

      if (removedFrom.length > 0) {
        console.log(chalk.green(`Removed command "${resolved}" from configuration: ${removedFrom.join(', ')}`));
      } else {
        console.log(chalk.yellow(`Command "${resolved}" was not found in any configuration file.`));
      }

      if (migrated) {
        console.log(chalk.yellow('Detected legacy "cursor-rules*.json". Migrated to "ai-rules-sync*.json". Consider deleting the legacy files to avoid ambiguity.'))
      }
    } catch (error: any) {
      console.error(chalk.red('Error removing command:'), error.message)
      process.exit(1)
    }
  })

cursorCommands
  .command('install')
  .description('Install all Cursor commands from ai-rules-sync.json')
  .action(async () => {
    try {
      await installCursorCommands(process.cwd())
    } catch (error: any) {
      console.error(chalk.red('Error installing Cursor commands:'), error.message)
      process.exit(1)
    }
  })

cursorCommands
  .command('import <name>')
  .description('Import Cursor command from project to repository')
  .option('-l, --local', 'Add to ai-rules-sync.local.json (private)')
  .option('-m, --message <message>', 'Custom git commit message')
  .option('-f, --force', 'Overwrite if entry already exists in repository')
  .option('-p, --push', 'Push to remote repository after commit')
  .action(async (name, options) => {
    try {
      const projectPath = process.cwd();
      const opts = program.opts();
      const currentRepo = await getTargetRepo(opts);

      console.log(chalk.gray(`Using repository: ${chalk.cyan(currentRepo.name)} (${currentRepo.url})`));

      const adapter = getAdapter('cursor', 'commands');
      await importEntry(adapter, {
        projectPath,
        name,
        repo: currentRepo,
        isLocal: options.local,
        commitMessage: options.message,
        force: options.force,
        push: options.push
      });

      await adapter.addDependency(projectPath, name, currentRepo.url, undefined, options.local);
      const configFileName = options.local ? 'ai-rules-sync.local.json' : 'ai-rules-sync.json';
      console.log(chalk.green(`Updated ${configFileName} dependency.`));

      if (options.local) {
        const gitignorePath = path.join(projectPath, '.gitignore');
        const added = await addIgnoreEntry(gitignorePath, 'ai-rules-sync.local.json', '# Local AI Rules Sync Config');
        if (added) {
          console.log(chalk.green(`Added "ai-rules-sync.local.json" to .gitignore.`));
        }
      }

      console.log(chalk.bold.green(`\n✓ Successfully imported "${name}"!`));
    } catch (error: any) {
      console.error(chalk.red('Error importing entry:'), error.message);
      process.exit(1);
    }
  })

// ============ Cursor skills subcommand ============
const cursorSkills = cursor
  .command('skills')
  .description('Manage Cursor skills (.cursor/skills/)')

cursorSkills
  .command('add')
  .description('Sync Cursor skill to project (.cursor/skills/...)')
  .argument('<skillName>', 'Name of the skill directory in the rules repo')
  .argument('[alias]', 'Alias for the skill name')
  .option('-l, --local', 'Add to ai-rules-sync.local.json (private skill)')
  .action(async (skillName, alias, options) => {
    try {
      const opts = program.opts();
      const currentRepo = await getTargetRepo(opts);
      const projectPath = process.cwd();

      console.log(chalk.gray(`Using repository: ${chalk.cyan(currentRepo.name)} (${currentRepo.url})`))

      const isLocal = options.local;
      await linkCursorSkill(projectPath, skillName, currentRepo, alias, isLocal)

      const { migrated } = await addCursorSkillDependency(projectPath, skillName, currentRepo.url, alias, isLocal)

      const configFileName = isLocal ? 'ai-rules-sync.local.json' : 'ai-rules-sync.json';
      console.log(chalk.green(`Updated ${configFileName} Cursor skill dependency.`))

      if (migrated) {
        console.log(chalk.yellow('Detected legacy "cursor-rules*.json". Migrated to "ai-rules-sync*.json". Consider deleting the legacy files to avoid ambiguity.'))
      }

      if (isLocal) {
          const gitignorePath = path.join(projectPath, '.gitignore');
        const added = await addIgnoreEntry(gitignorePath, 'ai-rules-sync.local.json', '# Local AI Rules Sync Config');
          if (added) {
          console.log(chalk.green(`Added "ai-rules-sync.local.json" to .gitignore.`));
          }
      }
    } catch (error: any) {
      console.error(chalk.red('Error adding Cursor skill:'), error.message)
      process.exit(1)
    }
  })

cursorSkills
  .command('remove')
  .description('Remove a Cursor skill from project')
  .argument('<alias>', 'Alias (or name) of the skill to remove')
  .action(async (alias) => {
    try {
      const projectPath = process.cwd();

      await unlinkCursorSkill(projectPath, alias);

      const { removedFrom, migrated } = await removeCursorSkillDependency(projectPath, alias);

      if (removedFrom.length > 0) {
        console.log(chalk.green(`Removed skill "${alias}" from configuration: ${removedFrom.join(', ')}`));
      } else {
        console.log(chalk.yellow(`Skill "${alias}" was not found in any configuration file.`));
      }

      if (migrated) {
        console.log(chalk.yellow('Detected legacy "cursor-rules*.json". Migrated to "ai-rules-sync*.json". Consider deleting the legacy files to avoid ambiguity.'))
      }
    } catch (error: any) {
      console.error(chalk.red('Error removing Cursor skill:'), error.message)
      process.exit(1)
    }
  })

cursorSkills
  .command('install')
  .description('Install all Cursor skills from ai-rules-sync.json')
  .action(async () => {
    try {
      await installCursorSkills(process.cwd())
    } catch (error: any) {
      console.error(chalk.red('Error installing Cursor skills:'), error.message)
      process.exit(1)
    }
  })

cursorSkills
  .command('import <name>')
  .description('Import Cursor skill from project to repository')
  .option('-l, --local', 'Add to ai-rules-sync.local.json (private)')
  .option('-m, --message <message>', 'Custom git commit message')
  .option('-f, --force', 'Overwrite if entry already exists in repository')
  .option('-p, --push', 'Push to remote repository after commit')
  .action(async (name, options) => {
    try {
      const projectPath = process.cwd();
      const opts = program.opts();
      const currentRepo = await getTargetRepo(opts);

      console.log(chalk.gray(`Using repository: ${chalk.cyan(currentRepo.name)} (${currentRepo.url})`));

      const adapter = getAdapter('cursor', 'skills');
      await importEntry(adapter, {
        projectPath,
        name,
        repo: currentRepo,
        isLocal: options.local,
        commitMessage: options.message,
        force: options.force,
        push: options.push
      });

      await adapter.addDependency(projectPath, name, currentRepo.url, undefined, options.local);
      const configFileName = options.local ? 'ai-rules-sync.local.json' : 'ai-rules-sync.json';
      console.log(chalk.green(`Updated ${configFileName} dependency.`));

      if (options.local) {
        const gitignorePath = path.join(projectPath, '.gitignore');
        const added = await addIgnoreEntry(gitignorePath, 'ai-rules-sync.local.json', '# Local AI Rules Sync Config');
        if (added) {
          console.log(chalk.green(`Added "ai-rules-sync.local.json" to .gitignore.`));
        }
      }

      console.log(chalk.bold.green(`\n✓ Successfully imported "${name}"!`));
    } catch (error: any) {
      console.error(chalk.red('Error importing entry:'), error.message);
      process.exit(1);
    }
  })

// ============ Copilot command group ============
const copilot = program
  .command('copilot')
  .description('Manage Copilot instructions in a project (.github/instructions/...)')

copilot
  .command('add')
  .description('Sync Copilot instruction entry to project (.github/instructions/...)')
  .argument('<ruleName>', 'Name of the instruction directory in the rules repo (default: rules/<ruleName>)')
  .argument('[alias]', 'Alias for the instruction name')
  .option('-l, --local', 'Add to ai-rules-sync.local.json (private instruction)')
  .action(async (ruleName, alias, options) => {
    try {
      const opts = program.opts();
      const currentRepo = await getTargetRepo(opts);
        const projectPath = process.cwd();

      console.log(chalk.gray(`Using repository: ${chalk.cyan(currentRepo.name)} (${currentRepo.url})`))

      const isLocal = options.local;
      const { sourceName, targetName } = await linkCopilotInstruction(projectPath, ruleName, currentRepo, alias, isLocal)

      const depAlias = targetName === sourceName ? undefined : targetName
      const { migrated } = await addCopilotDependency(projectPath, sourceName, currentRepo.url, depAlias, isLocal)

      const configFileName = isLocal ? 'ai-rules-sync.local.json' : 'ai-rules-sync.json';
      console.log(chalk.green(`Updated ${configFileName} Copilot dependency.`))

      if (migrated) {
        console.log(chalk.yellow('Detected legacy "cursor-rules*.json". Migrated to "ai-rules-sync*.json". Consider deleting the legacy files to avoid ambiguity.'))
      }

      if (isLocal) {
        const gitignorePath = path.join(projectPath, '.gitignore');
        const added = await addIgnoreEntry(gitignorePath, 'ai-rules-sync.local.json', '# Local AI Rules Sync Config');
        if (added) {
          console.log(chalk.green(`Added "ai-rules-sync.local.json" to .gitignore.`));
        }
      }
    } catch (error: any) {
      console.error(chalk.red('Error adding Copilot instruction:'), error.message)
      process.exit(1)
    }
  })

copilot
  .command('remove')
  .description('Remove a Copilot instruction entry from project')
  .argument('<alias>', 'Alias (or name) of the instruction to remove')
  .action(async (alias) => {
    try {
      const projectPath = process.cwd();
      const cfg = await getCombinedProjectConfig(projectPath);
      const resolved = resolveCopilotAliasFromConfig(alias, Object.keys(cfg.copilot?.instructions || {}));

      await unlinkCopilotInstruction(projectPath, resolved);

      const { removedFrom, migrated } = await removeCopilotDependency(projectPath, resolved);

      if (removedFrom.length > 0) {
        console.log(chalk.green(`Removed instruction "${resolved}" from configuration: ${removedFrom.join(', ')}`));
        } else {
        console.log(chalk.yellow(`Instruction "${resolved}" was not found in any configuration file.`));
      }

      if (migrated) {
        console.log(chalk.yellow('Detected legacy "cursor-rules*.json". Migrated to "ai-rules-sync*.json". Consider deleting the legacy files to avoid ambiguity.'))
      }
    } catch (error: any) {
      console.error(chalk.red('Error removing Copilot instruction:'), error.message)
      process.exit(1)
    }
  })

copilot
  .command('install')
  .description('Install all Copilot instruction entries from ai-rules-sync.json')
  .action(async () => {
    try {
      await installCopilotInstructions(process.cwd())
    } catch (error: any) {
      console.error(chalk.red('Error installing Copilot instructions:'), error.message)
      process.exit(1)
    }
  })

copilot
  .command('import <name>')
  .description('Import Copilot instruction from project to repository')
  .option('-l, --local', 'Add to ai-rules-sync.local.json (private)')
  .option('-m, --message <message>', 'Custom git commit message')
  .option('-f, --force', 'Overwrite if entry already exists in repository')
  .option('-p, --push', 'Push to remote repository after commit')
  .action(async (name, options) => {
    try {
      const projectPath = process.cwd();
      const opts = program.opts();
      const currentRepo = await getTargetRepo(opts);

      console.log(chalk.gray(`Using repository: ${chalk.cyan(currentRepo.name)} (${currentRepo.url})`));

      const adapter = getAdapter('copilot', 'instructions');
      await importEntry(adapter, {
        projectPath,
        name,
        repo: currentRepo,
        isLocal: options.local,
        commitMessage: options.message,
        force: options.force,
        push: options.push
      });

      await adapter.addDependency(projectPath, name, currentRepo.url, undefined, options.local);
      const configFileName = options.local ? 'ai-rules-sync.local.json' : 'ai-rules-sync.json';
      console.log(chalk.green(`Updated ${configFileName} dependency.`));

      if (options.local) {
        const gitignorePath = path.join(projectPath, '.gitignore');
        const added = await addIgnoreEntry(gitignorePath, 'ai-rules-sync.local.json', '# Local AI Rules Sync Config');
        if (added) {
          console.log(chalk.green(`Added "ai-rules-sync.local.json" to .gitignore.`));
        }
      }

      console.log(chalk.bold.green(`\n✓ Successfully imported "${name}"!`));
    } catch (error: any) {
      console.error(chalk.red('Error importing entry:'), error.message);
      process.exit(1);
    }
  })

// ============ Claude command group ============
const claude = program
  .command('claude')
  .description('Manage Claude Code skills, agents, and plugins in a project')

// ============ Claude skills subcommand ============
const claudeSkills = claude
  .command('skills')
  .description('Manage Claude skills (.claude/skills/)')

claudeSkills
  .command('add')
  .description('Sync Claude skill to project (.claude/skills/...)')
  .argument('<skillName>', 'Name of the skill directory in the rules repo')
  .argument('[alias]', 'Alias for the skill name')
  .option('-l, --local', 'Add to ai-rules-sync.local.json (private skill)')
  .action(async (skillName, alias, options) => {
    try {
      const opts = program.opts();
      const currentRepo = await getTargetRepo(opts);
      const projectPath = process.cwd();

      console.log(chalk.gray(`Using repository: ${chalk.cyan(currentRepo.name)} (${currentRepo.url})`))

      const isLocal = options.local;
      await linkClaudeSkill(projectPath, skillName, currentRepo, alias, isLocal)

      const { migrated } = await addClaudeSkillDependency(projectPath, skillName, currentRepo.url, alias, isLocal)

      const configFileName = isLocal ? 'ai-rules-sync.local.json' : 'ai-rules-sync.json';
      console.log(chalk.green(`Updated ${configFileName} Claude skill dependency.`))

      if (migrated) {
        console.log(chalk.yellow('Detected legacy "cursor-rules*.json". Migrated to "ai-rules-sync*.json". Consider deleting the legacy files to avoid ambiguity.'))
      }

      if (isLocal) {
        const gitignorePath = path.join(projectPath, '.gitignore');
        const added = await addIgnoreEntry(gitignorePath, 'ai-rules-sync.local.json', '# Local AI Rules Sync Config');
        if (added) {
          console.log(chalk.green(`Added "ai-rules-sync.local.json" to .gitignore.`));
        }
      }
    } catch (error: any) {
      console.error(chalk.red('Error adding Claude skill:'), error.message)
      process.exit(1)
    }
  })

claudeSkills
  .command('remove')
  .description('Remove a Claude skill from project')
  .argument('<alias>', 'Alias (or name) of the skill to remove')
  .action(async (alias) => {
    try {
      const projectPath = process.cwd();

      await unlinkClaudeSkill(projectPath, alias);

      const { removedFrom, migrated } = await removeClaudeSkillDependency(projectPath, alias);

      if (removedFrom.length > 0) {
        console.log(chalk.green(`Removed skill "${alias}" from configuration: ${removedFrom.join(', ')}`));
      } else {
        console.log(chalk.yellow(`Skill "${alias}" was not found in any configuration file.`));
      }

      if (migrated) {
        console.log(chalk.yellow('Detected legacy "cursor-rules*.json". Migrated to "ai-rules-sync*.json". Consider deleting the legacy files to avoid ambiguity.'))
      }
    } catch (error: any) {
      console.error(chalk.red('Error removing Claude skill:'), error.message)
      process.exit(1)
    }
  })

claudeSkills
  .command('install')
  .description('Install all Claude skills from ai-rules-sync.json')
  .action(async () => {
    try {
      await installClaudeSkills(process.cwd())
    } catch (error: any) {
      console.error(chalk.red('Error installing Claude skills:'), error.message)
      process.exit(1)
    }
  })

claudeSkills
  .command('import <name>')
  .description('Import Claude skill from project to repository')
  .option('-l, --local', 'Add to ai-rules-sync.local.json (private)')
  .option('-m, --message <message>', 'Custom git commit message')
  .option('-f, --force', 'Overwrite if entry already exists in repository')
  .option('-p, --push', 'Push to remote repository after commit')
  .action(async (name, options) => {
    try {
      const projectPath = process.cwd();
      const opts = program.opts();
      const currentRepo = await getTargetRepo(opts);

      console.log(chalk.gray(`Using repository: ${chalk.cyan(currentRepo.name)} (${currentRepo.url})`));

      const adapter = getAdapter('claude', 'skills');
      await importEntry(adapter, {
        projectPath,
        name,
        repo: currentRepo,
        isLocal: options.local,
        commitMessage: options.message,
        force: options.force,
        push: options.push
      });

      await adapter.addDependency(projectPath, name, currentRepo.url, undefined, options.local);
      const configFileName = options.local ? 'ai-rules-sync.local.json' : 'ai-rules-sync.json';
      console.log(chalk.green(`Updated ${configFileName} dependency.`));

      if (options.local) {
        const gitignorePath = path.join(projectPath, '.gitignore');
        const added = await addIgnoreEntry(gitignorePath, 'ai-rules-sync.local.json', '# Local AI Rules Sync Config');
        if (added) {
          console.log(chalk.green(`Added "ai-rules-sync.local.json" to .gitignore.`));
        }
      }

      console.log(chalk.bold.green(`\n✓ Successfully imported "${name}"!`));
    } catch (error: any) {
      console.error(chalk.red('Error importing entry:'), error.message);
      process.exit(1);
    }
  })

// ============ Claude agents subcommand ============
const claudeAgents = claude
  .command('agents')
  .description('Manage Claude agents (.claude/agents/)')

claudeAgents
  .command('add')
  .description('Sync Claude agent to project (.claude/agents/...)')
  .argument('<agentName>', 'Name of the agent directory in the rules repo')
  .argument('[alias]', 'Alias for the agent name')
  .option('-l, --local', 'Add to ai-rules-sync.local.json (private agent)')
  .action(async (agentName, alias, options) => {
    try {
      const opts = program.opts();
      const currentRepo = await getTargetRepo(opts);
      const projectPath = process.cwd();

      console.log(chalk.gray(`Using repository: ${chalk.cyan(currentRepo.name)} (${currentRepo.url})`))

      const isLocal = options.local;
      await linkClaudeAgent(projectPath, agentName, currentRepo, alias, isLocal)

      const { migrated } = await addClaudeAgentDependency(projectPath, agentName, currentRepo.url, alias, isLocal)

      const configFileName = isLocal ? 'ai-rules-sync.local.json' : 'ai-rules-sync.json';
      console.log(chalk.green(`Updated ${configFileName} Claude agent dependency.`))

      if (migrated) {
        console.log(chalk.yellow('Detected legacy "cursor-rules*.json". Migrated to "ai-rules-sync*.json". Consider deleting the legacy files to avoid ambiguity.'))
      }

      if (isLocal) {
        const gitignorePath = path.join(projectPath, '.gitignore');
        const added = await addIgnoreEntry(gitignorePath, 'ai-rules-sync.local.json', '# Local AI Rules Sync Config');
        if (added) {
          console.log(chalk.green(`Added "ai-rules-sync.local.json" to .gitignore.`));
        }
      }
    } catch (error: any) {
      console.error(chalk.red('Error adding Claude agent:'), error.message)
      process.exit(1)
    }
  })

claudeAgents
  .command('remove')
  .description('Remove a Claude agent from project')
  .argument('<alias>', 'Alias (or name) of the agent to remove')
  .action(async (alias) => {
    try {
      const projectPath = process.cwd();

      await unlinkClaudeAgent(projectPath, alias);

      const { removedFrom, migrated } = await removeClaudeAgentDependency(projectPath, alias);

      if (removedFrom.length > 0) {
        console.log(chalk.green(`Removed agent "${alias}" from configuration: ${removedFrom.join(', ')}`));
      } else {
        console.log(chalk.yellow(`Agent "${alias}" was not found in any configuration file.`));
      }

      if (migrated) {
        console.log(chalk.yellow('Detected legacy "cursor-rules*.json". Migrated to "ai-rules-sync*.json". Consider deleting the legacy files to avoid ambiguity.'))
      }
    } catch (error: any) {
      console.error(chalk.red('Error removing Claude agent:'), error.message)
      process.exit(1)
    }
  })

claudeAgents
  .command('install')
  .description('Install all Claude agents from ai-rules-sync.json')
  .action(async () => {
    try {
      await installClaudeAgents(process.cwd())
    } catch (error: any) {
      console.error(chalk.red('Error installing Claude agents:'), error.message)
      process.exit(1)
    }
  })

claudeAgents
  .command('import <name>')
  .description('Import Claude agent from project to repository')
  .option('-l, --local', 'Add to ai-rules-sync.local.json (private)')
  .option('-m, --message <message>', 'Custom git commit message')
  .option('-f, --force', 'Overwrite if entry already exists in repository')
  .option('-p, --push', 'Push to remote repository after commit')
  .action(async (name, options) => {
    try {
      const projectPath = process.cwd();
      const opts = program.opts();
      const currentRepo = await getTargetRepo(opts);

      console.log(chalk.gray(`Using repository: ${chalk.cyan(currentRepo.name)} (${currentRepo.url})`));

      const adapter = getAdapter('claude', 'agents');
      await importEntry(adapter, {
        projectPath,
        name,
        repo: currentRepo,
        isLocal: options.local,
        commitMessage: options.message,
        force: options.force,
        push: options.push
      });

      await adapter.addDependency(projectPath, name, currentRepo.url, undefined, options.local);
      const configFileName = options.local ? 'ai-rules-sync.local.json' : 'ai-rules-sync.json';
      console.log(chalk.green(`Updated ${configFileName} dependency.`));

      if (options.local) {
        const gitignorePath = path.join(projectPath, '.gitignore');
        const added = await addIgnoreEntry(gitignorePath, 'ai-rules-sync.local.json', '# Local AI Rules Sync Config');
        if (added) {
          console.log(chalk.green(`Added "ai-rules-sync.local.json" to .gitignore.`));
        }
      }

      console.log(chalk.bold.green(`\n✓ Successfully imported "${name}"!`));
    } catch (error: any) {
      console.error(chalk.red('Error importing entry:'), error.message);
      process.exit(1);
    }
  })

// ============ Claude install shortcut ============
claude
  .command('install')
  .description('Install all Claude skills and agents from ai-rules-sync.json')
  .action(async () => {
    try {
      const projectPath = process.cwd()
      await installClaudeSkills(projectPath)
      await installClaudeAgents(projectPath)
    } catch (error: any) {
      console.error(chalk.red('Error installing Claude components:'), error.message)
      process.exit(1)
    }
  })

program
  .command('git')
  .description('Run git commands in the rules repository')
  .argument('[args...]', 'Git arguments')
  .allowUnknownOption()
  .action(async (args, commandObj) => {
    const procArgs = process.argv
    const gitIndex = procArgs.indexOf('git')

    const opts = program.opts();
    let gitArgs = procArgs.slice(gitIndex + 1)

    const newGitArgs = [];
    for (let i = 0; i < gitArgs.length; i++) {
        if (gitArgs[i] === '-t' || gitArgs[i] === '--target') {
            i++;
            continue;
        }
        newGitArgs.push(gitArgs[i]);
    }

    try {
      const currentRepo = await getTargetRepo(opts);
      await runGitCommand(newGitArgs, currentRepo.path)
    } catch (error: any) {
      console.error(chalk.red('Error executing git command:'), error.message)
      process.exit(1)
    }
  })

// Hidden command for shell tab completion
program
  .command('_complete')
  .argument('<type>', 'cursor, copilot, cursor-commands, cursor-skills, claude-skills, claude-agents')
  .description(false as any) // Hide from help
  .action(async (type: string) => {
    try {
      const opts = program.opts();
      const currentRepo = await getTargetRepo(opts).catch(() => null);
      if (!currentRepo) {
        process.exit(0);
      }

      const repoConfig = await getRepoSourceConfig(currentRepo.path);

      // Determine which directory to list based on type
      let tool: string;
      let subtype: string;
      let defaultDir: string;

      if (type === 'cursor-commands') {
        tool = 'cursor';
        subtype = 'commands';
        defaultDir = '.cursor/commands';
      } else if (type === 'copilot') {
        tool = 'copilot';
        subtype = 'instructions';
        defaultDir = '.github/instructions';
      } else if (type === 'claude-skills') {
        tool = 'claude';
        subtype = 'skills';
        defaultDir = '.claude/skills';
      } else if (type === 'claude-agents') {
        tool = 'claude';
        subtype = 'agents';
        defaultDir = '.claude/agents';
      } else if (type === 'cursor-skills') {
        tool = 'cursor';
        subtype = 'skills';
        defaultDir = '.cursor/skills';
      } else {
        // cursor rules
        tool = 'cursor';
        subtype = 'rules';
        defaultDir = '.cursor/rules';
      }

      const sourceDir = getSourceDir(repoConfig, tool, subtype, defaultDir);
      const rulesDir = path.join(currentRepo.path, sourceDir);

      if (!await fs.pathExists(rulesDir)) {
        process.exit(0);
      }

      const entries = await fs.readdir(rulesDir);
      const names = new Set<string>();

      for (const entry of entries) {
        // Strip known suffixes for display
        let name = entry;
        if (name.endsWith('.instructions.md')) {
          name = name.slice(0, -'.instructions.md'.length);
        } else if (name.endsWith('.md')) {
          name = name.slice(0, -'.md'.length);
        }
        names.add(name);
      }

      // Output one name per line for shell completion
      for (const name of names) {
        console.log(name);
      }
    } catch {
      process.exit(0);
    }
  })

// Completion command group
const completionCmd = program
  .command('completion')
  .description('Shell completion utilities')

// Default: output completion script
completionCmd
  .command('script', { isDefault: true })
  .argument('[shell]', 'Shell type: bash, zsh, or fish (auto-detect if omitted)')
  .description('Output shell completion script')
  .action((shell?: string) => {
    // Auto-detect shell if not provided
    if (!shell) {
      const envShell = process.env.SHELL || '';
      if (envShell.includes('zsh')) {
        shell = 'zsh';
      } else if (envShell.includes('fish')) {
        shell = 'fish';
      } else {
        shell = 'bash';
      }
    }

    const bashScript = `
# ais bash completion
_ais_complete() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local prev="\${COMP_WORDS[COMP_CWORD-1]}"
  local pprev="\${COMP_WORDS[COMP_CWORD-2]}"
  local ppprev="\${COMP_WORDS[COMP_CWORD-3]}"

  # cursor commands add
  if [[ "\$ppprev" == "cursor" && "\$pprev" == "commands" && "\$prev" == "add" ]]; then
    COMPREPLY=( $(compgen -W "$(ais _complete cursor-commands 2>/dev/null)" -- "\$cur") )
    return 0
  fi

  # cursor add
  if [[ "\$pprev" == "cursor" && "\$prev" == "add" ]]; then
    COMPREPLY=( $(compgen -W "$(ais _complete cursor 2>/dev/null)" -- "\$cur") )
    return 0
  fi

  # copilot add
  if [[ "\$pprev" == "copilot" && "\$prev" == "add" ]]; then
    COMPREPLY=( $(compgen -W "$(ais _complete copilot 2>/dev/null)" -- "\$cur") )
    return 0
  fi

  # claude skills add
  if [[ "\$ppprev" == "claude" && "\$pprev" == "skills" && "\$prev" == "add" ]]; then
    COMPREPLY=( $(compgen -W "$(ais _complete claude-skills 2>/dev/null)" -- "\$cur") )
    return 0
  fi

  # claude agents add
  if [[ "\$ppprev" == "claude" && "\$pprev" == "agents" && "\$prev" == "add" ]]; then
    COMPREPLY=( $(compgen -W "$(ais _complete claude-agents 2>/dev/null)" -- "\$cur") )
    return 0
  fi

  # cursor skills add
  if [[ "\$ppprev" == "cursor" && "\$pprev" == "skills" && "\$prev" == "add" ]]; then
    COMPREPLY=( $(compgen -W "$(ais _complete cursor-skills 2>/dev/null)" -- "\$cur") )
    return 0
  fi

  # cursor rules add
  if [[ "\$pprev" == "rules" && "\$prev" == "add" ]]; then
    COMPREPLY=( $(compgen -W "$(ais _complete cursor 2>/dev/null)" -- "\$cur") )
    return 0
  fi

  # cursor commands
  if [[ "\$pprev" == "cursor" && "\$prev" == "commands" ]]; then
    COMPREPLY=( $(compgen -W "add remove install" -- "\$cur") )
    return 0
  fi

  # cursor skills
  if [[ "\$pprev" == "cursor" && "\$prev" == "skills" ]]; then
    COMPREPLY=( $(compgen -W "add remove install" -- "\$cur") )
    return 0
  fi

  # cursor rules
  if [[ "\$pprev" == "cursor" && "\$prev" == "rules" ]]; then
    COMPREPLY=( $(compgen -W "add remove install" -- "\$cur") )
    return 0
  fi

  # claude skills
  if [[ "\$pprev" == "claude" && "\$prev" == "skills" ]]; then
    COMPREPLY=( $(compgen -W "add remove install" -- "\$cur") )
    return 0
  fi

  # claude agents
  if [[ "\$pprev" == "claude" && "\$prev" == "agents" ]]; then
    COMPREPLY=( $(compgen -W "add remove install" -- "\$cur") )
    return 0
  fi

  # cursor skills
  if [[ "\$pprev" == "cursor" && "\$prev" == "skills" ]]; then
    COMPREPLY=( $(compgen -W "add remove install" -- "\$cur") )
    return 0
  fi

  if [[ "\$prev" == "cursor" ]]; then
    COMPREPLY=( $(compgen -W "add remove install rules commands skills" -- "\$cur") )
    return 0
  fi

  if [[ "\$prev" == "copilot" ]]; then
    COMPREPLY=( $(compgen -W "add remove install" -- "\$cur") )
    return 0
  fi

  if [[ "\$prev" == "claude" ]]; then
    COMPREPLY=( $(compgen -W "skills agents install" -- "\$cur") )
    return 0
  fi

  if [[ "\$prev" == "ais" ]]; then
    COMPREPLY=( $(compgen -W "cursor copilot claude use list git add remove install completion" -- "\$cur") )
    return 0
  fi
}
complete -F _ais_complete ais
`;

    const zshScript = `
# ais zsh completion
_ais() {
  local -a subcmds
subcmds=(
    'cursor:Manage Cursor rules, commands, and skills'
    'copilot:Manage Copilot instructions'
    'claude:Manage Claude skills, agents, and plugins'
    'use:Configure rules repository'
    'list:List configured repositories'
    'git:Run git commands in rules repository'
    'add:Add a rule (smart dispatch)'
    'remove:Remove a rule (smart dispatch)'
    'install:Install all rules (smart dispatch)'
    'completion:Output shell completion script'
  )

  local -a cursor_subcmds copilot_subcmds claude_subcmds cursor_rules_subcmds cursor_commands_subcmds cursor_skills_subcmds claude_skills_subcmds claude_agents_subcmds
  cursor_subcmds=('add:Add a Cursor rule' 'remove:Remove a Cursor rule' 'install:Install all Cursor entries' 'rules:Manage rules explicitly' 'commands:Manage commands' 'skills:Manage skills')
  copilot_subcmds=('add:Add a Copilot instruction' 'remove:Remove a Copilot instruction' 'install:Install all Copilot instructions')
  claude_subcmds=('skills:Manage Claude skills' 'agents:Manage Claude agents' 'install:Install all Claude components')
  cursor_rules_subcmds=('add:Add a Cursor rule' 'remove:Remove a Cursor rule' 'install:Install all Cursor rules')
  cursor_commands_subcmds=('add:Add a Cursor command' 'remove:Remove a Cursor command' 'install:Install all Cursor commands')
  cursor_skills_subcmds=('add:Add a Cursor skill' 'remove:Remove a Cursor skill' 'install:Install all Cursor skills')
  claude_skills_subcmds=('add:Add a Claude skill' 'remove:Remove a Claude skill' 'install:Install all Claude skills')
  claude_agents_subcmds=('add:Add a Claude agent' 'remove:Remove a Claude agent' 'install:Install all Claude agents')

  _arguments -C \\
    '1:command:->command' \\
    '2:subcommand:->subcommand' \\
    '3:subsubcommand:->subsubcommand' \\
    '4:name:->name' \\
    '*::arg:->args'

  case "\$state" in
    command)
      _describe 'command' subcmds
      ;;
    subcommand)
      case "\$words[2]" in
        cursor)
          _describe 'subcommand' cursor_subcmds
          ;;
        copilot)
          _describe 'subcommand' copilot_subcmds
          ;;
        claude)
          _describe 'subcommand' claude_subcmds
          ;;
      esac
      ;;
    subsubcommand)
      case "\$words[2]" in
        cursor)
          case "\$words[3]" in
            add)
              local -a rules
              rules=(\${(f)"\$(ais _complete cursor 2>/dev/null)"})
              if (( \$#rules )); then
                compadd "\$rules[@]"
              fi
              ;;
            rules)
              _describe 'subsubcommand' cursor_rules_subcmds
              ;;
            commands)
              _describe 'subsubcommand' cursor_commands_subcmds
              ;;
            skills)
              _describe 'subsubcommand' cursor_skills_subcmds
              ;;
            *)
              _describe 'subsubcommand' cursor_subcmds
              ;;
          esac
          ;;
        copilot)
          case "\$words[3]" in
            add)
              local -a instructions
              instructions=(\${(f)"\$(ais _complete copilot 2>/dev/null)"})
              if (( \$#instructions )); then
                compadd "\$instructions[@]"
              fi
              ;;
            *)
              _describe 'subsubcommand' copilot_subcmds
              ;;
          esac
          ;;
        claude)
          case "\$words[3]" in
            skills)
              _describe 'subsubcommand' claude_skills_subcmds
              ;;
            agents)
              _describe 'subsubcommand' claude_agents_subcmds
              ;;
            *)
              _describe 'subsubcommand' claude_subcmds
              ;;
          esac
          ;;
      esac
      ;;
    name)
      case \"\$words[2]\" in
        cursor)
          case \"\$words[3]\" in
            add)
              local -a rules
              rules=(\${(f)\"$(ais _complete cursor 2>/dev/null)\"})
              if (( \$#rules )); then
                compadd \"\$rules[@]\"
              fi
              ;;
            rules)
              case \"\$words[4]\" in
                add)
                  local -a rules
                  rules=(\${(f)\"$(ais _complete cursor 2>/dev/null)\"})
                  if (( \$#rules )); then
                    compadd \"\$rules[@]\"
                  fi
                  ;;
              esac
              ;;
            commands)
              case "\$words[4]" in
                add)
                  local -a commands
                  commands=(\${(f)"$(ais _complete cursor-commands 2>/dev/null)"})
                  if (( \$#commands )); then
                    compadd "\$commands[@]"
                  fi
                  ;;
              esac
              ;;
            skills)
              case \"\$words[4]\" in
                add)
                  local -a skills
                  skills=(\${(f)\"$(ais _complete cursor-skills 2>/dev/null)\"})
                  if (( \$#skills )); then
                    compadd \"\$skills[@]\"
                  fi
                  ;;
              esac
              ;;
          esac
          ;;
        copilot)
          case \"\$words[3]\" in
            add)
              local -a instructions
              instructions=(\${(f)\"$(ais _complete copilot 2>/dev/null)\"})
              if (( \$#instructions )); then
                compadd \"\$instructions[@]\"
              fi
              ;;
          esac
          ;;
        claude)
          case \"\$words[3]\" in
            skills)
              case \"\$words[4]\" in
                add)
                  local -a skills
                  skills=(\${(f)\"$(ais _complete claude-skills 2>/dev/null)\"})
                  if (( \$#skills )); then
                    compadd \"\$skills[@]\"
                  fi
                  ;;
              esac
              ;;
            agents)
              case \"\$words[4]\" in
                add)
                  local -a agents
                  agents=(\${(f)\"$(ais _complete claude-agents 2>/dev/null)\"})
                  if (( \$#agents )); then
                    compadd \"\$agents[@]\"
                  fi
                  ;;
              esac
              ;;
          esac
          ;;
      esac
      ;;
    args)
      # Handle additional arguments
      ;;
  esac
}

# Only define completion if compdef is available (zsh completion initialized)
command -v compdef >/dev/null 2>&1 && compdef _ais ais
`;

    const fishScript = `
# ais fish completion
complete -c ais -f

# Top-level commands
complete -c ais -n "__fish_use_subcommand" -a "cursor" -d "Manage Cursor rules, commands, and skills"
complete -c ais -n "__fish_use_subcommand" -a "copilot" -d "Manage Copilot instructions"
complete -c ais -n "__fish_use_subcommand" -a "claude" -d "Manage Claude skills, agents, and plugins"
complete -c ais -n "__fish_use_subcommand" -a "use" -d "Configure rules repository"
complete -c ais -n "__fish_use_subcommand" -a "list" -d "List configured repositories"
complete -c ais -n "__fish_use_subcommand" -a "git" -d "Run git commands in rules repository"
complete -c ais -n "__fish_use_subcommand" -a "add" -d "Add a rule (smart dispatch)"
complete -c ais -n "__fish_use_subcommand" -a "remove" -d "Remove a rule (smart dispatch)"
complete -c ais -n "__fish_use_subcommand" -a "install" -d "Install all rules (smart dispatch)"
complete -c ais -n "__fish_use_subcommand" -a "completion" -d "Output shell completion script"

# cursor subcommands
complete -c ais -n "__fish_seen_subcommand_from cursor; and not __fish_seen_subcommand_from add remove install rules commands skills" -a "add" -d "Add a Cursor rule"
complete -c ais -n "__fish_seen_subcommand_from cursor; and not __fish_seen_subcommand_from add remove install rules commands skills" -a "remove" -d "Remove a Cursor rule"
complete -c ais -n "__fish_seen_subcommand_from cursor; and not __fish_seen_subcommand_from add remove install rules commands skills" -a "install" -d "Install all Cursor entries"
complete -c ais -n "__fish_seen_subcommand_from cursor; and not __fish_seen_subcommand_from add remove install rules commands skills" -a "rules" -d "Manage rules explicitly"
complete -c ais -n "__fish_seen_subcommand_from cursor; and not __fish_seen_subcommand_from add remove install rules commands skills" -a "commands" -d "Manage commands"
complete -c ais -n "__fish_seen_subcommand_from cursor; and not __fish_seen_subcommand_from add remove install rules commands skills" -a "skills" -d "Manage skills"

# cursor rules subcommands
complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from rules; and not __fish_seen_subcommand_from add remove install" -a "add" -d "Add a Cursor rule"
complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from rules; and not __fish_seen_subcommand_from add remove install" -a "remove" -d "Remove a Cursor rule"
complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from rules; and not __fish_seen_subcommand_from add remove install" -a "install" -d "Install all Cursor rules"

# cursor commands subcommands
complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from commands; and not __fish_seen_subcommand_from add remove install" -a "add" -d "Add a Cursor command"
complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from commands; and not __fish_seen_subcommand_from add remove install" -a "remove" -d "Remove a Cursor command"
complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from commands; and not __fish_seen_subcommand_from add remove install" -a "install" -d "Install all Cursor commands"

# cursor skills subcommands
complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from skills; and not __fish_seen_subcommand_from add remove install" -a "add" -d "Add a Cursor skill"
complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from skills; and not __fish_seen_subcommand_from add remove install" -a "remove" -d "Remove a Cursor skill"
complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from skills; and not __fish_seen_subcommand_from add remove install" -a "install" -d "Install all Cursor skills"

# copilot subcommands
complete -c ais -n "__fish_seen_subcommand_from copilot; and not __fish_seen_subcommand_from add remove install" -a "add" -d "Add a Copilot instruction"
complete -c ais -n "__fish_seen_subcommand_from copilot; and not __fish_seen_subcommand_from add remove install" -a "remove" -d "Remove a Copilot instruction"
complete -c ais -n "__fish_seen_subcommand_from copilot; and not __fish_seen_subcommand_from add remove install" -a "install" -d "Install all Copilot instructions"

# claude subcommands
complete -c ais -n "__fish_seen_subcommand_from claude; and not __fish_seen_subcommand_from skills agents install" -a "skills" -d "Manage Claude skills"
complete -c ais -n "__fish_seen_subcommand_from claude; and not __fish_seen_subcommand_from skills agents install" -a "agents" -d "Manage Claude agents"
complete -c ais -n "__fish_seen_subcommand_from claude; and not __fish_seen_subcommand_from skills agents install" -a "install" -d "Install all Claude components"

# claude skills subcommands
complete -c ais -n "__fish_seen_subcommand_from claude; and __fish_seen_subcommand_from skills; and not __fish_seen_subcommand_from add remove install" -a "add" -d "Add a Claude skill"
complete -c ais -n "__fish_seen_subcommand_from claude; and __fish_seen_subcommand_from skills; and not __fish_seen_subcommand_from add remove install" -a "remove" -d "Remove a Claude skill"
complete -c ais -n "__fish_seen_subcommand_from claude; and __fish_seen_subcommand_from skills; and not __fish_seen_subcommand_from add remove install" -a "install" -d "Install all Claude skills"

# claude agents subcommands
complete -c ais -n "__fish_seen_subcommand_from claude; and __fish_seen_subcommand_from agents; and not __fish_seen_subcommand_from add remove install" -a "add" -d "Add a Claude agent"
complete -c ais -n "__fish_seen_subcommand_from claude; and __fish_seen_subcommand_from agents; and not __fish_seen_subcommand_from add remove install" -a "remove" -d "Remove a Claude agent"
complete -c ais -n "__fish_seen_subcommand_from claude; and __fish_seen_subcommand_from agents; and not __fish_seen_subcommand_from add remove install" -a "install" -d "Install all Claude agents"


complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from add" -a "(ais _complete cursor 2>/dev/null)"
complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from rules; and __fish_seen_subcommand_from add" -a "(ais _complete cursor 2>/dev/null)"
complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from commands; and __fish_seen_subcommand_from add" -a "(ais _complete cursor-commands 2>/dev/null)"
complete -c ais -n "__fish_seen_subcommand_from cursor; and __fish_seen_subcommand_from skills; and __fish_seen_subcommand_from add" -a "(ais _complete cursor-skills 2>/dev/null)"
complete -c ais -n "__fish_seen_subcommand_from copilot; and __fish_seen_subcommand_from add" -a "(ais _complete copilot 2>/dev/null)"
complete -c ais -n "__fish_seen_subcommand_from claude; and __fish_seen_subcommand_from skills; and __fish_seen_subcommand_from add" -a "(ais _complete claude-skills 2>/dev/null)"
complete -c ais -n "__fish_seen_subcommand_from claude; and __fish_seen_subcommand_from agents; and __fish_seen_subcommand_from add" -a "(ais _complete claude-agents 2>/dev/null)"
`;

    switch (shell) {
      case 'bash':
        console.log(bashScript.trim());
        break;
      case 'zsh':
        console.log(zshScript.trim());
        break;
      case 'fish':
        console.log(fishScript.trim());
        break;
      default:
        console.error(`Unknown shell: ${shell}. Supported: bash, zsh, fish`);
        process.exit(1);
    }
  })

// Install completion to shell config file
completionCmd
  .command('install')
  .description('Install shell completion to your shell config file')
  .option('-f, --force', 'Force reinstall even if already installed')
  .action(async (options) => {
    try {
      await forceInstallCompletion(options.force);
    } catch (error: any) {
      console.error(chalk.red('Error installing completion:'), error.message);
      process.exit(1);
    }
  });

// Check for first-run completion prompt before parsing
async function main() {
  // Completion prompt has been removed. Users can install manually with: ais completion install
  program.parse();
}

main()
