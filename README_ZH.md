# AI Rules Sync

**AI Rules Sync (AIS)**
*轻松同步、管理和共享你的 Agent 规则（支持 Cursor 规则、Cursor 计划、Copilot 指令）。*

AIS 允许你在 Git 仓库中集中管理规则，并通过软链接将其同步到任意数量的项目中。告别复制粘贴带来的配置漂移。

### 核心优势

- **🧩 多源管理 & 去中心化**：无缝混合来自不同来源的规则——无论是公司标准、团队特定协议还是开源集合，都能完美兼容。
- **🔄 一次定义，处处同步**：只需在一处更新规则，AIS 确保你的所有项目都能自动与其保持一致。
- **🤝 团队无缝对齐**：在团队中强制执行统一的编码标准。只需一行命令，新成员即可拥有完全一致的开发环境。
- **🔒 隐私优先**：需要项目特定的覆盖或私有规则？通过 `ai-rules-sync.local.json` 轻松管理，无需担心敏感信息泄露。
- **🛠️ 集成化 Git 管理**：直接通过 CLI 管理你的规则仓库。使用 `ais git` 即可在当前项目上下文中拉取更新、检查状态或切换分支。
- **🔌 插件架构**：基于模块化的适配器系统构建，便于未来添加更多 AI 工具支持。

[English](./README.md) | [中文](./README_ZH.md)

## 支持的同步类型

| 工具 | 类型 | 源目录 | 目标目录 |
|------|------|--------|----------|
| Cursor | Rules | `rules/` | `.cursor/rules/` |
| Cursor | Plans | `plans/` | `.cursor/plans/` |
| Copilot | Instructions | `rules/` | `.github/instructions/` |

## 安装

```bash
npm install -g ai-rules-sync
```

## 创建规则仓库

- `rules` 文件夹是 Cursor 规则和 Copilot 指令的默认根目录。
- `plans` 文件夹是 Cursor 计划的默认根目录。
- 也可以通过在仓库根目录添加 `ai-rules-sync.json` 文件来指定其他目录（例如 `packages/rules`）：

  ```json
  {
    "rootPath": "packages/rules"
  }
  ```

## 全局选项

所有命令都支持以下全局选项：

- `-t, --target <repo>`: 指定要使用的目标规则仓库（名称或 URL）。

## 命令

### 配置规则仓库

```bash
ais use [git repository url | name]
```

- 如果提供了 Git 仓库 URL，工具会自动克隆并配置。
- 如果提供了名称（name），工具会切换到该名称对应的已配置仓库。

### 列出已配置的仓库

```bash
ais list
```

列出所有已配置的 Git 规则仓库，并标记当前正在使用的仓库。

### 同步 Cursor 规则到项目（.cursor/rules）

```bash
ais cursor add [rule name] [alias]
# 或者显式指定：
ais cursor rules add [rule name] [alias]
```

**注意**：此命令必须在项目的根目录下运行。

该命令会在项目的 `.cursor/rules/` 目录下创建一个指向规则仓库中 `<rootPath>/[rule name]` 的软链接（默认 `<rootPath>=rules`）。

- `[rule name]`: 规则仓库中的规则文件夹名称。
- `[alias]`: （可选）在本地项目中使用的名称。如果指定，规则将被链接为 `.cursor/rules/[alias]`。

**添加私有规则：**

使用 `-l` 或 `--local` 标志将规则添加到 `ai-rules-sync.local.json` 而不是 `ai-rules-sync.json`。

```bash
ais cursor add react --local
```

**示例：**

```bash
# 将 'react' 规则添加为 'react'
ais cursor add react

# 将 'react' 规则添加为 'react-v1'
ais cursor add react react-v1

# 从名为 'other-repo' 的仓库添加 'react' 规则，并命名为 'react-v2'
ais cursor add react react-v2 -t other-repo

# 直接从 Git URL 添加 'react' 规则
ais cursor add react -t https://github.com/user/rules-repo.git
```

### 同步 Cursor 计划到项目（.cursor/plans）

```bash
ais cursor plans add [plan name] [alias]
```

该命令会将规则仓库 `plans/` 目录下的计划文件同步到项目的 `.cursor/plans/` 目录。

```bash
# 添加 'feature-plan.md' 计划
ais cursor plans add feature-plan

# 添加计划并指定别名
ais cursor plans add feature-plan my-feature

# 移除计划
ais cursor plans remove my-feature

# 从配置安装所有计划
ais cursor plans install
```

### 同步 Copilot 指令到项目（.github/instructions）

```bash
ais copilot add [name] [alias]
```

