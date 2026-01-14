#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { getConfig, setConfig, getReposBaseDir, getCurrentRepo, RepoConfig } from './config.js';
import { cloneOrUpdateRepo, runGitCommand } from './git.js';
import { addIgnoreEntry } from './utils.js';
import { getCombinedProjectConfig, getRepoSourceConfig, getSourceDir } from './project-config.js';
import { checkAndPromptCompletion, forceInstallCompletion } from './completion.js';
import { getCompletionScript } from './completion/scripts.js';
import { adapterRegistry, getAdapter, findAdapterForAlias } from './adapters/index.js';
import { registerAdapterCommands } from './cli/register.js';
import {
  getTargetRepo,
  inferDefaultMode,
  requireExplicitMode,
  resolveCopilotAliasFromConfig,
  resolveCommandAliasFromConfig,
  DefaultMode
} from './commands/helpers.js';
import { handleAdd, handleRemove, handleImport } from './commands/handlers.js';
import { installEntriesForAdapter, installEntriesForTool } from './commands/install.js';

const program = new Command();

program.name('ais').description('AI Rules Sync - Sync agent rules from git repository').version('1.0.0')
    .option('-t, --target <repoName>', 'Specify target rule repository (name or URL)');

// ============ Use command ============
program
  .command('use')
  .description('Config cursor rules git repository')
  .argument('[urlOrName]', 'Git repository URL or response name')
  .action(async (urlOrName) => {
    try {
      const config = await getConfig();

      if (!urlOrName) {
        if (config.currentRepo) {
          console.log(chalk.blue(`Current repository: ${config.currentRepo} (${config.repos[config.currentRepo].url})`));
          return;
        } else {
          console.error(chalk.red('Error: Please provide a git repository URL or name.'));
          process.exit(1);
        }
      }

      if (config.repos && config.repos[urlOrName]) {
        await setConfig({ currentRepo: urlOrName });
        console.log(chalk.green(`Switched to repository: ${urlOrName}`));
        await cloneOrUpdateRepo(config.repos[urlOrName]);
        return;
      }

      const isUrl = urlOrName.includes('://') || urlOrName.includes('git@') || urlOrName.endsWith('.git');

      if (isUrl) {
        const url = urlOrName;
        let name = path.basename(url, '.git');
        if (!name) name = 'default';

        if (config.repos && config.repos[name] && config.repos[name].url !== url) {
          console.log(chalk.yellow(`Warning: Repository with name "${name}" already exists. Overwriting...`));
        }

        const repoDir = path.join(getReposBaseDir(), name);
        const newRepo: RepoConfig = { name, url, path: repoDir };
        const newRepos = { ...(config.repos || {}), [name]: newRepo };

        await setConfig({ currentRepo: name, repos: newRepos });
        console.log(chalk.green(`Configured repository: ${name} (${url})`));
        await cloneOrUpdateRepo(newRepo);
        console.log(chalk.green('Repository ready.'));
      } else {
        console.error(chalk.red(`Error: Repository "${urlOrName}" not found in configuration.`));
        console.log(chalk.yellow(`Use "ais use <url>" to add a new repository.`));
        process.exit(1);
      }
    } catch (error: any) {
      console.error(chalk.red('Error configuring repository:'), error.message);
      process.exit(1);
    }
  });

// ============ List command ============
program
  .command('list')
  .description('List all cursor rules git repositories')
  .action(async () => {
    const config = await getConfig();
    const repos = config.repos || {};
    const names = Object.keys(repos);

    if (names.length === 0) {
      console.log(chalk.yellow('No repositories configured. Use "ais use [url]" to configure.'));
      return;
    }

    console.log(chalk.bold('Configured repositories:'));
    for (const name of names) {
      const repo = repos[name];
      const isCurrent = name === config.currentRepo;
      const prefix = isCurrent ? chalk.green('* ') : '  ';
      console.log(`${prefix}${chalk.cyan(name)} ${chalk.gray(`(${repo.url})`)}`);
      if (isCurrent) {
        console.log(`    Local path: ${repo.path}`);
      }
    }
  });

// ============ Top-level shortcuts ============
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

      if (mode === 'cursor') {
        const adapter = getAdapter('cursor', 'rules');
        await handleAdd(adapter, { projectPath, repo: currentRepo, isLocal: options.local || false }, name, alias);
      } else if (mode === 'copilot') {
        const adapter = getAdapter('copilot', 'instructions');
        await handleAdd(adapter, { projectPath, repo: currentRepo, isLocal: options.local || false }, name, alias);
      } else if (mode === 'claude') {
        throw new Error('For Claude components, please use "ais claude skills/agents add" explicitly.');
      }
    } catch (error: any) {
      console.error(chalk.red('Error adding entry:'), error.message);
      process.exit(1);
    }
  });

