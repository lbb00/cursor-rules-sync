import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { execa } from 'execa';
import { RepoConfig } from './config.js';
import { SyncAdapter, LinkResult, SyncOptions } from './adapters/types.js';
import { addIgnoreEntry, removeIgnoreEntry } from './utils.js';
import { getRepoSourceConfig, getSourceDir } from './project-config.js';

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

    // Get source directory from repo config
    const repoConfig = await getRepoSourceConfig(repoDir);
    const sourceDir = getSourceDir(repoConfig, adapter.tool, adapter.subtype, adapter.defaultSourceDir);

    // Resolve source
    let sourceName: string;
    let sourcePath: string;
    let suffix: string | undefined;

    if (adapter.resolveSource) {
        const resolved = await adapter.resolveSource(repoDir, sourceDir, name);
        sourceName = resolved.sourceName;
        sourcePath = resolved.sourcePath;
        suffix = resolved.suffix;
    } else {
        // Default resolution
        sourcePath = path.join(repoDir, sourceDir, name);
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

/**
 * Import options extending SyncOptions
 */
export interface ImportOptions extends SyncOptions {
    commitMessage?: string;
    force?: boolean;
    push?: boolean;
}

/**
 * Import an entry from project to rules repository
 * This is the reverse operation of link - it copies local files to the repo,
 * commits them, removes the originals, and creates symlinks back.
 */
export async function importEntry(
    adapter: SyncAdapter,
    options: ImportOptions
): Promise<{ imported: boolean; sourceName: string; targetName: string }> {
    const { projectPath, name, repo, force = false, push = false, commitMessage } = options;

    // 1. Check if entry exists in project
    const absoluteProjectPath = path.resolve(projectPath);
    const targetDir = path.join(absoluteProjectPath, adapter.targetDir);
    const targetPath = path.join(targetDir, name);

    if (!await fs.pathExists(targetPath)) {
        throw new Error(`Entry "${name}" not found in project at ${targetPath}`);
    }

    // 2. Check if it's already a symlink (already managed)
    const stats = await fs.lstat(targetPath);
    if (stats.isSymbolicLink()) {
        throw new Error(`Entry "${name}" is already a symlink (already managed by ai-rules-sync)`);
    }

    // 3. Determine destination in rules repository
    const repoDir = repo.path;
    const repoConfig = await getRepoSourceConfig(repoDir);
    const sourceDir = getSourceDir(repoConfig, adapter.tool, adapter.subtype, adapter.defaultSourceDir);
    const destPath = path.join(repoDir, sourceDir, name);

    // 4. Check if destination already exists
    if (await fs.pathExists(destPath)) {
        if (!force) {
            throw new Error(`Entry "${name}" already exists in rules repository at ${destPath}. Use --force to overwrite.`);
        }
        console.log(chalk.yellow(`Entry "${name}" already exists in repository. Overwriting (--force)...`));
        await fs.remove(destPath);
    }

    // 5. Copy to rules repository
    await fs.copy(targetPath, destPath);
    console.log(chalk.green(`Copied "${name}" to rules repository.`));

    // 6. Git add and commit
    const relativePath = path.relative(repoDir, destPath);
    await execa('git', ['add', relativePath], { cwd: repoDir });
    const message = commitMessage || `Import ${adapter.tool} ${adapter.subtype}: ${name}`;
    await execa('git', ['commit', '-m', message], { cwd: repoDir, stdio: 'inherit' });
    console.log(chalk.green(`Committed to rules repository.`));

    // 7. Push to remote if --push flag is set
    if (push) {
        console.log(chalk.gray('Pushing to remote repository...'));
        await execa('git', ['push'], { cwd: repoDir, stdio: 'inherit' });
        console.log(chalk.green(`Pushed to remote repository.`));
    }

    // 8. Remove original from project
    await fs.remove(targetPath);
    console.log(chalk.green(`Removed original from project.`));

    // 9. Create symlink using existing link functionality
    const linkResult = await linkEntry(adapter, options);

    return {
        imported: true,
        sourceName: linkResult.sourceName,
        targetName: linkResult.targetName
    };
}
