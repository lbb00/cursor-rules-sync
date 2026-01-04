import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { RepoConfig } from './config.js';
import { addIgnoreEntry, removeIgnoreEntry } from './utils.js';
import { getProjectConfig } from './project-config.js';
import {
    install as linkanyInstall,
    remove as linkanyRemove,
    loadOrCreateManifest,
    saveManifest,
    upsertEntry,
} from 'linkany';

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

    // linkany is a standalone package now; CRS uses it to do safe symlink convergence.
    // We keep a small manifest in the project root (gitignored) to enable linkany's API.
    const manifestPath = path.join(absoluteProjectPath, '.cursor-rules-sync.linkany.json');

    // Ensure manifest is gitignored (it's tool-internal; no need to commit)
    try {
        await fs.ensureFile(path.join(absoluteProjectPath, '.gitignore'));
        await addIgnoreEntry(path.join(absoluteProjectPath, '.gitignore'), '.cursor-rules-sync.linkany.json', '# Cursor Rules Sync');
    } catch {
        // best-effort; ignore if we can't write .gitignore
    }

    // 1) Update manifest (so we can re-install / replace existing symlink safely)
    const manifest = await loadOrCreateManifest(manifestPath);
    upsertEntry(manifest, { source: sourceRulePath, target: targetRulePath, atomic: true });
    await saveManifest(manifestPath, manifest);

    // 2) Converge filesystem state according to manifest
    const res = await linkanyInstall(manifestPath);

    if (!res.ok) {
        const errText = res.errors.join('; ');
        // install() emits a clear conflict error when target exists and isn't a symlink
        if (res.errors.some(e => e.toLowerCase().includes('conflict: target exists and is not a symlink'))) {
            console.log(chalk.yellow(`Warning: "${targetRulePath}" exists and is not a symlink. Skipping to avoid data loss.`));
            return;
        }
        throw new Error(errText || `Failed to link "${targetName}".`);
    }

    const changed = res.changes.some(c => c.action === 'symlink' || c.action === 'move' || c.action === 'unlink');
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

    const manifestPath = path.join(absoluteProjectPath, '.cursor-rules-sync.linkany.json');

    // Try linkany-based removal first (manifest-backed). If manifest is missing or entry isn't found,
    // fall back to a safe unlink that never deletes real files/dirs.
    let removed = false;
    if (await fs.pathExists(manifestPath)) {
        const res = await linkanyRemove(manifestPath, targetRulePath);
        if (res.ok) {
            removed = res.changes.some(c => c.action === 'unlink' && c.target === targetRulePath);
        } else {
            // ignore "Entry not found" and fall through to safe unlink
            if (!res.errors.some(e => e.toLowerCase().includes('entry not found'))) {
                throw new Error(res.errors.join('; ') || `Failed to remove "${alias}".`);
            }
        }
    }

    if (!removed) {
        if (await fs.pathExists(targetRulePath)) {
            const st = await fs.lstat(targetRulePath);
            if (st.isSymbolicLink()) {
                await fs.unlink(targetRulePath);
                removed = true;
            }
        }
    }

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

