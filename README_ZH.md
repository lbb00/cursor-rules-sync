# Cursor Rules Sync

**Cursor Rules Sync (CRS)**
*轻松同步、管理和共享您的 Cursor IDE 规则。*

CRS 允许您在 Git 仓库中集中管理 Cursor 规则，并通过软链接将其同步到任意数量的项目中。告别复制粘贴 `.mdc` 文件和配置漂移。

### 核心优势

- **🧩 多源管理 & 去中心化**：无缝混合来自不同来源的规则——无论是公司标准、团队特定协议还是开源集合，都能完美兼容。
- **🔄 一次定义，处处同步**：只需在一处更新规则，CRS 确保您的所有项目都能自动与其保持一致。
- **🤝 团队无缝对齐**：在团队中强制执行统一的编码标准。只需一行命令，新成员即可拥有完全一致的开发环境。
- **🔒 隐私优先**：需要项目特定的覆盖或私有规则？通过 `cursor-rules.local.json` 轻松管理，无需担心敏感信息泄露。
- **🛠️ 集成化 Git 管理**：直接通过 CLI 管理您的规则仓库。使用 `crs git` 即可在当前项目上下文中拉取更新、检查状态或切换分支，无需频繁切换目录。

[English](./README.md) | [中文](./README_ZH.md)

## 安装

```bash
npm install -g cursor-rules-sync
```

## 创建新的 Cursor 规则 Git 仓库

- `rules` 文件夹是默认的存放 Cursor 规则的根目录。
- 也可以通过在仓库根目录添加 `cursor-rules.json` 文件来指定其他目录（例如 `packages/rules`）：

  ```json
  {
    "rootPath": "packages/rules"
  }
  ```
- 你可以在该目录下创建任意数量的规则文件夹。

## 全局选项

所有命令都支持以下全局选项：

- `-t, --target <repo>`: 指定要使用的目标规则仓库（名称或 URL）。

## 命令

### 配置规则仓库

```bash
crs use [git repository url | name]
```

- 如果提供了 Git 仓库 URL，工具会自动克隆并配置。
- 如果提供了名称（name），工具会切换到该名称对应的已配置仓库。

### 列出已配置的仓库

```bash
crs list
```

列出所有已配置的 Git 规则仓库，并标记当前正在使用的仓库。

### 同步规则到项目

```bash
crs add [rule name] [alias]
```

**注意**：此命令必须在项目的根目录下运行。

该命令会在项目的 `.cursor/rules/` 目录下创建一个指向规则仓库中 `rules/[rule name]` 的软链接。

- `[rule name]`: 规则仓库中的规则文件夹名称。
- `[alias]`: （可选）在本地项目中使用的名称。如果指定，规则将被链接为 `.cursor/rules/[alias]`。这在处理规则重名或需要重命名时非常有用。

**添加私有规则：**

使用 `-l` 或 `--local` 标志将规则添加到 `cursor-rules.local.json` 而不是 `cursor-rules.json`。这对于不需要提交到 Git 的规则非常有用。

```bash
crs add react --local
```

该命令还会自动将 `cursor-rules.local.json` 添加到你的 `.gitignore` 文件中。

**示例：**

```bash
# 将 'react' 规则添加为 'react'
crs add react

# 将 'react' 规则添加为 'react-v1'
crs add react react-v1

# 从名为 'other-repo' 的仓库添加 'react' 规则，并命名为 'react-v2'
crs add react react-v2 -t other-repo

# 直接从 Git URL 添加 'react' 规则
crs add react -t https://github.com/user/rules-repo.git
```

此命令还会自动创建或更新项目根目录下的 `cursor-rules.json` (或 `cursor-rules.local.json`) 文件，用于跟踪规则依赖。

### 移除规则

```bash
crs remove [alias]
```

该命令会删除软链接、`.gitignore` 中的条目，并从 `cursor-rules.json` (或 `cursor-rules.local.json`) 中移除依赖。

### cursor-rules.json 结构

`cursor-rules.json` 文件用于记录项目所使用的规则及其来源。它支持简单的字符串格式（仅 URL）和对象格式（包含 URL 和规则原名）。

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

### 本地/私有规则

你可以使用 `cursor-rules.local.json` 来添加不需要提交到 Git 的私有规则。该文件结构与 `cursor-rules.json` 相同，其中的规则会与主配置合并（本地规则优先级更高）。

### 一键安装所有规则

如果你的项目中包含 `cursor-rules.json` 文件，你可以使用以下命令一键安装所有依赖规则：

```bash
crs install
```

该命令会自动配置所需的 Git 仓库并创建相应的软链接。

### Git 命令代理

你可以在不进入规则仓库目录的情况下，直接对规则仓库执行 Git 命令。

```bash
crs git [command]
```

**示例**：检查特定仓库的状态

```bash
crs git status -t [repo name]
```

