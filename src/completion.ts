import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import readline from 'readline';
import { getConfig, setConfig } from './config.js';

export type ShellType = 'bash' | 'zsh' | 'fish' | 'unknown';

/**
 * Detect the current shell type from environment variable
 */
export function detectShell(): ShellType {
  const shell = process.env.SHELL || '';
  if (shell.includes('zsh')) return 'zsh';
  if (shell.includes('fish')) return 'fish';
  if (shell.includes('bash')) return 'bash';
  return 'unknown';
}

/**
 * Get the shell configuration file path based on shell type and platform
 */
export function getShellConfigPath(shell: ShellType): string | null {
  const home = os.homedir();

  switch (shell) {
    case 'zsh':
      return path.join(home, '.zshrc');
    case 'fish':
      return path.join(home, '.config', 'fish', 'config.fish');
    case 'bash':
      // macOS uses .bash_profile by convention, Linux uses .bashrc
      if (process.platform === 'darwin') {
        const bashProfile = path.join(home, '.bash_profile');
        // Prefer .bash_profile on macOS if it exists, otherwise use .bashrc
        if (fs.existsSync(bashProfile)) {
          return bashProfile;
        }
        // Fall back to .bashrc if .bash_profile doesn't exist
        return path.join(home, '.bashrc');
      }
      return path.join(home, '.bashrc');
    default:
      return null;
  }
}

/**
 * Generate the completion snippet to be added to shell config
 */
export function getCompletionSnippet(shell: ShellType): string {
  const marker = '# ais shell completion';

  if (shell === 'fish') {
    return `\n${marker}\nais completion fish | source\n`;
  }

  // For zsh, try to save completion to file first, then source it
  if (shell === 'zsh') {
    return `\n${marker}\n# Save and source AIS completion script\nais completion > ~/.zsh/ais_completion.zsh 2>/dev/null && source ~/.zsh/ais_completion.zsh\n`;
  }

  // bash uses eval
  return `\n${marker}\neval "$(ais completion)"\n`;
}

/**
 * Check if completion is already installed in the config file
 */
export async function isCompletionInstalled(configPath: string): Promise<boolean> {
  if (!await fs.pathExists(configPath)) {
    return false;
  }

  const content = await fs.readFile(configPath, 'utf-8');
  return content.includes('# ais shell completion') || content.includes('ais completion');
}

/**
 * Install completion script to shell config file
 */
export async function installCompletionToFile(shell: ShellType): Promise<{ success: boolean; configPath: string | null; alreadyInstalled: boolean }> {
  const configPath = getShellConfigPath(shell);

  if (!configPath) {
    return { success: false, configPath: null, alreadyInstalled: false };
  }

  // Check if already installed
  if (await isCompletionInstalled(configPath)) {
    return { success: true, configPath, alreadyInstalled: true };
  }

  // Ensure parent directory exists (for fish)
  await fs.ensureDir(path.dirname(configPath));

  // Append the completion snippet
  const snippet = getCompletionSnippet(shell);
  await fs.appendFile(configPath, snippet);

  return { success: true, configPath, alreadyInstalled: false };
}

/**
 * Simple prompt for user input
 */
async function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

/**
 * Check if running in a TTY (interactive terminal)
 */
function isInteractive(): boolean {
  // Primary check: are we running in a TTY?
  const isTTY = process.stdin.isTTY === true && process.stdout.isTTY === true;

  // Also allow if explicitly requested via environment variable (for testing)
  const forceInteractive = process.env.AIS_FORCE_INTERACTIVE === 'true';

  return isTTY || forceInteractive;
}

/**
 * Main entry point: check and prompt for completion installation on first run
 */
