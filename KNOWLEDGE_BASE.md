# Project Knowledge Base

## Project Overview
**AI Rules Sync (ais)** is a CLI tool designed to synchronize agent rules from a centralized Git repository to local projects using symbolic links. It supports **Cursor rules**, **Cursor plans**, and **Copilot instructions**, keeping projects up-to-date across teams.

## Core Concepts
- **Rules Repository**: A Git repository containing `rules/` and `plans/` folders where definitions are stored.
- **Symbolic Links**: Entries are linked from the local cache of the repo to project directories, avoiding file duplication and drift.
- **Dependency Tracking**: Uses `ai-rules-sync.json` to track project dependencies (Cursor rules + plans, Copilot instructions).
- **Privacy**: Supports private/local entries via `ai-rules-sync.local.json` and `.git/info/exclude`.

## Architecture
- **Language**: TypeScript (Node.js).
- **CLI Framework**: Commander.js.
- **Config**: Stored in `~/.cursor-rules-sync/config.json` (global) and project roots.
- **Git Operations**: Uses `execa` to run git commands; stores repos in `~/.cursor-rules-sync/repos/`.
- **Plugin Architecture**: Modular adapter system for different AI tools.

### Adapter System

The sync engine uses a plugin-based architecture:

```
src/adapters/
  types.ts              # SyncAdapter interface
  index.ts              # Registry and exports
  cursor-rules.ts       # Cursor rules adapter (.cursor/rules/)
  cursor-plans.ts       # Cursor plans adapter (.cursor/plans/)
  copilot-instructions.ts # Copilot instructions adapter (.github/instructions/)

src/sync-engine.ts      # Generic linkEntry/unlinkEntry functions
src/link.ts             # Backward-compatible wrappers
```

**SyncAdapter Interface:**
```typescript
interface SyncAdapter {
  name: string;           // e.g. "cursor-rules"
  tool: string;           // e.g. "cursor"
  subtype: string;        // e.g. "rules", "plans"
  defaultSourceDir: string; // e.g. "rules" or "plans"
  targetDir: string;      // e.g. ".cursor/rules"
  mode: 'directory' | 'file';
  fileSuffixes?: string[];
  resolveSource?(...): Promise<ResolvedSource>;
  resolveTargetName?(...): string;
}
```

## Feature Summary

### 1. Repository Management
- **Use**: `ais use <url|name>` - Configure or switch the active rules repository.
- **List**: `ais list` - Show configured repositories and the active one.
- **Git Proxy**: `ais git <args...>` - Run git commands directly in the active rules repository context.

### 2. Cursor Rule Synchronization
- **Syntax**: `ais cursor add <rule_name> [alias]` or `ais cursor rules add <rule_name> [alias]`
- Links `<repo>/rules/<rule_name>` to `.cursor/rules/<alias>`.
- **Options**: `-t <repo>`, `--local` (`-l`)

### 3. Cursor Plan Synchronization
- **Syntax**: `ais cursor plans add <plan_name> [alias]`
- Links `<repo>/plans/<plan_name>` to `.cursor/plans/<alias>`.
- Supports `.md` files.

### 4. Copilot Instruction Synchronization
- **Syntax**: `ais copilot add <name> [alias]`
- Links `<repo>/rules/<name>` to `.github/instructions/<alias>`.
- Supports `.md` and `.instructions.md` suffixes with conflict detection.

### 5. Installation
- `ais cursor install` - Install all Cursor rules and plans.
- `ais copilot install` - Install all Copilot instructions.
- `ais install` - Install everything.

### 6. Configuration Files
- **`ai-rules-sync.json`**: Public dependencies (nested schema).
  ```json
  {
    "cursor": {
      "rules": { "react": "https://..." },
      "plans": { "feature": "https://..." }
    },
    "copilot": {
      "instructions": { "general": "https://..." }
    }
  }
  ```
- **`ai-rules-sync.local.json`**: Private dependencies (merged, takes precedence).
- **Legacy**: `cursor-rules*.json` are read-only compatible; write operations migrate to new format.

### 7. Shell Completion
- **Auto-Install**: On first run, AIS prompts to install shell completion automatically.
- **Manual Install**: `ais completion install` - Installs completion to shell config file.
- **Script Output**: `ais completion [bash|zsh|fish]` - Outputs raw completion script.
- **Detection**: Automatically detects shell type from `$SHELL` environment variable.
- **Config Tracking**: Uses `completionInstalled` flag in global config to avoid repeated prompts.
- **Zsh Setup**: Requires `autoload -Uz compinit && compinit` before AIS completion in `~/.zshrc`.

## Development Guidelines
- **TypeScript**: Strict mode enabled.
- **Testing**: Vitest for unit tests.
- **Style**: Functional programming style preferred.
- **Adding New AI Tools**: Implement a new SyncAdapter and register it in `src/adapters/index.ts`.
