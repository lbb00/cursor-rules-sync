# Cursor Rules Sync

[English](./README.md) | [中文](./README_ZH.md)

This project is used by symbolic link to sync cursor rules from one git repository to any project.

## Install

```bash
npm install -g cursor-rules-sync
```

## Create a new cursor rules git repository

- `rules` folder is the root folder for cursor rules.

## Global Options

All commands support the following global options:

- `-t, --target <repo>`: Specify the target rule repository to use.

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

Examples:

```bash
# Add 'react' rule as 'react'
crs add react

# Add 'react' rule as 'react-v1'
crs add react react-v1

# Add 'react' rule from a specific repo as 'react-v2'
crs add react react-v2 -t other-repo
```

It also creates or updates `cursor-rules.json` in your project root to track dependencies.

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