export async function checkAndPromptCompletion(): Promise<void> {
  // Skip if not interactive (e.g., running in scripts, piped commands)
  if (!isInteractive()) {
    return;
  }

  const config = await getConfig();

  // Skip if already handled
  if (config.completionInstalled) {
    return;
  }

  const shell = detectShell();

  if (shell === 'unknown') {
    // Can't detect shell, mark as handled to avoid repeated checks
    await setConfig({ completionInstalled: true });
    return;
  }

  const configPath = getShellConfigPath(shell);
  if (!configPath) {
    await setConfig({ completionInstalled: true });
    return;
  }

  // Check if already installed in the file (manual installation)
  if (await isCompletionInstalled(configPath)) {
    await setConfig({ completionInstalled: true });
    return;
  }

  // Prompt user
  console.log('');
  console.log(chalk.cyan('🔧 Detected first run of ais'));
  console.log(chalk.gray(`   Shell: ${shell} (${configPath})`));
  console.log('');
  console.log('Would you like to install shell tab completion?');
  console.log(chalk.gray('This enables auto-completion for ais commands.'));
  console.log('');

  const answer = await promptUser(`${chalk.bold('[Y]es')} / ${chalk.gray('[n]o')} / ${chalk.gray('[?] help')}: `);

  if (answer === '?' || answer === 'help') {
    console.log('');
    console.log(chalk.bold('Shell completion allows you to:'));
    console.log('  - Press TAB to auto-complete commands (ais cur<TAB> → ais cursor)');
    console.log('  - Press TAB to see available subcommands');
    console.log('  - Press TAB to complete rule names from your repository');
    console.log('');
    console.log(chalk.gray(`This will add the following line to ${configPath}:`));
    console.log(chalk.gray(shell === 'fish' ? '  ais completion fish | source' : '  eval "$(ais completion)"'));
    console.log('');

    const answer2 = await promptUser(`Install completion? ${chalk.bold('[Y]es')} / ${chalk.gray('[n]o')}: `);
    if (answer2 === 'y' || answer2 === 'yes' || answer2 === '') {
      await doInstall(shell, configPath);
    } else {
      console.log(chalk.gray('Skipped. You can install later with: ais completion install'));
    }
  } else if (answer === 'y' || answer === 'yes' || answer === '') {
    await doInstall(shell, configPath);
  } else {
    console.log(chalk.gray('Skipped. You can install later with: ais completion install'));
  }

  // Mark as handled
  await setConfig({ completionInstalled: true });
  console.log('');
}

/**
 * Perform the actual installation
 */
async function doInstall(shell: ShellType, configPath: string): Promise<void> {
  try {
    const result = await installCompletionToFile(shell);

    if (result.alreadyInstalled) {
      console.log(chalk.green('✓ Shell completion is already installed.'));
    } else if (result.success) {
      console.log(chalk.green(`✓ Shell completion installed to ${configPath}`));
      console.log(chalk.yellow(`  Restart your terminal or run: source ${configPath}`));
    } else {
      console.log(chalk.red('✗ Failed to install shell completion.'));
      console.log(chalk.gray(`  You can manually add this to your shell config:`));
      console.log(chalk.gray(shell === 'fish' ? '  ais completion fish | source' : '  eval "$(ais completion)"'));
    }
  } catch (error: any) {
    console.log(chalk.red(`✗ Error installing completion: ${error.message}`));
    console.log(chalk.gray(`  You can manually add this to ${configPath}:`));
    console.log(chalk.gray(shell === 'fish' ? '  ais completion fish | source' : '  eval "$(ais completion)"'));
  }
}

/**
 * Force install completion (for ais completion install command)
 */
export async function forceInstallCompletion(force: boolean = false): Promise<void> {
  const shell = detectShell();

  if (shell === 'unknown') {
    console.log(chalk.red('Could not detect your shell type.'));
    console.log(chalk.gray('Please manually add completion to your shell config:'));
    console.log(chalk.gray('  Bash/Zsh: eval "$(ais completion)"'));
    console.log(chalk.gray('  Fish: ais completion fish | source'));
    return;
  }

  const configPath = getShellConfigPath(shell);
  if (!configPath) {
    console.log(chalk.red(`Unsupported shell: ${shell}`));
    return;
  }

  // Check if already installed
  if (!force && await isCompletionInstalled(configPath)) {
    console.log(chalk.yellow(`Shell completion is already installed in ${configPath}`));
    console.log(chalk.gray('Use --force to reinstall.'));
    return;
  }

  // If force, we need to remove existing and re-add
  if (force && await isCompletionInstalled(configPath)) {
    // Read file, remove existing completion block, then add new one
    let content = await fs.readFile(configPath, 'utf-8');
    // Remove existing ais completion lines
    const lines = content.split('\n');
    const filteredLines = lines.filter(line => {
      return !line.includes('# ais shell completion') &&
             !line.includes('ais completion fish | source') &&
             !line.includes('eval "$(ais completion)"');
    });
    content = filteredLines.join('\n');
    await fs.writeFile(configPath, content);
  }

  await doInstall(shell, configPath);
  await setConfig({ completionInstalled: true });
}
