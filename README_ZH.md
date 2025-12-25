# Cursor Rules Sync

本项目通过软链接（Symbolic Link）将 Cursor 规则从 Git 仓库同步到任何项目中。

[English](./README.md) | [中文](./README_ZH.md)

## 安装

```bash
npm install -g cursor-rules-sync
```

## 创建新的 Cursor 规则 Git 仓库

- `rules` 文件夹是存放 Cursor 规则的根目录。
- 你可以在该目录下创建任意数量的规则文件夹。

## 全局选项

所有命令都支持以下全局选项：

- `-t, --target <repo>`: 指定要使用的目标规则仓库。

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

**示例：**

```bash
# 将 'react' 规则添加为 'react'
crs add react

# 将 'react' 规则添加为 'react-v1'
crs add react react-v1

# 从名为 'other-repo' 的仓库添加 'react' 规则，并命名为 'react-v2'
crs add react react-v2 -t other-repo
```

此命令还会自动创建或更新项目根目录下的 `cursor-rules.json` 文件，用于跟踪规则依赖。

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

