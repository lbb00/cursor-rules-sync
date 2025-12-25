import { execa } from 'execa';
import fs from 'fs-extra';
import { RepoConfig } from './config.js';

export async function cloneOrUpdateRepo(repo: RepoConfig) {
  const repoDir = repo.path;
  const repoUrl = repo.url;

  if (await fs.pathExists(repoDir)) {
    // Check if it is a git repo
    const isGit = await fs.pathExists(`${repoDir}/.git`);
    if (isGit) {
      console.log(`Updating cursor rules repository (${repo.name})...`);
      // Try to fetch and check if pull is needed or just pull
      // Using pull directly is simpler for this use case
      await execa('git', ['pull'], { cwd: repoDir, stdio: 'inherit' });
    } else {
      // Not a git repo, clean and clone
      await fs.remove(repoDir);
      await clone(repoUrl, repoDir);
    }
  } else {
    await clone(repoUrl, repoDir);
  }
}

async function clone(url: string, dir: string) {
  console.log(`Cloning ${url}...`);
  await fs.ensureDir(dir);
  await execa('git', ['clone', url, '.'], { cwd: dir, stdio: 'inherit' });
}

export async function runGitCommand(args: string[], repoPath: string) {
  if (!await fs.pathExists(repoPath)) {
    throw new Error('Cursor rules repository not found at ' + repoPath);
  }

  await execa('git', args, { cwd: repoPath, stdio: 'inherit' });
}
