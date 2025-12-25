# Future Plans

## Core Features
- [ ] **Version Locking**: Implement a `cursor-rules.lock` file to lock rules to specific git commit hashes, ensuring consistent behavior across the team.
- [ ] **Update Command**: Add `crs update [rule]` to update specific or all rules to the latest version (pull latest git and update lockfile).
- [ ] **Remove Command**: Add `crs remove <rule>` to remove a rule, its symlink, and its entry from config and `.gitignore`.
- [ ] **Init Command**: Add `crs init` to interactively create a `cursor-rules.json` file.

## Rule Management
- [ ] **Local Sources**: Support local file system paths as rule sources (e.g., for testing or monorepos).
- [ ] **Conflict Handling**: Better error handling and prompts when rule names conflict or symlinks cannot be created.
- [ ] **Global/System Rules**: Mechanism to apply rules globally to the user environment, not just per project.

## CI/CD & Automation
- [ ] **CI Mode**: Add a `--ci` or `--strict` flag for `crs install` that fails if the lockfile is out of sync or if git operations fail.
- [ ] **Json Output**: Support `--json` flag for commands like `list` to enable parsing by other tools.

## Ecosystem
- [ ] **Registry**: (Long term) A central registry to discover common cursor rules, allowing `crs add <package-name>` without full URLs.
