# Cursor Rules Sync

[![Npm](https://badgen.net/npm/v/cursor-rules-sync)](https://www.npmjs.com/package/cursor-rules-sync)
[![License](https://img.shields.io/github/license/lbb00/cursor-rules-sync.svg)](https://github.com/lbb00/cursor-rules-sync/blob/master/LICENSE)
[![Npm download](https://img.shields.io/npm/dw/cursor-rules-sync.svg)](https://www.npmjs.com/package/cursor-rules-sync)

[English](./README.md) | [中文](./README_ZH.md)

**Cursor Rules Sync (CRS)**
*Synchronize, Manage, and Share Your Cursor IDE Rules with Ease.*

CRS allows you to centrally manage Cursor rules in Git repositories and synchronize them across any number of projects using symbolic links. Say goodbye to copy-pasting `.mdc` files and drifting configurations.

## linkany (standalone package)

CRS uses **`linkany`** — a safety-first symlink + manifest manager — as an **independent npm package**.

- **Package**: `linkany` (see the upstream repository in `package.json`)
- **Import**:

```js
import { add, remove, install, uninstall } from 'linkany';
```

CRS keeps a small, tool-internal manifest at project root: **`.cursor-rules-sync.linkany.json`** (auto-added to `.gitignore`).

### Why CRS?

- **🧩 Multi-Repository & Decentralized**: Mix and match rules from various sources—company standards, team-specific protocols, or open-source collections—without conflict.
- **🔄 Sync Once, Update Everywhere**: Define your rules in one place. CRS ensures every project stays in sync with the latest standards automatically.
- **🤝 Seamless Team Alignment**: Enforce shared coding standards and behaviors across your entire team. Onboard new members instantly with a single command.
- **🔒 Privacy First**: Need project-specific overrides or private rules? Use `cursor-rules.local.json` to keep sensitive rules out of version control.
- **🛠️ Integrated Git Management**: Manage your rule repositories directly through the CLI. Pull updates, check status, or switch branches without leaving your project context using `crs git`.

## Install

```bash
npm install -g cursor-rules-sync
```

## Create a new cursor rules git repository

- `rules` folder is the default root folder for cursor rules.
- To use a different folder (e.g., `packages/rules`), add a `cursor-rules.json` file to the root of your repository:

  ```json
  {
    "rootPath": "packages/rules"
  }
  ```

## Global Options

All commands support the following global options:

- `-t, --target <repo>`: Specify the target rule repository to use (name or URL).

## Commands

### Config cursor rules git repository

```bash
crs use [git repository url | response name]
```

If `[git repository url]` is not provided, it will search the response name in the `~/.cursor-rules-sync/config.json` file.

### List all cursor rules git repositories

```bash
crs list
```

### Sync cursor rules to project

```bash
crs add [rule name] [alias]
```

This command must be run in the root of your project.

It will generate a symbolic link form the cursor rules git repository `rules/[rule name]` folder to the project `.cursor/rules/[rule name]` folder.

If you provide an `[alias]`, it will be linked to `.cursor/rules/[alias]`. This is useful for renaming rules or handling conflicts.

**Adding Private Rules:**

Use the `-l` or `--local` flag to add a rule to `cursor-rules.local.json` instead of `cursor-rules.json`. This is useful for rules that you don't want to commit to git.

```bash
crs add react --local
```

This command will also automatically add `cursor-rules.local.json` to your `.gitignore` file.

Examples:

```bash
# Add 'react' rule as 'react'
crs add react

# Add 'react' rule as 'react-v1'
crs add react react-v1

# Add 'react' rule from a specific repo as 'react-v2'
crs add react react-v2 -t other-repo

# Add 'react' rule directly from a Git URL
crs add react -t https://github.com/user/rules-repo.git
```

It also creates or updates `cursor-rules.json` (or `cursor-rules.local.json`) in your project root to track dependencies.

### Remove a cursor rule

```bash
crs remove [alias]
```

This command removes the symbolic link, the ignore entry, and the dependency from `cursor-rules.json` (or `cursor-rules.local.json`).

### cursor-rules.json structure

The `cursor-rules.json` file uses a `rules` object to map rule names to git repository URLs. It supports both simple string values (repo URL) and object values for aliased rules.

```json
{
  "rules": {
    "react": "https://github.com/user/repo.git",
    "react-v2": {
      "url": "https://github.com/user/another-repo.git",
      "rule": "react"
    }
  }
}
```

### Local/Private Rules

You can use `cursor-rules.local.json` to add private rules that are not committed to git. This file uses the same structure as `cursor-rules.json` and its rules are merged with the main configuration (local rules take precedence).

### Install rules from configuration

If you have a `cursor-rules.json` file in your project, you can install all dependencies with one command:

```bash
crs install
```

This will automatically configure repositories and link rules.

### Git Commands

Use git commands to manage the cursor rules git repository.

```bash
crs git [command]
```

Example: check status of a specific repository:

```bash
crs git status -t [repo name]
```
