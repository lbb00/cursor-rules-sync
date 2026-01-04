# Project Knowledge Base

## Project Overview
**Cursor Rules Sync (crs)** is a CLI tool designed to synchronize Cursor IDE rules (stored as `.mdc` or `.md` files) from a centralized Git repository to local projects using symbolic links. This approach ensures rules are always up-to-date across multiple projects and team members.

## Core Concepts
- **Rules Repository**: A Git repository containing a `rules/` folder where rule definitions are stored.
- **Symbolic Links**: Rules are linked from the local cache of the repo to the project's `.cursor/rules/` directory, avoiding file duplication and drift.
- **Dependency Tracking**: Uses `cursor-rules.json` to track project dependencies.
- **Privacy**: Supports private/local rules via `cursor-rules.local.json` and `.git/info/exclude`.

## Architecture
- **Language**: TypeScript (Node.js).
- **CLI Framework**: Commander.js.
- **Config**: Stored in `~/.cursor-rules-sync/config.json` (global) and project roots.
- **Git Operations**: Uses `execa` to run git commands; stores repos in `~/.cursor-rules-sync/repos/`.
- **Linking Engine**: Uses the standalone npm package **`linkany`** to perform safe symlink convergence.
  - CRS maintains a small per-project manifest file: `.cursor-rules-sync.linkany.json` (gitignored).
  - This replaces the old “vendored/internal linkany source” approach.

## Feature Summary

### 1. Repository Management
- **Use**: `crs use <url|name>` - Configure or switch the active rules repository.
  - Supports auto-naming from URL.
  - Caches repositories locally.
  - **Auto-configuration**: Detects `cursor-rules.json` in the repository root to configure behavior (e.g., `rootPath`).
- **List**: `crs list` - Show configured repositories and the active one.
- **Git Proxy**: `crs git <args...>` - Run git commands directly in the active rules repository context.
  - Supports `-t <repo>` to target specific repositories.

### 2. Rule Synchronization (`crs add`)
- **Syntax**: `crs add <rule_name> [alias]`
- **Functionality**:
  - Links `<repo>/<rootPath>/<rule_name>` to `.cursor/rules/<alias>`.
    - `rootPath` defaults to `rules`, can be customized by the rules repository via `cursor-rules.json`.
  - Updates `cursor-rules.json`.
  - Updates `.gitignore` to ignore the linked rule path.
  - Uses `linkany` to ensure the target becomes a symlink safely:
    - If the target exists and is **not** a symlink, CRS aborts linking to avoid data loss.
    - If the target is an existing symlink, CRS can replace it to converge to the desired source.
- **Options**:
  - `-t <repo>`: Specify source repository.
  - `--local` (`-l`): Add as a private rule.
    - Updates `cursor-rules.local.json`.
    - Updates `.git/info/exclude` instead of `.gitignore` to prevent leaking private rule names.
    - Adds `cursor-rules.local.json` to `.gitignore`.

### 3. Installation (`crs install`)
- **Functionality**: Restores all rules defined in `cursor-rules.json` and `cursor-rules.local.json`.
- **Intelligent Handling**:
  - Automatically clones missing repositories.
  - Respects privacy settings (writes to `.git/info/exclude` for local rules).

### 4. Configuration Files
- **`cursor-rules.json`**: Public dependencies.
  ```json
  {
    "rules": {
      "react": "https://github.com/org/repo.git",
      "react-v2": { "url": "...", "rule": "react" }
    }
  }
  ```
- **`cursor-rules.local.json`**: Private dependencies (merged with public, takes precedence).

## Development Guidelines
- **TypeScript**: Strict mode enabled.
- **Testing**: Vitest for unit tests; manual integration testing.
- **Style**: Functional programming style preferred.

