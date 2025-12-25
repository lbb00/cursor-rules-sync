#!/usr/bin/env node
import { Command } from 'commander'
import chalk from 'chalk'
import path from 'path'
import fs from 'fs-extra'
import { getConfig, setConfig, getReposBaseDir, getCurrentRepo, RepoConfig } from './config.js'
import { cloneOrUpdateRepo, runGitCommand } from './git.js'
import { linkRule } from './link.js'
import { addDependency, getProjectConfig } from './project-config.js'

const program = new Command()

program.name('crs').description('Cursor Rules Sync - Sync cursor rules from git repository').version('1.0.0')
    .option('-t, --target <repoName>', 'Specify target rule repository');

// Helper to get repo config
async function getTargetRepo(options: any): Promise<RepoConfig> {
  const config = await getConfig();

  if (options.target) {
    const repoName = options.target;
    if (config.repos && config.repos[repoName]) {
      return config.repos[repoName];
    }
    throw new Error(`Repository "${repoName}" not found in configuration.`);
  }

  const currentRepo = await getCurrentRepo();
  if (!currentRepo) {
    throw new Error('No repository configured. Please run "crs use [url]" first.');
  }
  return currentRepo;
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
        // Derive name
        // e.g. https://github.com/foo/bar.git -> bar
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
        console.log(chalk.yellow(`Use "crs use <url>" to add a new repository.`))
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
      console.log(chalk.yellow('No repositories configured. Use "crs use [url]" to configure.'))
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

program
  .command('add')
  .description('Sync cursor rules to project')
  .argument('<ruleName>', 'Name of the rule directory in the rules repo')
  .argument('[alias]', 'Alias for the rule name (e.g. react-v2)')
  .action(async (ruleName, alias, options) => {
    try {
      const opts = program.opts();
      const currentRepo = await getTargetRepo(opts);

      // Project path is always current directory in this simplified model
      // The second argument is now strictly the ALIAS (target name)
      const projectPath = process.cwd();

      console.log(chalk.gray(`Using repository: ${chalk.cyan(currentRepo.name)} (${currentRepo.url})`))

      await linkRule(projectPath, ruleName, currentRepo, alias)

      // Save dependency
      await addDependency(projectPath, ruleName, currentRepo.url, alias)
      console.log(chalk.green(`Updated cursor-rules.json dependency.`))
    } catch (error: any) {
      console.error(chalk.red('Error adding rule:'), error.message)
      process.exit(1)
    }
  })

program
  .command('install')
  .description('Install all rules from cursor-rules.json')
    .action(async () => {
      try {
        const projectPath = process.cwd();
        const config = await getProjectConfig(projectPath)
        const rules = config.rules

        if (!rules || Object.keys(rules).length === 0) {
          console.log(chalk.yellow('No rules found in cursor-rules.json.'))
          return
        }

        const globalConfig = await getConfig()
        const repos = globalConfig.repos || {}

        for (const [key, value] of Object.entries(rules)) {
          let repoUrl: string;
          let ruleName: string;
          let alias: string | undefined;

          // Parse value which can be string or object
          if (typeof value === 'string') {
              repoUrl = value;
              ruleName = key;
              alias = undefined; // key is ruleName
          } else {
              repoUrl = value.url;
              ruleName = value.rule || key;
              alias = key; // key is alias
          }

          console.log(chalk.blue(`Installing rule "${ruleName}" (as "${key}") from ${repoUrl}...`))

        // Find local repo config for this URL
        let repoConfig: RepoConfig | undefined

        for (const key in repos) {
          if (repos[key].url === repoUrl) {
            repoConfig = repos[key]
            break
          }
        }

        if (!repoConfig) {
          console.log(chalk.yellow(`Repository for ${ruleName} not found locally. Configuring...`))

          let name = path.basename(repoUrl, '.git')
          if (!name) name = `repo-${Date.now()}`

          if (repos[name]) {
            name = `${name}-${Date.now()}`
          }

          const repoDir = path.join(getReposBaseDir(), name)
          repoConfig = {
            name,
            url: repoUrl,
            path: repoDir,
          }

          await setConfig({
            repos: { ...repos, [name]: repoConfig },
          })

          await cloneOrUpdateRepo(repoConfig)
        } else {
          if (!(await fs.pathExists(repoConfig.path))) {
            await cloneOrUpdateRepo(repoConfig)
          }
        }

        await linkRule(projectPath, ruleName, repoConfig, alias)
      }
      console.log(chalk.green('All rules installed successfully.'))
    } catch (error: any) {
      console.error(chalk.red('Error installing rules:'), error.message)
      process.exit(1)
    }
  })

program
  .command('git')
  .description('Run git commands in the rules repository')
  .argument('[command]', 'Git command to run')
  .allowUnknownOption()
  .action(async (_cmd, commandObj) => {
    const args = process.argv
    const gitIndex = args.indexOf('git')

    // We need to parse our own options from process.argv if we use allowUnknownOption
    // However, global options might be consumed by commander if placed before subcommand.
    // If placed after, allowUnknownOption logic applies.
    // But since we define -t on program, commander should parse it if it appears.

    // Let's rely on program.opts() for global options.
    const opts = program.opts();

    // Filter out global options from git args?
    // This is tricky. simpler is to trust commander to extract opts.
    // But gitArgs should contain everything after 'git'.
    // If user runs `crs git status -t`, args might contain -t.
    // If user runs `crs -t repo git status`, args won't contain -t.

    let gitArgs = args.slice(gitIndex + 1)

    // If -t is passed after git, we need to remove it from gitArgs so git doesn't choke on it (unless git supports it)
    // BUT user specifically said `crs git status -t`. This implies -t is for US.
    // So we should filter it out.
    // Simplest way: filter out '-t' and its value from gitArgs.

    const newGitArgs = [];
    for (let i = 0; i < gitArgs.length; i++) {
        if (gitArgs[i] === '-t' || gitArgs[i] === '--target') {
            // It's our option. Consume it and next arg.
            // But wait, commander already parsed it into program.opts().target?
            // If passed after subcommand, maybe yes maybe no depending on commander version/config.
            // With .enablePositionalOptions() maybe?
            // Default commander behavior: options after subcommand are subcommand options.
            // But we defined it on program.

            // To be safe and simple: manually remove -t/--target and its value from gitArgs.
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

program.parse()
