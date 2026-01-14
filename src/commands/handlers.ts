/**
 * Generic command handlers that work with any adapter
 */

import path from 'path';
import chalk from 'chalk';
import fs from 'fs-extra';
import { RepoConfig } from '../config.js';
import { SyncAdapter } from '../adapters/types.js';
import { linkEntry, unlinkEntry, importEntry, ImportOptions } from '../sync-engine.js';
import { addIgnoreEntry } from '../utils.js';

/**
 * Context for command execution
 */
export interface CommandContext {
  projectPath: string;
  repo: RepoConfig;
  isLocal: boolean;
}

/**
 * Result of an add operation
 */
export interface AddResult {
  sourceName: string;
  targetName: string;
  linked: boolean;
  migrated: boolean;
}

/**
 * Generic add command handler - works with any adapter
 */
export async function handleAdd(
  adapter: SyncAdapter,
  ctx: CommandContext,
  name: string,
  alias?: string
): Promise<AddResult> {
  console.log(chalk.gray(`Using repository: ${chalk.cyan(ctx.repo.name)} (${ctx.repo.url})`));

  const result = await adapter.link({
    projectPath: ctx.projectPath,
    name,
    repo: ctx.repo,
    alias,
    isLocal: ctx.isLocal
  });

  const depAlias = result.targetName === result.sourceName ? undefined : result.targetName;
  const { migrated } = await adapter.addDependency(
    ctx.projectPath,
    result.sourceName,
    ctx.repo.url,
    depAlias,
    ctx.isLocal
  );

  const configFileName = ctx.isLocal ? 'ai-rules-sync.local.json' : 'ai-rules-sync.json';
  console.log(chalk.green(`Updated ${configFileName} dependency.`));

  if (migrated) {
    console.log(chalk.yellow('Detected legacy "cursor-rules*.json". Migrated to "ai-rules-sync*.json". Consider deleting the legacy files to avoid ambiguity.'));
  }

  if (ctx.isLocal) {
    const gitignorePath = path.join(ctx.projectPath, '.gitignore');
    const added = await addIgnoreEntry(gitignorePath, 'ai-rules-sync.local.json', '# Local AI Rules Sync Config');
    if (added) {
      console.log(chalk.green(`Added "ai-rules-sync.local.json" to .gitignore.`));
    }
  }

  return {
    sourceName: result.sourceName,
    targetName: result.targetName,
    linked: result.linked,
    migrated
  };
}

/**
 * Result of a remove operation
 */
export interface RemoveResult {
  removedFrom: string[];
  migrated: boolean;
}

/**
 * Generic remove command handler - works with any adapter
 */
export async function handleRemove(
  adapter: SyncAdapter,
  projectPath: string,
  alias: string
): Promise<RemoveResult> {
  await adapter.unlink(projectPath, alias);

  const { removedFrom, migrated } = await adapter.removeDependency(projectPath, alias);

  if (removedFrom.length > 0) {
    console.log(chalk.green(`Removed "${alias}" from configuration: ${removedFrom.join(', ')}`));
  } else {
    console.log(chalk.yellow(`"${alias}" was not found in any configuration file.`));
  }

  if (migrated) {
    console.log(chalk.yellow('Detected legacy "cursor-rules*.json". Migrated to "ai-rules-sync*.json". Consider deleting the legacy files to avoid ambiguity.'));
  }

  return { removedFrom, migrated };
}

/**
 * Options for import command
 */
export interface ImportCommandOptions {
  local?: boolean;
  message?: string;
  force?: boolean;
  push?: boolean;
}

/**
 * Generic import command handler - works with any adapter
 */
export async function handleImport(
  adapter: SyncAdapter,
  ctx: CommandContext,
  name: string,
  options: ImportCommandOptions
): Promise<void> {
  console.log(chalk.gray(`Using repository: ${chalk.cyan(ctx.repo.name)} (${ctx.repo.url})`));

  const importOpts: ImportOptions = {
    projectPath: ctx.projectPath,
    name,
    repo: ctx.repo,
    isLocal: ctx.isLocal,
    commitMessage: options.message,
    force: options.force,
    push: options.push
  };

  const result = await importEntry(adapter, importOpts);

  // Add to config
  await adapter.addDependency(ctx.projectPath, name, ctx.repo.url, undefined, ctx.isLocal);
  const configFileName = ctx.isLocal ? 'ai-rules-sync.local.json' : 'ai-rules-sync.json';
  console.log(chalk.green(`Updated ${configFileName} dependency.`));

  if (ctx.isLocal) {
    const gitignorePath = path.join(ctx.projectPath, '.gitignore');
    const added = await addIgnoreEntry(gitignorePath, 'ai-rules-sync.local.json', '# Local AI Rules Sync Config');
    if (added) {
      console.log(chalk.green(`Added "ai-rules-sync.local.json" to .gitignore.`));
    }
  }

  console.log(chalk.bold.green(`\n✓ Successfully imported "${name}"!`));
}