program
  .command('remove')
  .description('Remove an entry (auto-detects cursor/copilot if unambiguous)')
  .argument('<alias>', 'Alias/name in the project to remove')
  .action(async (alias) => {
    try {
      const projectPath = process.cwd();
      const cfg = await getCombinedProjectConfig(projectPath);

      // Find which adapter contains this alias
      const found = findAdapterForAlias(cfg, alias);

      if (found) {
        await handleRemove(found.adapter, projectPath, alias);
      } else {
        // Alias not found in config, try to infer mode
        const mode = await inferDefaultMode(projectPath);
        if (mode === 'none' || mode === 'ambiguous') {
          requireExplicitMode(mode);
        }

        let adapter;
        if (mode === 'cursor') {
          adapter = getAdapter('cursor', 'rules');
        } else if (mode === 'copilot') {
          // Try to resolve the alias with suffix
          const resolved = resolveCopilotAliasFromConfig(alias, Object.keys(cfg.copilot?.instructions || {}));
          adapter = getAdapter('copilot', 'instructions');
          alias = resolved;
        } else if (mode === 'claude') {
          // Try all Claude adapters
          const claudeAdapters = adapterRegistry.getForTool('claude');
          for (const a of claudeAdapters) {
            await a.unlink(projectPath, alias);
            await a.removeDependency(projectPath, alias);
          }
          return;
        } else {
          throw new Error(`Cannot determine which tool to use for alias "${alias}"`);
        }

        await handleRemove(adapter, projectPath, alias);
      }
    } catch (error: any) {
      console.error(chalk.red('Error removing entry:'), error.message);
      process.exit(1);
    }
  });

program
  .command('install')
  .description('Install all entries from config (cursor + copilot + claude)')
  .action(async () => {
    try {
      const projectPath = process.cwd();
      const mode = await inferDefaultMode(projectPath);

      if (mode === 'none') {
        console.log(chalk.yellow('No config found in ai-rules-sync*.json.'));
        return;
      }

      if (mode === 'cursor' || mode === 'ambiguous') {
        await installEntriesForTool(adapterRegistry.getForTool('cursor'), projectPath);
      }
      if (mode === 'copilot' || mode === 'ambiguous') {
        await installEntriesForTool(adapterRegistry.getForTool('copilot'), projectPath);
      }
      if (mode === 'claude' || mode === 'ambiguous') {
        await installEntriesForTool(adapterRegistry.getForTool('claude'), projectPath);
      }
    } catch (error: any) {
      console.error(chalk.red('Error installing entries:'), error.message);
      process.exit(1);
    }
  });

// Top-level import command (auto-detect)
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
      const allAdapters = adapterRegistry.all();
      let foundAdapter = null;

      for (const adapter of allAdapters) {
        const targetPath = path.join(projectPath, adapter.targetDir, name);
        if (await fs.pathExists(targetPath)) {
          foundAdapter = adapter;
          break;
        }
      }

      if (!foundAdapter) {
        throw new Error(`Entry "${name}" not found in any known location. Try: ais import cursor rules ${name}`);
      }

      console.log(chalk.gray(`Detected ${foundAdapter.tool} ${foundAdapter.subtype}: ${name}`));
      await handleImport(foundAdapter, { projectPath, repo: currentRepo, isLocal: options.local || false }, name, options);
    } catch (error: any) {
      console.error(chalk.red('Error importing entry:'), error.message);
      process.exit(1);
    }
  });

// ============ Cursor command group ============
const cursor = program
  .command('cursor')
  .description('Manage Cursor rules, commands, and skills in a project');

// cursor add (default to rules)
cursor
  .command('add <name> [alias]')
  .description('Sync Cursor rules to project (.cursor/rules/...)')
  .option('-l, --local', 'Add to ai-rules-sync.local.json (private rule)')
  .action(async (name, alias, options) => {
    try {
      const repo = await getTargetRepo(program.opts());
      const adapter = getAdapter('cursor', 'rules');
      await handleAdd(adapter, { projectPath: process.cwd(), repo, isLocal: options.local || false }, name, alias);
    } catch (error: any) {
      console.error(chalk.red('Error adding Cursor rule:'), error.message);
      process.exit(1);
    }
  });