默认映射：规则仓库 `<rootPath>/<name>` → 项目 `.github/instructions/<alias|name>`。

后缀匹配规则：
- 可以传 `foo`、`foo.md` 或 `foo.instructions.md`。
- 如果规则仓库里同时存在 `foo.md` 和 `foo.instructions.md`，AIS 会报错并要求显式指定后缀。
- 如果 `alias` 不带后缀，AIS 会保留源文件后缀（例如可能生成 `y.instructions.md`）。

### 移除条目

```bash
# 移除 Cursor 规则
ais cursor remove [alias]

# 移除 Cursor 计划
ais cursor plans remove [alias]

# 移除 Copilot 指令
ais copilot remove [alias]
```

该命令会删除软链接、ignore 文件中的条目，并从 `ai-rules-sync.json`（或 `ai-rules-sync.local.json`）中移除依赖。

### ai-rules-sync.json 结构

`ai-rules-sync.json` 文件用于分别记录 Cursor 规则、计划和 Copilot 指令。它支持简单的字符串格式（仅 URL）和对象格式（包含 URL 和原名）。

```json
{
  "cursor": {
    "rules": {
      "react": "https://github.com/user/repo.git",
      "react-v2": { "url": "https://github.com/user/another-repo.git", "rule": "react" }
    },
    "plans": {
      "feature-plan": "https://github.com/user/repo.git"
    }
  },
  "copilot": {
    "instructions": {
      "general": "https://github.com/user/repo.git"
    }
  }
}
```

### 本地/私有规则

你可以使用 `ai-rules-sync.local.json` 来添加不需要提交到 Git 的私有规则/指令。该文件结构与 `ai-rules-sync.json` 相同，其中的配置会与主配置合并（本地优先级更高）。

### 一键安装

如果你的项目中包含 `ai-rules-sync.json` 文件，你可以使用以下命令一键安装：

```bash
# 安装所有 Cursor 规则和计划
ais cursor install

# 安装所有 Copilot 指令
ais copilot install

# 安装全部（Cursor + Copilot）
ais install
```

若项目的配置中只存在 Cursor 或只存在 Copilot，你也可以省略子命令：

```bash
ais install
ais add <name>
ais remove <alias>
```

### Git 命令代理

你可以在不进入规则仓库目录的情况下，直接对规则仓库执行 Git 命令。

```bash
ais git [command]
```

**示例**：检查特定仓库的状态

```bash
ais git status -t [repo name]
```

### Legacy 兼容说明

- 若项目中不存在 `ai-rules-sync*.json`，但存在 `cursor-rules*.json`，AIS 会临时兼容读取（仅 Cursor 规则部分）。
- 一旦你执行会写入配置的命令（如 `ais cursor add/remove`），将自动迁移并写入 `ai-rules-sync*.json`，便于未来版本移除 legacy 代码。

### Tab 补全

AIS 支持 bash、zsh、fish 的 shell Tab 补全。

#### 自动安装（推荐）

首次运行时，AIS 会自动检测你的 shell 类型并询问是否安装 Tab 补全：

```
🔧 Detected first run of ais
   Shell: zsh (~/.zshrc)

Would you like to install shell tab completion?
[Y]es / [n]o / [?] help:
```

你也可以随时手动安装：

```bash
ais completion install
```

#### 手动安装

如果你更喜欢手动添加：

**Bash**（添加到 `~/.bashrc`）：

```bash
eval "$(ais completion)"
```

**Zsh**（添加到 `~/.zshrc`）：

```bash
eval "$(ais completion)"
```

**Fish**（添加到 `~/.config/fish/config.fish`）：

```fish
ais completion fish | source
```

启用后，你可以使用 Tab 键补全：

```bash
ais cursor add <Tab>         # 列出可用的规则
ais cursor plans add <Tab>   # 列出可用的计划
ais copilot add <Tab>        # 列出可用的指令
```

**注意**：如果遇到 `compdef: command not found` 错误，请确保你的 shell 已初始化补全系统。对于 zsh，请在 `~/.zshrc` 中的 ais 补全行之前添加：

```bash
# 初始化 zsh 补全系统（如果尚未完成）
autoload -Uz compinit && compinit
```

## 架构

AIS 使用基于插件的适配器架构：

```
CLI 层
    ↓
同步引擎 (linkEntry, unlinkEntry)
    ↓
适配器 (cursor-rules, cursor-plans, copilot-instructions)
    ↓
配置层 (ai-rules-sync.json)
```

这种模块化设计使得未来添加更多 AI 工具支持（如 MCP、Windsurf 等）变得简单。
