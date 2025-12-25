#!/usr/bin/env node
import { Command } from 'commander'
import chalk from 'chalk'
import path from 'path'
import fs from 'fs-extra'
import { getConfig, setConfig, getReposBaseDir, getCurrentRepo, RepoConfig } from './config.js'
import { cloneOrUpdateRepo, runGitCommand } from './git.js'
import { linkRule, unlinkRule } from './link.js'
import { addIgnoreEntry } from './utils.js'
import { addDependency, removeDependency, getProjectConfig, getCombinedProjectConfig } from './project-config.js'

const program = new Command()

program.name('crs').description('Cursor Rules Sync - Sync cursor rules from git repository').version('1.0.0')
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

        // If name exists and URL matches, just use it (already handled by step 1/loop above?
        // No, step 1 checked key=target. The loop checked value.url=target.
        // If we get here, target is not a key, and target URL is not in values.
        // But 'name' derived from target might match a key with DIFFERENT url (handled by collision check)
        // or same URL (should be handled by loop, but loop might miss if config structure is weird? Unlikely).
        // Let's proceed with adding.

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
  .option('-l, --local', 'Add to cursor-rules.local.json (private rule)')
  .action(async (ruleName, alias, options) => {
    try {
      const opts = program.opts();
      const currentRepo = await getTargetRepo(opts);

      // Project path is always current directory in this simplified model
      // The second argument is now strictly the ALIAS (target name)
      const projectPath = process.cwd();

      console.log(chalk.gray(`Using repository: ${chalk.cyan(currentRepo.name)} (${currentRepo.url})`))

      const isLocal = options.local;
      await linkRule(projectPath, ruleName, currentRepo, alias, isLocal)

      // Save dependency
      await addDependency(projectPath, ruleName, currentRepo.url, alias, isLocal)

      const configFileName = isLocal ? 'cursor-rules.local.json' : 'cursor-rules.json';
      console.log(chalk.green(`Updated ${configFileName} dependency.`))

      if (isLocal) {
          // Add cursor-rules.local.json to .gitignore if not present
          const gitignorePath = path.join(projectPath, '.gitignore');
          const added = await addIgnoreEntry(gitignorePath, 'cursor-rules.local.json', '# Local Cursor Rules Config');

          if (added) {
            console.log(chalk.green(`Added "cursor-rules.local.json" to .gitignore.`));
          }
      }

    } catch (error: any) {
      console.error(chalk.red('Error adding rule:'), error.message)
      process.exit(1)
    }
  })

program
  .command('remove')
  .description('Remove a cursor rule from project')
  .argument('<alias>', 'Alias (or name) of the rule to remove')
  .action(async (alias) => {
    try {
      const projectPath = process.cwd();

      // 1. Remove symlink and ignore entry
      await unlinkRule(projectPath, alias);

      // 2. Remove dependency from config (both global and local)
      const removedFrom = await removeDependency(projectPath, alias);

      if (removedFrom.length > 0) {
        console.log(chalk.green(`Removed rule "${alias}" from configuration: ${removedFrom.join(', ')}`));
      } else {
        console.log(chalk.yellow(`Rule "${alias}" was not found in any configuration file.`));
      }

    } catch (error: any) {
      console.error(chalk.red('Error removing rule:'), error.message)
      process.exit(1)
    }
  })

program
  .command('install')
  .description('Install all rules from cursor-rules.json')
    .action(async () => {
      try {
        const projectPath = process.cwd();
        const config = await getCombinedProjectConfig(projectPath)
        const rules = config.rules

        if (!rules || Object.keys(rules).length === 0) {
          console.log(chalk.yellow('No rules found in cursor-rules.json or cursor-rules.local.json.'))
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

        // Determine if this rule came from local config
        // Since we read combined config, we don't know easily without checking local file separately or changing getCombinedProjectConfig
        // BUT, getCombinedProjectConfig merges.
        // If we want strict privacy, crs install might be tricky if mixed.
        // Simple solution: check if key exists in local config file.
        const localConfig = await getProjectConfig(projectPath).then(async () => {
             // We need to read raw local file
             const localPath = path.join(projectPath, 'cursor-rules.local.json');
             if (await fs.pathExists(localPath)) {
                 return await fs.readJson(localPath);
             }
             return { rules: {} };
        });

        // Check if rule is in local config rules
        // Note: localConfig structure matches ProjectConfig interface
        let isLocal = false;
        if (localConfig.rules) {
            // Check if 'key' (the alias/name used in rules object) exists in local rules
            if (Object.prototype.hasOwnProperty.call(localConfig.rules, key)) {
                isLocal = true;
            }
        }

        await linkRule(projectPath, ruleName, repoConfig, alias, isLocal)
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
  .argument('[args...]', 'Git arguments')
  .allowUnknownOption()
  .action(async (args, commandObj) => {
    // args will contain everything after 'git' that isn't a known global option
    // IF we use .argument('[args...]').

    // However, with allowUnknownOption, commander behavior is subtle.
    // If we define arguments, commander tries to parse them.

    // Let's rely on manual parsing from process.argv to be safe and consistent with previous logic,
    // but we need to update the command definition to NOT enforce single arg.

    // Actually, simply removing .argument() or changing to [args...] should fix the validation error.

    // The previous implementation manually sliced process.argv.
    // Let's keep that manual slicing logic as it handles the "global option after subcommand" case reasonably well
    // provided we fix the validation error.

    const procArgs = process.argv
    const gitIndex = procArgs.indexOf('git')

    // ... (rest of logic)

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

program.parse()
