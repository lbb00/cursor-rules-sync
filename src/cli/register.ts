/**
 * Declarative CLI registration module
 * Reduces command registration duplication by generating commands from adapter configuration
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { SyncAdapter } from '../adapters/types.js';
import { handleAdd, handleRemove, handleImport, ImportCommandOptions } from '../commands/handlers.js';
import { installEntriesForAdapter } from '../commands/install.js';
import { getTargetRepo } from '../commands/helpers.js';

/**
 * Options for registering commands for an adapter
 */
export interface RegisterCommandsOptions {
  adapter: SyncAdapter;
  parentCommand: Command;
  programOpts: () => { target?: string };
}

/**
 * Register add/remove/install/import commands for an adapter
 */
export function registerAdapterCommands(options: RegisterCommandsOptions): void {
  const { adapter, parentCommand, programOpts } = options;
  const entityName = getSingularName(adapter.subtype);

  // Add command
  parentCommand
    .command('add <name> [alias]')
    .description(`Sync ${adapter.tool} ${entityName} to project`)
    .option('-l, --local', 'Add to ai-rules-sync.local.json (private)')
    .action(async (name: string, alias: string | undefined, cmdOptions: { local?: boolean }) => {
      try {
        const repo = await getTargetRepo(programOpts());
        await handleAdd(adapter, {
          projectPath: process.cwd(),
          repo,
          isLocal: cmdOptions.local || false
        }, name, alias);
      } catch (error: any) {
        console.error(chalk.red(`Error adding ${adapter.tool} ${entityName}:`), error.message);
        process.exit(1);
      }
    });

  // Remove command
  parentCommand
    .command('remove <alias>')
    .description(`Remove a ${adapter.tool} ${entityName} from project`)
    .action(async (alias: string) => {
      try {
        await handleRemove(adapter, process.cwd(), alias);
      } catch (error: any) {
        console.error(chalk.red(`Error removing ${adapter.tool} ${entityName}:`), error.message);
        process.exit(1);
      }
    });

  // Install command
  parentCommand
    .command('install')
    .description(`Install all ${adapter.tool} ${adapter.subtype} from config`)
    .action(async () => {
      try {
        await installEntriesForAdapter(adapter, process.cwd());
      } catch (error: any) {
        console.error(chalk.red(`Error installing ${adapter.tool} ${adapter.subtype}:`), error.message);
        process.exit(1);
      }
    });

  // Import command
  parentCommand
    .command('import <name>')
    .description(`Import ${adapter.tool} ${entityName} from project to repository`)
    .option('-l, --local', 'Add to ai-rules-sync.local.json (private)')
    .option('-m, --message <message>', 'Custom git commit message')
    .option('-f, --force', 'Overwrite if entry already exists in repository')
    .option('-p, --push', 'Push to remote repository after commit')
    .action(async (name: string, cmdOptions: ImportCommandOptions & { local?: boolean }) => {
      try {
        const repo = await getTargetRepo(programOpts());
        await handleImport(adapter, {
          projectPath: process.cwd(),
          repo,
          isLocal: cmdOptions.local || false
        }, name, cmdOptions);
      } catch (error: any) {
        console.error(chalk.red(`Error importing ${adapter.tool} ${entityName}:`), error.message);
        process.exit(1);
      }
    });
}

/**
 * Get singular name from plural subtype
 * e.g., 'rules' -> 'rule', 'skills' -> 'skill'
 */
function getSingularName(subtype: string): string {
  if (subtype.endsWith('s')) {
    return subtype.slice(0, -1);
  }
  return subtype;
}
