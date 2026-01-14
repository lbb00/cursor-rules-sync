# Project Knowledge Base

## Project Overview
**AI Rules Sync (ais)** is a CLI tool designed to synchronize agent rules from a centralized Git repository to local projects using symbolic links. It supports **Cursor rules**, **Cursor commands**, **Cursor skills**, **Copilot instructions**, and **Claude Code skills/agents**, keeping projects up-to-date across teams.

## Core Concepts
- **Rules Repository**: A Git repository containing rule definitions in official tool paths (`.cursor/rules/`, `.cursor/commands/`, `.cursor/skills/`, `.github/instructions/`, `.claude/skills/`, `.claude/agents/`).
- **Symbolic Links**: Entries are linked from the local cache of the repo to project directories, avoiding file duplication and drift.
- **Dependency Tracking**: Uses `ai-rules-sync.json` to track project dependencies (Cursor rules/commands/skills, Copilot instructions, Claude skills/agents).
- **Privacy**: Supports private/local entries via `ai-rules-sync.local.json` and `.git/info/exclude`.

## Architecture
- **Language**: TypeScript (Node.js).
- **CLI Framework**: Commander.js.
- **Config**: Stored in `~/.ai-rules-sync/config.json` (global) and project roots.
- **Git Operations**: Uses `execa` to run git commands; stores repos in `~/.ai-rules-sync/repos/`.
- **Plugin Architecture**: Modular adapter system for different AI tools.
- **Modular CLI**: Declarative command registration using adapters.

### Directory Structure

```
src/
├── adapters/                # Plugin architecture for different AI tools
│   ├── types.ts             # SyncAdapter interface
│   ├── base.ts              # createBaseAdapter factory function
│   ├── index.ts             # Registry and helper functions
│   ├── cursor-rules.ts      # Cursor rules adapter
│   ├── cursor-commands.ts   # Cursor commands adapter
│   ├── cursor-skills.ts     # Cursor skills adapter
│   ├── copilot-instructions.ts # Copilot instructions adapter
│   ├── claude-skills.ts     # Claude skills adapter
│   └── claude-agents.ts     # Claude agents adapter
├── cli/                     # CLI registration layer
│   └── register.ts          # Declarative command registration (registerAdapterCommands)
├── commands/                # Command handlers
│   ├── handlers.ts          # Generic add/remove/import handlers
│   ├── helpers.ts           # Helper functions (getTargetRepo, parseConfigEntry, etc.)
│   ├── install.ts           # Generic install function
│   └── index.ts             # Module exports
├── completion/              # Shell completion
│   └── scripts.ts           # Shell completion scripts (bash, zsh, fish)
├── config.ts                # Global config management
├── git.ts                   # Git operations
├── index.ts                 # CLI entry point (~560 lines)
├── link.ts                  # Re-exports from sync-engine
├── project-config.ts        # Project config management
├── sync-engine.ts           # Core linkEntry/unlinkEntry/importEntry functions
└── utils.ts                 # Utility functions
```

### Adapter System

The sync engine uses a plugin-based architecture with unified operations:

**SyncAdapter Interface:**
```typescript
interface SyncAdapter {
  // Core properties
  name: string;           // e.g. "cursor-rules"
  tool: string;           // e.g. "cursor"
  subtype: string;        // e.g. "rules", "commands"
  configPath: [string, string]; // e.g. ['cursor', 'rules']
  defaultSourceDir: string; // e.g. ".cursor/rules"
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
- **Reduced Duplication**: Single generic handler for all add/remove/install/import operations

### Modular CLI Architecture

The CLI uses a declarative registration approach:

**Declarative Command Registration (`src/cli/register.ts`):**
```typescript
interface RegisterCommandsOptions {
  adapter: SyncAdapter;
  parentCommand: Command;
  programOpts: () => { target?: string };
}

