# AI Rules Sync

[![Npm](https://badgen.net/npm/v/ai-rules-sync)](https://www.npmjs.com/package/ai-rules-sync)
[![License](https://img.shields.io/github/license/lbb00/ai-rules-sync.svg)](https://github.com/lbb00/ai-rules-sync/blob/master/LICENSE)
[![Npm download](https://img.shields.io/npm/dw/ai-rules-sync.svg)](https://www.npmjs.com/package/ai-rules-sync)

[English](./README.md) | [中文](./README_ZH.md)

**AI Rules Sync (AIS)**
*Synchronize, manage, and share your agent rules (Cursor rules, Cursor plans, Copilot instructions) with ease.*

AIS allows you to centrally manage rules in Git repositories and synchronize them across projects using symbolic links. Say goodbye to copy-pasting `.mdc` files and drifting configurations.

### Why AIS?

- **🧩 Multi-Repository & Decentralized**: Mix and match rules from various sources—company standards, team-specific protocols, or open-source collections—without conflict.
- **🔄 Sync Once, Update Everywhere**: Define your rules in one place. AIS ensures every project stays in sync with the latest standards automatically.
- **🤝 Seamless Team Alignment**: Enforce shared coding standards and behaviors across your entire team. Onboard new members instantly with a single command.
- **🔒 Privacy First**: Need project-specific overrides or private rules? Use `ai-rules-sync.local.json` to keep sensitive rules out of version control.
- **🛠️ Integrated Git Management**: Manage your rule repositories directly through the CLI. Pull updates, check status, or switch branches without leaving your project context using `ais git`.
- **🔌 Plugin Architecture**: Built with a modular adapter system, making it easy to add support for new AI tools in the future.

## Supported Sync Types

| Tool | Type | Default Source Directory | Target Directory |
|------|------|--------------------------|------------------|
| Cursor | Rules | `.cursor/rules/` | `.cursor/rules/` |
| Cursor | Plans | `.cursor/plans/` | `.cursor/plans/` |
| Cursor | Skills | `.cursor/skills/` | `.cursor/skills/` |
| Copilot | Instructions | `.github/instructions/` | `.github/instructions/` |
| Claude | Skills | `.claude/skills/` | `.claude/skills/` |
| Claude | Agents | `.claude/agents/` | `.claude/agents/` |

## Install

```bash
npm install -g ai-rules-sync
```

## Create a rules repository

By default, AIS looks for rules in the official tool configuration paths:
- `.cursor/rules/` for Cursor rules
- `.cursor/plans/` for Cursor plans
- `.github/instructions/` for Copilot instructions

You can customize these paths by adding an `ai-rules-sync.json` file to your rules repository:

```json
{
  "rootPath": "src",
  "sourceDir": {
    "cursor": {
      "rules": ".cursor/rules",
      "plans": ".cursor/plans",
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

- `rootPath`: Optional global prefix applied to all source directories (default: empty, meaning repository root)
- `sourceDir.cursor.rules`: Source directory for Cursor rules (default: `.cursor/rules`)
- `sourceDir.cursor.plans`: Source directory for Cursor plans (default: `.cursor/plans`)
- `sourceDir.cursor.skills`: Source directory for Cursor skills (default: `.cursor/skills`)
- `sourceDir.copilot.instructions`: Source directory for Copilot instructions (default: `.github/instructions`)
- `sourceDir.claude.skills`: Source directory for Claude skills (default: `.claude/skills`)
- `sourceDir.claude.agents`: Source directory for Claude agents (default: `.claude/agents`)

> **Note**: The old flat format (`cursor.rules` as string) is still supported for backward compatibility.

## Global Options

All commands support the following global options:

- `-t, --target <repo>`: Specify the target rule repository to use (name or URL).

## Commands

### Config rules git repository

```bash
ais use [git repository url | repo name]
```

If `[git repository url]` is not provided, it will search the repo name in the `~/.ai-rules-sync/config.json` file.

### List all configured repositories

```bash
ais list
```

### Sync Cursor rules to project

```bash
ais cursor add [rule name] [alias]
# or explicitly:
ais cursor rules add [rule name] [alias]
```

This command must be run in the root of your project.

It will generate a symbolic link from the rules git repository `.cursor/rules/[rule name]` folder to the project `.cursor/rules/[rule name]` folder.

If you provide an `[alias]`, it will be linked to `.cursor/rules/[alias]`. This is useful for renaming rules or handling conflicts.

**Adding Private Rules:**

Use the `-l` or `--local` flag to add a rule to `ai-rules-sync.local.json` instead of `ai-rules-sync.json`. This is useful for rules that you don't want to commit to git.

```bash
ais cursor add react --local
```

This command will also automatically add `ai-rules-sync.local.json` to your `.gitignore` file.

Examples:

```bash
# Add 'react' rule as 'react'
ais cursor add react

# Add 'react' rule as 'react-v1'
ais cursor add react react-v1

# Add 'react' rule from a specific repo as 'react-v2'
ais cursor add react react-v2 -t other-repo

# Add 'react' rule directly from a Git URL
ais cursor add react -t https://github.com/user/rules-repo.git
```

### Sync Cursor commands to project

```bash
ais cursor commands add [command name] [alias]
```

This syncs command files from the rules repository `.cursor/commands/` directory to `.cursor/commands/` in your project.

```bash
# Add 'deploy-docs' command
ais cursor commands add deploy-docs

# Add command with alias
ais cursor commands add deploy-docs deploy-docs-v2

# Remove a command
ais cursor commands remove deploy-docs-v2

# Install all commands from config
ais cursor commands install
```

### Sync Cursor skills to project

```bash
ais cursor skills add [skill name] [alias]
```

This syncs skill directories from the rules repository `.cursor/skills/` directory to `.cursor/skills/` in your project.

```bash
# Add 'code-review' skill
ais cursor skills add code-review

# Add skill with alias
ais cursor skills add code-review my-review

# Remove a skill
ais cursor skills remove my-review

# Install all skills from config
ais cursor skills install
```

### Sync Copilot instructions to project

```bash
ais copilot add [name] [alias]
```

Default mapping: rules repo `.github/instructions/<name>` → project `.github/instructions/<alias|name>`.

Suffix matching:
- You may pass `foo`, `foo.md`, or `foo.instructions.md`.
- If both `foo.md` and `foo.instructions.md` exist in the rules repo, AIS will error and you must specify the suffix explicitly.
- If `alias` has no suffix, AIS preserves the source suffix (e.g. `ais copilot add foo y` may create `y.instructions.md`).

### Sync Claude skills to project

```bash
ais claude skills add [skillName] [alias]
```

Default mapping: rules repo `.claude/skills/<skillName>` → project `.claude/skills/<alias|skillName>`.

### Sync Claude agents to project

```bash
ais claude agents add [agentName] [alias]
```

Default mapping: rules repo `.claude/agents/<agentName>` → project `.claude/agents/<alias|agentName>`.


### Remove entries

```bash
# Remove a Cursor rule
ais cursor remove [alias]

# Remove a Cursor command
ais cursor commands remove [alias]

# Remove a Copilot instruction
ais copilot remove [alias]

# Remove a Claude skill
ais claude skills remove [alias]

# Remove a Claude agent
ais claude agents remove [alias]

```

This command removes the symbolic link, the ignore entry, and the dependency from `ai-rules-sync.json` (or `ai-rules-sync.local.json`).

### ai-rules-sync.json structure

The `ai-rules-sync.json` file stores Cursor rules, commands, and Copilot instructions separately. It supports both simple string values (repo URL) and object values for aliased entries.

```json
{
  "cursor": {
    "rules": {
      "react": "https://github.com/user/repo.git",
      "react-v2": { "url": "https://github.com/user/another-repo.git", "rule": "react" }
    },
    "commands": {
      "deploy-docs": "https://github.com/user/repo.git"
    },
    "skills": {
      "code-review": "https://github.com/user/repo.git"
    }
  },
  "copilot": {
    "instructions": {
      "general": "https://github.com/user/repo.git"
    }
  },
  "claude": {
    "skills": {
      "code-review": "https://github.com/user/repo.git"
    },
    "agents": {
      "debugger": "https://github.com/user/repo.git"
    }
  }
}
```

### Local/Private Rules

You can use `ai-rules-sync.local.json` to add private rules/instructions that are not committed to git. This file uses the same structure as `ai-rules-sync.json` and is merged with the main configuration (local takes precedence).

### Install from configuration

If you have an `ai-rules-sync.json` file in your project, you can install all entries with one command:

```bash
# Install all Cursor rules, commands, and skills
ais cursor install

# Install all Copilot instructions
ais copilot install

# Install all Claude skills and agents
ais claude install

# Install everything (Cursor, Copilot, and Claude)
ais install
```

If your project has only one type (Cursor or Copilot) in the config file, you can omit the mode:

```bash
ais install
ais add <name>
ais remove <alias>
```

This will automatically configure repositories and link entries.

### Git Commands

Use git commands to manage the rules git repository.

```bash
ais git [command]
```

Example: check status of a specific repository:

```bash
ais git status -t [repo name]
```

### Legacy compatibility

- If `ai-rules-sync*.json` does not exist but `cursor-rules*.json` exists, AIS will read it temporarily (Cursor rules only).
- Once you run a write command (e.g. `ais cursor add/remove`), it will migrate and write `ai-rules-sync*.json` for easy future removal of legacy code.

### Tab Completion

AIS supports shell tab completion for bash, zsh, and fish.

#### Automatic Installation (Recommended)

On first run, AIS will detect your shell and offer to install tab completion automatically:

```
🔧 Detected first run of ais
   Shell: zsh (~/.zshrc)

Would you like to install shell tab completion?
[Y]es / [n]o / [?] help:
```

You can also install completion manually at any time:

```bash
ais completion install
```

#### Manual Installation

If you prefer to add it manually:

**Bash** (add to `~/.bashrc`):

```bash
eval "$(ais completion)"
```

**Zsh** (add to `~/.zshrc`):

```bash
eval "$(ais completion)"
```

**Fish** (add to `~/.config/fish/config.fish`):

```fish
ais completion fish | source
```

After enabling, you can use Tab to complete rule names:

```bash
ais cursor add <Tab>         # Lists available rules
ais cursor commands add <Tab>   # Lists available commands
ais cursor skills add <Tab>  # Lists available skills
ais copilot add <Tab>        # Lists available instructions
ais claude skills add <Tab>  # Lists available skills
ais claude agents add <Tab>  # Lists available agents
```

**Note**: If you encounter `compdef: command not found` errors, ensure your shell has completion initialized. For zsh, add this to your `~/.zshrc` before the ais completion line:

```bash
# Initialize zsh completion system (if not already done)
autoload -Uz compinit && compinit
```

## Architecture

AIS uses a plugin-based adapter architecture with unified operations:

```
CLI Layer
    ↓
Adapter Registry & Lookup (findAdapterForAlias)
    ↓
Unified Operations (addDependency, removeDependency, link, unlink)
    ↓
Sync Engine (linkEntry, unlinkEntry)
    ↓
Config Layer (ai-rules-sync.json via addDependencyGeneric, removeDependencyGeneric)
```

**Key Design Principles:**

1. **Unified Interface**: All adapters (cursor-rules, cursor-commands, cursor-skills, copilot-instructions) implement the same operations
2. **Auto-Routing**: The `findAdapterForAlias()` function automatically finds the correct adapter based on where an alias is configured
3. **Generic Functions**: `addDependencyGeneric()` and `removeDependencyGeneric()` work with any adapter via `configPath` property
4. **Extensible**: Adding new AI tools only requires creating a new adapter and registering it in the adapter registry

This modular design makes it easy to add support for new AI tools (MCP, Windsurf, etc.) in the future without duplicating add/remove logic.

## Adding a New AI Tool Adapter

To add support for a new AI tool, follow these steps:

1. **Create a new adapter file** (`src/adapters/my-tool.ts`):

```typescript
import { createBaseAdapter } from './base.js';

export const myToolAdapter = createBaseAdapter({
  name: 'my-tool',
  tool: 'my-tool',
  subtype: 'configs',
  configPath: ['myTool', 'configs'],
  defaultSourceDir: '.my-tool/configs',
  targetDir: '.my-tool/configs',
  mode: 'directory',
  // Optionally override resolveSource and resolveTargetName
});
```

1. **Register the adapter** in `src/adapters/index.ts`:

```typescript
import { myToolAdapter } from './my-tool.js';

// In DefaultAdapterRegistry constructor:
this.register(myToolAdapter);
```

1. **Update ProjectConfig** in `src/project-config.ts` to include your tool's config section:

```typescript
export interface ProjectConfig {
  // ... existing fields ...
  myTool?: {
    configs?: Record<string, RuleEntry>;
  };
}
```

That's it! Your new adapter will automatically support `add`, `remove`, `link`, and `unlink` operations through the unified interface.

