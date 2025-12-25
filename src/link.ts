import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { RepoConfig } from './config.js';

export async function linkRule(projectPath: string, ruleName: string, repo: RepoConfig, alias?: string) {
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

    // Add to .gitignore
    const gitignorePath = path.join(absoluteProjectPath, '.gitignore');
    const ignoreContent = `\n# Cursor Rules\n.cursor/rules/${targetName}\n`;

    let hasIgnore = false;
    if (await fs.pathExists(gitignorePath)) {
        const content = await fs.readFile(gitignorePath, 'utf-8');
        if (content.includes(`.cursor/rules/${targetName}`)) {
            hasIgnore = true;
        }
    }

    if (!hasIgnore) {
        await fs.appendFile(gitignorePath, ignoreContent);
        console.log(chalk.green(`Added ".cursor/rules/${targetName}" to .gitignore.`));
    } else {
        console.log(chalk.gray(`".cursor/rules/${targetName}" already in .gitignore.`));
    }
}