function registerAdapterCommands(options: RegisterCommandsOptions): void {
  // Automatically registers: add, remove, install, import subcommands
}
```

**Generic Command Handlers (`src/commands/handlers.ts`):**
```typescript
// All handlers work with any adapter
async function handleAdd(adapter, ctx, name, alias?): Promise<AddResult>
async function handleRemove(adapter, projectPath, alias): Promise<RemoveResult>
async function handleImport(adapter, ctx, name, options): Promise<void>
```

**Generic Install Function (`src/commands/install.ts`):**
```typescript
// Replaces 7 duplicate install functions with one generic function
async function installEntriesForAdapter(adapter, projectPath): Promise<void>
async function installEntriesForTool(adapters[], projectPath): Promise<void>
```

**Helper Functions (`src/commands/helpers.ts`):**
- `getTargetRepo(options)`: Resolve target repository from options or config
- `inferDefaultMode(projectPath)`: Auto-detect cursor/copilot mode from config
- `parseConfigEntry(key, value)`: Parse config entry to extract repoUrl, entryName, alias
- `resolveCopilotAliasFromConfig(input, keys)`: Resolve copilot alias with suffix handling

### Sync Engine Functions

**`src/sync-engine.ts`:**
```typescript
// Link from repo to project
async function linkEntry(adapter, options): Promise<LinkResult>

// Unlink from project
async function unlinkEntry(adapter, projectPath, alias): Promise<void>

