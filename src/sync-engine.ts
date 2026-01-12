import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { RepoConfig } from './config.js';
import { SyncAdapter, LinkResult, SyncOptions } from './adapters/types.js';
import { addIgnoreEntry, removeIgnoreEntry } from './utils.js';
import { getProjectConfig } from './project-config.js';

/**
 * Generic sync engine that works with any SyncAdapter
 */

/**
 * Link an entry using the specified adapter
 */
export async function linkEntry(
    adapter: SyncAdapter,
    options: SyncOptions
): Promise<LinkResult> {
    const { projectPath, name, repo, alias, isLocal = false } = options;
    const repoDir = repo.path;

    // Get root path from repo config
    const repoConfig = await getProjectConfig(repoDir);
    const rootPath = repoConfig.rootPath || adapter.defaultSourceDir;

    // Resolve source
    let sourceName: string;
    let sourcePath: string;
    let suffix: string | undefined;

    if (adapter.resolveSource) {
        const resolved = await adapter.resolveSource(repoDir, rootPath, name);
        sourceName = resolved.sourceName;
        sourcePath = resolved.sourcePath;
        suffix = resolved.suffix;
    } else {
        // Default resolution
        sourcePath = path.join(repoDir, rootPath, name);
        if (!await fs.pathExists(sourcePath)) {
            throw new Error(`Entry "${name}" not found in repository.`);
        }
        sourceName = name;
    }

    // Resolve target name
    let targetName: string;
    if (adapter.resolveTargetName) {
        targetName = adapter.resolveTargetName(name, alias, suffix);
    } else {
        targetName = alias || name;
    }

    const absoluteProjectPath = path.resolve(projectPath);
    const targetDir = path.join(absoluteProjectPath, adapter.targetDir);
    const targetPath = path.join(targetDir, targetName);

    // Ensure target directory exists
    await fs.ensureDir(targetDir);

    // Create symlink
    if (await fs.pathExists(targetPath)) {
        const stats = await fs.lstat(targetPath);
        if (stats.isSymbolicLink()) {
            console.log(chalk.yellow(`Entry "${targetName}" already linked. Re-linking...`));
            await fs.remove(targetPath);
        } else {
            console.log(chalk.yellow(`Warning: "${targetPath}" exists and is not a symlink. Skipping to avoid data loss.`));
            return { sourceName, targetName, linked: false };
        }
    }

    await fs.ensureSymlink(sourcePath, targetPath);
    console.log(chalk.green(`Linked "${sourceName}" to project as "${targetName}".`));

    // Handle ignore file
    const ignoreEntry = `${adapter.targetDir}/${targetName}`;
    await handleIgnoreEntry(absoluteProjectPath, ignoreEntry, isLocal, true);

    return { sourceName, targetName, linked: true };
}

/**
 * Unlink an entry using the specified adapter
 */
export async function unlinkEntry(
    adapter: SyncAdapter,
    projectPath: string,
    alias: string
): Promise<void> {
    const absoluteProjectPath = path.resolve(projectPath);
    const targetDir = path.join(absoluteProjectPath, adapter.targetDir);
    const targetPath = path.join(targetDir, alias);

    // Remove symlink/file
    if (await fs.pathExists(targetPath)) {
        await fs.remove(targetPath);
        console.log(chalk.green(`Removed "${alias}" from project.`));
    } else {
        console.log(chalk.yellow(`Entry "${alias}" not found in project.`));
    }

    // Remove from ignore files
    const ignoreEntry = `${adapter.targetDir}/${alias}`;

    const gitignorePath = path.join(absoluteProjectPath, '.gitignore');
    if (await removeIgnoreEntry(gitignorePath, ignoreEntry)) {
        console.log(chalk.green(`Removed "${ignoreEntry}" from .gitignore.`));
    }

    const gitInfoExclude = path.join(absoluteProjectPath, '.git', 'info', 'exclude');
    if (await removeIgnoreEntry(gitInfoExclude, ignoreEntry)) {
        console.log(chalk.green(`Removed "${ignoreEntry}" from .git/info/exclude.`));
    }
}

/**
 * Handle adding/removing entries from ignore files
 */
async function handleIgnoreEntry(
    projectPath: string,
    entry: string,
    isLocal: boolean,
    add: boolean
): Promise<void> {
    let ignoreFilePath: string;
    let isPrivate = false;

    if (isLocal) {
        const gitInfoExclude = path.join(projectPath, '.git', 'info', 'exclude');
        if (await fs.pathExists(path.dirname(gitInfoExclude))) {
            ignoreFilePath = gitInfoExclude;
            isPrivate = true;
            if (!await fs.pathExists(ignoreFilePath)) {
                await fs.createFile(ignoreFilePath);
            }
        } else {
            console.log(chalk.yellow(`Warning: Could not find .git/info/exclude. Skipping automatic ignore for private entry.`));
            console.log(chalk.yellow(`Please manually add "${entry}" to your private ignore file.`));
            return;
        }
    } else {
        ignoreFilePath = path.join(projectPath, '.gitignore');
        isPrivate = false;
    }

    if (add) {
        const added = await addIgnoreEntry(ignoreFilePath, entry, '# AI Rules Sync');
        const fileName = isPrivate ? '.git/info/exclude' : '.gitignore';

        if (added) {
            console.log(chalk.green(`Added "${entry}" to ${fileName}.`));
        } else {
            console.log(chalk.gray(`"${entry}" already in ${fileName}.`));
        }
    }
}
