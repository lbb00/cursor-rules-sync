# Project Knowledge Base

## Project Overview
**AI Rules Sync (ais)** is a CLI tool designed to synchronize agent rules from a centralized Git repository to local projects using symbolic links. It supports **Cursor rules**, **Cursor plans**, and **Copilot instructions**, keeping projects up-to-date across teams.

## Core Concepts
- **Rules Repository**: A Git repository containing rule definitions in official tool paths (`.cursor/rules/`, `.cursor/plans/`, `.github/instructions/`).
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

The sync engine uses a plugin-based architecture with unified operations:

```
src/adapters/
  types.ts              # SyncAdapter interface
  base.ts               # createBaseAdapter factory function
  index.ts              # Registry and helper functions (getAdapter, findAdapterForAlias)
  cursor-rules.ts       # Cursor rules adapter (.cursor/rules/)
  cursor-plans.ts       # Cursor plans adapter (.cursor/plans/)
  copilot-instructions.ts # Copilot instructions adapter (.github/instructions/)

src/sync-engine.ts      # Generic linkEntry/unlinkEntry functions
src/link.ts             # Backward-compatible wrappers
src/project-config.ts   # addDependencyGeneric, removeDependencyGeneric functions
```

**SyncAdapter Interface (Extended):**
```typescript
interface SyncAdapter {
  // Core properties
  name: string;           // e.g. "cursor-rules"
  tool: string;           // e.g. "cursor"
  subtype: string;        // e.g. "rules", "plans"
  configPath: [string, string]; // e.g. ['cursor', 'rules']
  defaultSourceDir: string; // e.g. ".cursor/rules", ".cursor/plans", ".github/instructions"
  targetDir: string;      // e.g. ".cursor/rules"
  mode: 'directory' | 'file';
  fileSuffixes?: string[];

  // Optional resolution hooks
  resolveSource?(...): Promise<ResolvedSource>;
  resolveTargetName?(...): string;

  // Unified operations (provided by createBaseAdapter)
  addDependency(projectPath, name, repoUrl, alias?, isLocal?): Promise<{migrated}>;
  removeDependency(projectPath, alias): Promise<{removedFrom, migrated}>;
  link(options): Promise<LinkResult>;
  unlink(projectPath, alias): Promise<void>;
}
```

**Key Benefits:**
- **Unified Interface**: All adapters provide the same add/remove/link/unlink operations
- **No Hardcoding**: configPath allows generic functions to work with any adapter
- **Automatic Routing**: findAdapterForAlias() finds the right adapter based on where alias is configured
- **Reduced Duplication**: Eliminated addCursorDependency, addPlanDependency, addCopilotDependency duplication

**SourceDirConfig Interface (source directory configuration for rules repos):**
```typescript
interface SourceDirConfig {
  cursor?: {
    rules?: string;       // Default: ".cursor/rules"
    plans?: string;       // Default: ".cursor/plans"
  };
  copilot?: {
    instructions?: string; // Default: ".github/instructions"
  };
}
```

**ProjectConfig Interface (unified configuration):**
```typescript
interface ProjectConfig {
  // For rules repos: global path prefix
  rootPath?: string;
  // For rules repos: source directory configuration
  sourceDir?: SourceDirConfig;
  // For projects: dependency records
  cursor?: {
    rules?: Record<string, RuleEntry>;
    plans?: Record<string, RuleEntry>;
  };
  copilot?: {
    instructions?: Record<string, RuleEntry>;
  };
}
```

The `sourceDir` field separates source directory configuration from dependency records, avoiding field name conflicts where `cursor.rules` could mean either a source path (string) or dependencies (object).

**Helper Functions:**

- `getAdapter(tool, subtype)`: Get adapter by tool/subtype, throws if not found
- `getDefaultAdapter(tool)`: Get the first adapter for a tool
- `getToolAdapters(tool)`: Get all adapters for a tool
- `findAdapterForAlias(config, alias)`: Find which adapter manages a specific alias by checking all config sections
- `addDependencyGeneric(projectPath, configPath, name, repoUrl, alias?, isLocal?)`: Generic function to add dependency to any config section
- `removeDependencyGeneric(projectPath, configPath, alias)`: Generic function to remove dependency from any config section

## Unified Operation Pattern

With the refactored architecture, operations are now unified across all adapters:

```typescript
const adapter = findAdapterForAlias(config, alias);
if (!adapter) throw new Error(`Alias "${alias}" not found`);

// All adapters support the same operations
await adapter.link(options);           // Link from repo to project
await adapter.unlink(projectPath, alias); // Unlink from project
await adapter.addDependency(...);      // Add to config
await adapter.removeDependency(...);   // Remove from config
```

This eliminates the need for separate functions like `addCursorDependency`, `addPlanDependency`, `addCopilotDependency`, etc.

## Feature Summary

### 1. Repository Management
- **Use**: `ais use <url|name>` - Configure or switch the active rules repository.
- **List**: `ais list` - Show configured repositories and the active one.
- **Git Proxy**: `ais git <args...>` - Run git commands directly in the active rules repository context.

### 2. Cursor Rule Synchronization
- **Syntax**: `ais cursor add <rule_name> [alias]` or `ais cursor rules add <rule_name> [alias]`
- Links `<repo>/.cursor/rules/<rule_name>` to `.cursor/rules/<alias>`.
- **Options**: `-t <repo>`, `--local` (`-l`)

### 3. Cursor Plan Synchronization
- **Syntax**: `ais cursor plans add <plan_name> [alias]`
- Links `<repo>/.cursor/plans/<plan_name>` to `.cursor/plans/<alias>`.
- Supports `.md` files.

### 4. Copilot Instruction Synchronization
- **Syntax**: `ais copilot add <name> [alias]`
- Links `<repo>/.github/instructions/<name>` to `.github/instructions/<alias>`.
- Supports `.md` and `.instructions.md` suffixes with conflict detection.

### 5. Installation
- `ais cursor install` - Install all Cursor rules and plans.
- `ais copilot install` - Install all Copilot instructions.
- `ais install` - Install everything.

### 6. Configuration Files

**Rules Repository Config** (`ai-rules-sync.json` in the rules repo):
```json
{
  "rootPath": "src",
  "sourceDir": {
    "cursor": {
      "rules": ".cursor/rules",
      "plans": ".cursor/plans"
    },
    "copilot": {
      "instructions": ".github/instructions"
    }
  }
}
```

**Project Config** (`ai-rules-sync.json` in user projects):
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

**Combined Config** (rules repo that also tracks its own dependencies):
```json
{
  "rootPath": "src",
  "sourceDir": {
    "cursor": { "rules": ".cursor/rules" }
  },
  "cursor": {
    "rules": { "shared-util": "https://..." }
  }
}
```

- **`ai-rules-sync.local.json`**: Private dependencies (merged, takes precedence).
- **Legacy format**: Old configs with `cursor.rules` as string (instead of `sourceDir.cursor.rules`) are still supported for backward compatibility.
- **Legacy files**: `cursor-rules*.json` are read-only compatible; write operations migrate to new format.

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