// Import from project to repo (copy, commit, then create symlink)
async function importEntry(adapter, options): Promise<{imported, sourceName, targetName}>
```

### Configuration Interfaces

**SourceDirConfig (for rules repos):**
```typescript
interface SourceDirConfig {
  cursor?: {
    rules?: string;       // Default: ".cursor/rules"
    commands?: string;    // Default: ".cursor/commands"
    skills?: string;      // Default: ".cursor/skills"
  };
  copilot?: {
    instructions?: string; // Default: ".github/instructions"
  };
  claude?: {
    skills?: string;      // Default: ".claude/skills"
    agents?: string;      // Default: ".claude/agents"
  };
}
```

**ProjectConfig (unified configuration):**
```typescript
interface ProjectConfig {
  // For rules repos: global path prefix
  rootPath?: string;
  // For rules repos: source directory configuration
  sourceDir?: SourceDirConfig;
  // For projects: dependency records
  cursor?: {
    rules?: Record<string, RuleEntry>;
    commands?: Record<string, RuleEntry>;
    skills?: Record<string, RuleEntry>;
  };
  copilot?: {
    instructions?: Record<string, RuleEntry>;
  };
  claude?: {
    skills?: Record<string, RuleEntry>;
    agents?: Record<string, RuleEntry>;
  };
}
```

### Helper Functions

- `getAdapter(tool, subtype)`: Get adapter by tool/subtype, throws if not found
- `getDefaultAdapter(tool)`: Get the first adapter for a tool
- `getToolAdapters(tool)`: Get all adapters for a tool
- `findAdapterForAlias(config, alias)`: Find which adapter manages a specific alias
- `addDependencyGeneric(projectPath, configPath, name, repoUrl, alias?, isLocal?)`: Generic dependency add
- `removeDependencyGeneric(projectPath, configPath, alias)`: Generic dependency remove

## Feature Summary

### 1. Repository Management
- **Use**: `ais use <url|name>` - Configure or switch the active rules repository.
- **List**: `ais list` - Show configured repositories and the active one.
- **Git Proxy**: `ais git <args...>` - Run git commands directly in the active rules repository context.

### 2. Cursor Rule Synchronization
- **Syntax**: `ais cursor add <rule_name> [alias]` or `ais cursor rules add <rule_name> [alias]`
- Links `<repo>/.cursor/rules/<rule_name>` to `.cursor/rules/<alias>`.
- **Options**: `-t <repo>`, `--local` (`-l`)

### 3. Cursor Command Synchronization
- **Syntax**: `ais cursor commands add <command_name> [alias]`
- Links `<repo>/.cursor/commands/<command_name>` to `.cursor/commands/<alias>`.
- Supports `.md` files.

### 4. Copilot Instruction Synchronization
- **Syntax**: `ais copilot add <name> [alias]`
- Links `<repo>/.github/instructions/<name>` to `.github/instructions/<alias>`.
- Supports `.md` and `.instructions.md` suffixes with conflict detection.

### 5. Cursor Skill Synchronization
- **Syntax**: `ais cursor skills add <skillName> [alias]`
- Links `<repo>/.cursor/skills/<skillName>` to `.cursor/skills/<alias>`.
- Directory-based synchronization.

### 6. Claude Skill Synchronization
- **Syntax**: `ais claude skills add <skillName> [alias]`
- Links `<repo>/.claude/skills/<skillName>` to `.claude/skills/<alias>`.
- Directory-based synchronization.

### 7. Claude Agent Synchronization
- **Syntax**: `ais claude agents add <agentName> [alias]`
- Links `<repo>/.claude/agents/<agentName>` to `.claude/agents/<alias>`.
- Directory-based synchronization.

### 8. Import Command
- **Syntax**: `ais import <tool> <subtype> <name>` or `ais <tool> <subtype> import <name>`
- Copies entry from project to rules repository, commits, and creates symlink back.
- **Options**:
  - `-m, --message <message>`: Custom commit message
  - `-f, --force`: Overwrite if entry exists in repo
  - `-p, --push`: Push to remote after commit
  - `-l, --local`: Add to local config
- **Examples**:
  ```bash
  ais import cursor rules my-rule
  ais cursor rules import my-rule --push
  ais import copilot instructions my-instruction -m "Add new instruction"
  ```

### 9. Installation
- `ais cursor install` - Install all Cursor rules, commands, and skills.
- `ais copilot install` - Install all Copilot instructions.
- `ais claude install` - Install all Claude skills and agents.
- `ais install` - Install everything.

### 10. Configuration Files

**Rules Repository Config** (`ai-rules-sync.json` in the rules repo):
```json
{
  "rootPath": "src",
  "sourceDir": {
    "cursor": {
      "rules": ".cursor/rules",
      "commands": ".cursor/commands",
      "skills": ".cursor/skills"
    },
    "copilot": {
      "instructions": ".github/instructions"
    },
    "claude": {
      "skills": ".claude/skills",
      "agents": ".claude/agents"
    }
  }
}
```

**Project Config** (`ai-rules-sync.json` in user projects):
```json
{
  "cursor": {
    "rules": { "react": "https://..." },
    "commands": { "deploy-docs": "https://..." },
    "skills": { "code-review": "https://..." }
  },
  "copilot": {
    "instructions": { "general": "https://..." }
  },
  "claude": {
    "skills": { "my-skill": "https://..." },
    "agents": { "debugger": "https://..." }
  }
}
```

- **`ai-rules-sync.local.json`**: Private dependencies (merged, takes precedence).
- **Legacy format**: Old configs with `cursor.rules` as string are still supported.
- **Legacy files**: `cursor-rules*.json` are read-only compatible; write operations migrate to new format.

### 11. Shell Completion
- **Auto-Install**: On first run, AIS prompts to install shell completion automatically.
- **Manual Install**: `ais completion install` - Installs completion to shell config file.
- **Script Output**: `ais completion [bash|zsh|fish]` - Outputs raw completion script.
- **Detection**: Automatically detects shell type from `$SHELL` environment variable.
- **Shell scripts** stored in `src/completion/scripts.ts`.

## Development Guidelines
- **TypeScript**: Strict mode enabled.
- **Testing**: Vitest for unit tests.
- **Style**: Functional programming style preferred.
- **Adding New AI Tools**:
  1. Create adapter in `src/adapters/<tool>.ts`
  2. Register in `src/adapters/index.ts`
  3. Add CLI commands in `src/index.ts` using `registerAdapterCommands()`
  4. Update `ProjectConfig` interface in `src/project-config.ts`