// cursor remove (default to rules)
cursor
  .command('remove <alias>')
  .description('Remove a Cursor rule from project')
  .action(async (alias) => {
    try {
      const adapter = getAdapter('cursor', 'rules');
      await handleRemove(adapter, process.cwd(), alias);
    } catch (error: any) {
      console.error(chalk.red('Error removing Cursor rule:'), error.message);
      process.exit(1);
    }
  });

// cursor install
cursor
  .command('install')
  .description('Install all Cursor rules, commands, and skills from config')
  .action(async () => {
    try {
      await installEntriesForTool(adapterRegistry.getForTool('cursor'), process.cwd());
    } catch (error: any) {
      console.error(chalk.red('Error installing Cursor entries:'), error.message);
      process.exit(1);
    }
  });

// cursor import
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
      const repo = await getTargetRepo(program.opts());
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
        throw new Error(`Entry "${name}" not found in .cursor/rules, .cursor/commands, or .cursor/skills.`);
      }

      console.log(chalk.gray(`Detected ${foundAdapter.subtype}: ${name}`));
      await handleImport(foundAdapter, { projectPath, repo, isLocal: options.local || false }, name, options);
    } catch (error: any) {
      console.error(chalk.red('Error importing Cursor entry:'), error.message);
      process.exit(1);
    }
  });

// cursor rules subgroup
const cursorRules = cursor.command('rules').description('Manage Cursor rules explicitly');
registerAdapterCommands({ adapter: getAdapter('cursor', 'rules'), parentCommand: cursorRules, programOpts: () => program.opts() });

// cursor commands subgroup
const cursorCommands = cursor.command('commands').description('Manage Cursor commands');
registerAdapterCommands({ adapter: getAdapter('cursor', 'commands'), parentCommand: cursorCommands, programOpts: () => program.opts() });

// cursor skills subgroup
const cursorSkills = cursor.command('skills').description('Manage Cursor skills');
registerAdapterCommands({ adapter: getAdapter('cursor', 'skills'), parentCommand: cursorSkills, programOpts: () => program.opts() });

// ============ Copilot command group ============
const copilot = program
  .command('copilot')
  .description('Manage Copilot instructions in a project');

// copilot add
copilot
  .command('add <name> [alias]')
  .description('Sync Copilot instruction to project (.github/instructions/...)')
  .option('-l, --local', 'Add to ai-rules-sync.local.json (private)')
  .action(async (name, alias, options) => {
    try {
      const repo = await getTargetRepo(program.opts());
      const adapter = getAdapter('copilot', 'instructions');
      await handleAdd(adapter, { projectPath: process.cwd(), repo, isLocal: options.local || false }, name, alias);
    } catch (error: any) {
      console.error(chalk.red('Error adding Copilot instruction:'), error.message);
      process.exit(1);
    }
  });

// copilot remove
copilot
  .command('remove <alias>')
  .description('Remove a Copilot instruction from project')
  .action(async (alias) => {
    try {
      const cfg = await getCombinedProjectConfig(process.cwd());
      const resolved = resolveCopilotAliasFromConfig(alias, Object.keys(cfg.copilot?.instructions || {}));
      const adapter = getAdapter('copilot', 'instructions');
      await handleRemove(adapter, process.cwd(), resolved);
    } catch (error: any) {
      console.error(chalk.red('Error removing Copilot instruction:'), error.message);
      process.exit(1);
    }
  });

// copilot install
copilot
  .command('install')
  .description('Install all Copilot instructions from config')
  .action(async () => {
    try {
      const adapter = getAdapter('copilot', 'instructions');
      await installEntriesForAdapter(adapter, process.cwd());
    } catch (error: any) {
      console.error(chalk.red('Error installing Copilot instructions:'), error.message);
      process.exit(1);
    }
  });

// copilot import
copilot
  .command('import <name>')
  .description('Import Copilot instruction from project to repository')
  .option('-l, --local', 'Add to ai-rules-sync.local.json (private)')
  .option('-m, --message <message>', 'Custom git commit message')
  .option('-f, --force', 'Overwrite if entry already exists in repository')
  .option('-p, --push', 'Push to remote repository after commit')
  .action(async (name, options) => {
    try {
      const repo = await getTargetRepo(program.opts());
      const adapter = getAdapter('copilot', 'instructions');
      await handleImport(adapter, { projectPath: process.cwd(), repo, isLocal: options.local || false }, name, options);
    } catch (error: any) {
      console.error(chalk.red('Error importing Copilot instruction:'), error.message);
      process.exit(1);
    }
  });

