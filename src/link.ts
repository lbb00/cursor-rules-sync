import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { RepoConfig } from './config.js';
import { addIgnoreEntry, removeIgnoreEntry } from './utils.js';
import { getProjectConfig } from './project-config.js';
import {
    install as _linkanyInstall,
    remove as _linkanyRemove,
    type Manifest,
    type Result,
} from 'linkany';

// Cursor uses a linkany version that supports passing an in-memory manifest JSON.
// Some type environments may still see older signatures, so we cast to the runtime shape we rely on.
type LinkanyOpReturn = Promise<{ result: Result; manifest: Manifest }>;
const linkanyInstall = _linkanyInstall as unknown as (manifest: string | unknown, opts?: unknown) => LinkanyOpReturn;
const linkanyRemove = _linkanyRemove as unknown as (manifest: string | unknown, key: string, opts?: unknown) => LinkanyOpReturn;

export async function linkRule(projectPath: string, ruleName: string, repo: RepoConfig, alias?: string, isLocal: boolean = false) {
    const repoDir = repo.path;

    // Determine root path: repo internal config > default
    const repoConfig = await getProjectConfig(repoDir);
    const rootPath = repoConfig.rootPath || 'rules';

    const sourceRulePath = path.join(repoDir, rootPath, ruleName);

    if (!await fs.pathExists(sourceRulePath)) {
        throw new Error(`Rule "${ruleName}" not found in repository "${repo.name}".`);
    }

    const targetName = alias || ruleName;
    const absoluteProjectPath = path.resolve(projectPath);
    const targetDir = path.join(absoluteProjectPath, '.cursor', 'rules');
    const targetRulePath = path.join(targetDir, targetName);

    // Create .cursor/rules directory if not exists
    await fs.ensureDir(targetDir);

    // linkany supports passing an in-memory manifest JSON; CRS does NOT create any manifest files in the project.
    const { result } = await linkanyInstall({
        version: 1,
        installs: [{ source: sourceRulePath, target: targetRulePath, atomic: true }]
    }, {
        baseDir: absoluteProjectPath,
        audit: false,
        // Do not set manifestPath, otherwise linkany may derive a default audit path.
        manifestPath: undefined
    });

    if (!result.ok) {
        const errText = result.errors.join('; ');
        if (result.errors.some((e: string) => e.toLowerCase().includes('conflict: target exists and is not a symlink'))) {
            console.log(chalk.yellow(`Warning: "${targetRulePath}" exists and is not a symlink. Skipping to avoid data loss.`));
            return;
        }
        throw new Error(errText || `Failed to link "${targetName}".`);
    }

    const changed = result.changes.some((c: { action: string }) => c.action === 'symlink' || c.action === 'move' || c.action === 'unlink');
    if (changed) {
        console.log(chalk.green(`Linked rule "${ruleName}" to project as "${targetName}".`));
    } else {
        console.log(chalk.gray(`Rule "${targetName}" already linked.`));
    }

    const ignoreEntry = `.cursor/rules/${targetName}`;

    let ignoreFilePath: string;
    let isPrivate = false;

    if (isLocal) {
        // Try .git/info/exclude
        const gitInfoExclude = path.join(absoluteProjectPath, '.git', 'info', 'exclude');
        if (await fs.pathExists(path.dirname(gitInfoExclude))) {
            ignoreFilePath = gitInfoExclude;
            isPrivate = true;
            if (!await fs.pathExists(ignoreFilePath)) {
                await fs.createFile(ignoreFilePath);
            }
        } else {
             console.log(chalk.yellow(`Warning: Could not find .git/info/exclude. Skipping automatic ignore for private rule.`));
             console.log(chalk.yellow(`Please manually add "${ignoreEntry}" to your private ignore file.`));
             return;
        }
    } else {
        ignoreFilePath = path.join(absoluteProjectPath, '.gitignore');
        isPrivate = false;
    }

    const added = await addIgnoreEntry(ignoreFilePath, ignoreEntry, '# Cursor Rules');
    const fileName = isPrivate ? '.git/info/exclude' : '.gitignore';

    if (added) {
        console.log(chalk.green(`Added "${ignoreEntry}" to ${fileName}.`));
    } else {
        console.log(chalk.gray(`"${ignoreEntry}" already in ${fileName}.`));
    }
}

export async function unlinkRule(projectPath: string, alias: string) {
    const absoluteProjectPath = path.resolve(projectPath);
    const targetDir = path.join(absoluteProjectPath, '.cursor', 'rules');
    const targetRulePath = path.join(targetDir, alias);

    // Use linkany with in-memory manifest to perform a safe unlink (never deletes real files/dirs).
    const { result } = await linkanyRemove({
        version: 1,
        installs: [{ source: targetRulePath, target: targetRulePath }]
    }, targetRulePath, {
        baseDir: absoluteProjectPath,
        audit: false,
        manifestPath: undefined
    });

    const removed = result.ok && result.changes.some((c: { action: string; target?: string }) => c.action === 'unlink' && c.target === targetRulePath);
    if (removed) {
        console.log(chalk.green(`Removed rule "${alias}" from project.`));
    } else {
        console.log(chalk.yellow(`Rule "${alias}" not found in project (or not a symlink).`));
    }

    // Handle ignore file - Try to remove from BOTH .gitignore and .git/info/exclude
    const ignoreEntry = `.cursor/rules/${alias}`;

    // 1. .gitignore
    const gitignorePath = path.join(absoluteProjectPath, '.gitignore');
    if (await removeIgnoreEntry(gitignorePath, ignoreEntry)) {
        console.log(chalk.green(`Removed "${ignoreEntry}" from .gitignore.`));
    }

    // 2. .git/info/exclude
    const gitInfoExclude = path.join(absoluteProjectPath, '.git', 'info', 'exclude');
    if (await removeIgnoreEntry(gitInfoExclude, ignoreEntry)) {
        console.log(chalk.green(`Removed "${ignoreEntry}" from .git/info/exclude.`));
    }
}

