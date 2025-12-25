import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { RepoConfig } from './config.js';
import { addIgnoreEntry, removeIgnoreEntry } from './utils.js';

export async function linkRule(projectPath: string, ruleName: string, repo: RepoConfig, alias?: string, isLocal: boolean = false) {
    const repoDir = repo.path;
    const sourceRulePath = path.join(repoDir, 'rules', ruleName);

    if (!await fs.pathExists(sourceRulePath)) {
        throw new Error(`Rule "${ruleName}" not found in repository "${repo.name}".`);
    }

    const targetName = alias || ruleName;
    const absoluteProjectPath = path.resolve(projectPath);
    const targetDir = path.join(absoluteProjectPath, '.cursor', 'rules');
    const targetRulePath = path.join(targetDir, targetName);

    // Create .cursor/rules directory if not exists
    await fs.ensureDir(targetDir);

    // Create symlink
    if (await fs.pathExists(targetRulePath)) {
        const stats = await fs.lstat(targetRulePath);
        if (stats.isSymbolicLink()) {
            console.log(chalk.yellow(`Rule "${targetName}" already linked. Re-linking...`));
            await fs.remove(targetRulePath);
        } else {
            console.log(chalk.yellow(`Warning: "${targetRulePath}" exists and is not a symlink. Skipping to avoid data loss.`));
            return;
        }
    }

    await fs.ensureSymlink(sourceRulePath, targetRulePath);
    console.log(chalk.green(`Linked rule "${ruleName}" to project as "${targetName}".`));

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

    // Remove symlink/file
    if (await fs.pathExists(targetRulePath)) {
        await fs.remove(targetRulePath);
        console.log(chalk.green(`Removed rule "${alias}" from project.`));
    } else {
        console.log(chalk.yellow(`Rule "${alias}" not found in project.`));
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

