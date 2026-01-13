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

### Adapter System

The sync engine uses a plugin-based architecture with unified operations:

```
src/adapters/
  types.ts              # SyncAdapter interface
  base.ts               # createBaseAdapter factory function
  index.ts              # Registry and helper functions (getAdapter, findAdapterForAlias)
  cursor-rules.ts       # Cursor rules adapter (.cursor/rules/)
  cursor-commands.ts    # Cursor commands adapter (.cursor/commands/)
  cursor-skills.ts      # Cursor skills adapter (.cursor/skills/)
  copilot-instructions.ts # Copilot instructions adapter (.github/instructions/)
  claude-skills.ts      # Claude skills adapter (.claude/skills/)
  claude-agents.ts      # Claude agents adapter (.claude/agents/)

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
  subtype: string;        // e.g. "rules", "commands"
  configPath: [string, string]; // e.g. ['cursor', 'rules']
  defaultSourceDir: string; // e.g. ".cursor/rules", ".cursor/commands", ".github/instructions"
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

### 8. Installation
- `ais cursor install` - Install all Cursor rules, commands, and skills.
- `ais copilot install` - Install all Copilot instructions.
- `ais claude install` - Install all Claude skills and agents.
- `ais install` - Install everything.

### 9. Import Entries to Rules Repository
- **Purpose**: Reverse operation of `add` - imports existing local files/directories into the rules repository
- **Syntax**:
  - `ais import <name>` - Auto-detect tool and type
  - `ais cursor import <name>` - Auto-detect subtype (rules/commands/skills)
  - `ais cursor rules import <name>` - Explicit import of Cursor rule
  - `ais cursor commands import <name>` - Explicit import of Cursor command
  - `ais cursor skills import <name>` - Explicit import of Cursor skill
  - `ais copilot import <name>` - Import Copilot instruction
  - `ais claude skills import <name>` - Import Claude skill
  - `ais claude agents import <name>` - Import Claude agent
- **Options**:
  - `--local` (`-l`) - Import as private rule (stores in `ai-rules-sync.local.json`)
  - `--message <msg>` (`-m`) - Custom git commit message
  - `--force` (`-f`) - Overwrite if entry already exists in repository
  - `--push` (`-p`) - Automatically push to remote repository after commit
- **Workflow**:
  1. Verifies file/directory exists in project and is not already a symlink
  2. Copies to rules repository
  3. Git commits the changes (with optional custom message)
  4. Optionally pushes to remote (with `--push` flag)
  5. Deletes original from project
  6. Creates symlink back to project (using existing `linkEntry` logic)
  7. Adds to `ai-rules-sync.json` (or `.local.json` with `--local`)
- **Implementation**: Uses `importEntry()` function in `src/sync-engine.ts` with `ImportOptions` interface extending `SyncOptions`
- **Error Handling**:
  - Entry not found in project → Error
  - Entry is already a symlink → Error (already managed)
  - Entry exists in repository without `--force` → Error
  - After import, entry is managed like any other synced rule

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

**Combined Config** (rules repo that also tracks its own dependencies):
```json
{
  "rootPath": "src",
  "sourceDir": {
    "cursor": { "rules": ".cursor/rules", "commands": ".cursor/commands", "skills": ".cursor/skills" },
    "claude": { "skills": ".claude/skills" }
  },
  "cursor": {
    "rules": { "shared-util": "https://..." }
  },
  "claude": {
    "skills": { "code-review": "https://..." }
  }
}
```

- **`ai-rules-sync.local.json`**: Private dependencies (merged, takes precedence).
- **Legacy format**: Old configs with `cursor.rules` as string (instead of `sourceDir.cursor.rules`) are still supported for backward compatibility.
- **Legacy files**: `cursor-rules*.json` are read-only compatible; write operations migrate to new format.

### 10. Shell Completion
- **Auto-Install**: On first run, AIS prompts to install shell completion automatically.
- **Manual Install**: `ais completion install` - Installs completion to shell config file.
- **Script Output**: `ais completion [bash|zsh|fish]` - Outputs raw completion script.
- **Detection**: Automatically detects shell type from `$SHELL` environment variable.
- **Config Tracking**: Uses `completionInstalled` flag in global config to avoid repeated prompts.
- **Zsh Setup**: Requires `autoload -Uz compinit && compinit` before AIS completion in `~/.zshrc`.
- **Tab Completion**: Works for `ais cursor rules/commands/skills add <Tab>` and `ais claude skills/agents add <Tab>`.

## Development Guidelines
- **TypeScript**: Strict mode enabled.
- **Testing**: Vitest for unit tests.
- **Style**: Functional programming style preferred.
- **Adding New AI Tools**: Implement a new SyncAdapter and register it in `src/adapters/index.ts`.