// ============ Claude command group ============
const claude = program
  .command('claude')
  .description('Manage Claude skills and agents in a project');

// claude install
claude
  .command('install')
  .description('Install all Claude skills and agents from config')
  .action(async () => {
    try {
      await installEntriesForTool(adapterRegistry.getForTool('claude'), process.cwd());
    } catch (error: any) {
      console.error(chalk.red('Error installing Claude entries:'), error.message);
      process.exit(1);
    }
  });

// claude skills subgroup
const claudeSkills = claude.command('skills').description('Manage Claude skills');
registerAdapterCommands({ adapter: getAdapter('claude', 'skills'), parentCommand: claudeSkills, programOpts: () => program.opts() });

// claude agents subgroup
const claudeAgents = claude.command('agents').description('Manage Claude agents');
registerAdapterCommands({ adapter: getAdapter('claude', 'agents'), parentCommand: claudeAgents, programOpts: () => program.opts() });

// ============ Git command ============
program
  .command('git')
  .description('Run git commands in the rules repository')
  .argument('<args...>', 'Git command arguments')
  .action(async (args: string[]) => {
    try {
      const opts = program.opts();
      const currentRepo = await getTargetRepo(opts);
      await runGitCommand(args, currentRepo.path);
    } catch (error: any) {
      console.error(chalk.red('Error running git command:'), error.message);
      process.exit(1);
    }
  });

// ============ Internal _complete command ============
program
  .command('_complete')
  .argument('<type>', 'Type of completion: cursor, cursor-commands, cursor-skills, copilot, claude-skills, claude-agents')
  .description('Internal command for shell completion')
  .action(async (type: string) => {
    try {
      const config = await getConfig();
      const currentRepo = config.currentRepo ? config.repos?.[config.currentRepo] : undefined;

      if (!currentRepo) {
        process.exit(0);
      }

      const repoDir = currentRepo.path;
      if (!await fs.pathExists(repoDir)) {
        process.exit(0);
      }

      const repoConfig = await getRepoSourceConfig(repoDir);
      let sourceDir: string;

      switch (type) {
        case 'cursor':
          sourceDir = getSourceDir(repoConfig, 'cursor', 'rules', '.cursor/rules');
          break;
        case 'cursor-commands':
          sourceDir = getSourceDir(repoConfig, 'cursor', 'commands', '.cursor/commands');
          break;
        case 'cursor-skills':
          sourceDir = getSourceDir(repoConfig, 'cursor', 'skills', '.cursor/skills');
          break;
        case 'copilot':
          sourceDir = getSourceDir(repoConfig, 'copilot', 'instructions', '.github/instructions');
          break;
        case 'claude-skills':
          sourceDir = getSourceDir(repoConfig, 'claude', 'skills', '.claude/skills');
          break;
        case 'claude-agents':
          sourceDir = getSourceDir(repoConfig, 'claude', 'agents', '.claude/agents');
          break;
        default:
          process.exit(0);
      }

      const fullPath = path.join(repoDir, sourceDir);
      if (!await fs.pathExists(fullPath)) {
        process.exit(0);
      }

      const items = await fs.readdir(fullPath);
      for (const item of items) {
        if (!item.startsWith('.')) {
          console.log(item);
        }
      }
    } catch {
      process.exit(0);
    }
  });

// ============ Completion command group ============
const completionCmd = program
  .command('completion')
  .argument('[shell]', 'Shell type: bash, zsh, fish')
  .description('Output shell completion script')
  .action(async (shell?: string) => {
    if (!shell) {
      console.error('Please specify a shell type: bash, zsh, or fish');
      process.exit(1);
    }

    if (shell !== 'bash' && shell !== 'zsh' && shell !== 'fish') {
      console.error(`Unknown shell: ${shell}. Supported: bash, zsh, fish`);
      process.exit(1);
    }

    console.log(getCompletionScript(shell));
  });

completionCmd
  .command('install')
  .description('Install shell completion to your shell config file')
  .option('-f, --force', 'Force reinstall even if already installed')
  .action(async (options) => {
    try {
      await forceInstallCompletion(options.force || false);
    } catch (error: any) {
      console.error(chalk.red('Error installing completion:'), error.message);
      process.exit(1);
    }
  });

// ============ Run CLI ============
async function main() {
  await checkAndPromptCompletion();
  program.parse(process.argv);
}

main();
