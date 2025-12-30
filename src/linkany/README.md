# linkany

`linkany` 是一个 **macOS/Linux** 上的“安全 symlink 管理器”，围绕一个 `manifest` 文件维护一组“source ↔ target”的链接关系，并提供四个高层 API：

- `add(manifestPath, { source, target, ... })`
- `remove(manifestPath, key, opts?)`
- `install(manifestPath, opts?)`
- `uninstall(manifestPath, opts?)`

它的设计原则是：**安全第一、可追溯、默认拒绝任何可能导致数据丢失的行为**。

> 当前 `linkany` 作为 `cursor-rules-sync` 仓库内的内部库存在，未来可单独拆包发布。

## 能力概览

- **仅使用 symlink**：如果 symlink 失败（权限/文件系统限制等），直接报错，不会退化为 copy 安装。
- **文件 & 目录**：同时支持文件和目录链接。
- **安全策略**：
  - `add`：当 `source` 和 `target` 同时存在（且 `target` 不是指向 `source` 的 symlink）时 **拒绝**。
  - `remove/uninstall`：只会删除 `target` 的 symlink，**绝不删除 source**。
  - `install`：如果发现某个 `target` 存在但不是 symlink，会 **整体 abort**，避免误伤真实文件/目录。
- **原子性（尽力而为）**：
  - 创建/替换 symlink 时优先使用 `target.tmp.<rand>`，再 `rename` 到位。
  - 替换已有 symlink 时会优先把旧 target 移到 `target.bak.<timestamp>.<rand>`（便于恢复）。
- **审计记录（有记录的）**：每次调用都会把 `Result` 追加写入 JSONL 文件，默认路径为 `${manifestPath}.log.jsonl`。
- **dry-run / plan 输出**：
  - `opts.dryRun=true` 时不触发任何文件系统写操作（不 symlink/rename/unlink），只返回计划与结果结构。
  - `opts.includePlanText=true` 时会在 `Result.planText` 中附带可读的 plan 文本。
- **rollback 协议（best-effort）**：`Result.rollbackSteps` 会尽力给出“可逆步骤”的回滚计划（例如 move/symlink 的逆操作）。目前是协议与数据结构，未提供一键 rollback API。

## Manifest 格式（v1）

```json
{
  "version": 1,
  "installs": [
    {
      "id": "optional-stable-id",
      "source": "path/to/source",
      "target": "path/to/target",
      "kind": "file",
      "atomic": true
    }
  ]
}
```

说明：

- `source/target` 支持绝对路径或相对路径；相对路径以 **manifest 文件所在目录** 为基准。
- `id` 可选；如果没有 `id`，内部默认以 `target` 作为该条目的 identity（用于 remove）。
- `kind` 可选：`file | dir`。不写时，`add` 会尽力推断；`install` 会从 source 的实际类型推断。
- `atomic` 默认 `true`。
- 允许存在额外字段（`linkany` 会尽量保留并写回）。

## API

### `add(manifestPath, { source, target, kind?, atomic? }, opts?)`

用途：把一条映射写入 manifest，并把 `target` 收敛为指向 `source` 的 symlink。

核心语义：

- **source 不存在**：自动创建空 source（文件：空文件；目录：空目录）。
- **target 已存在且不是 symlink、source 不存在**：会执行一次“安全迁移”：
  - copy `target -> source`
  - 将原 `target` 移到 `target.bak.<timestamp>.<rand>`
  - 再把 `target` 改成指向 `source` 的 symlink
- **source 与 target 同时存在**：拒绝（error），要求用户手动处理冲突。

### `remove(manifestPath, key, opts?)`

用途：从 manifest 移除一条映射，并且 **默认删除 target 的 symlink**。

- `key`：优先匹配 `id`，否则匹配 `target`。
- `opts.keepLink=true` 可仅移除 manifest 记录，不删除 target symlink。
- **永远不删除 source**。

### `install(manifestPath, opts?)`

用途：按 manifest 全量落地，确保每个 `target` 都是指向 `source` 的 symlink。

安全策略：

- 任意一条出现以下情况，都会 **abort 且不做任何变更**：
  - source 不存在
  - target 存在但不是 symlink

### `uninstall(manifestPath, opts?)`

用途：按 manifest 全量撤销，只删除 `target` 的 symlink；**永远不删除 source**。

## 审计日志（Audit Log）

- 默认写入：`${manifestPath}.log.jsonl`
- 每行是一条 JSON（完整 `Result`），包含：执行步骤、错误、耗时、变更摘要。
- 可通过 `opts.auditLogPath` 指定自定义路径。

## Options（opts）

适用于四个 API 的通用 options（`CommonOptions`）：

- `auditLogPath?: string`：覆盖默认审计日志路径。
- `dryRun?: boolean`：只返回计划/结果，不写文件系统。
- `includePlanText?: boolean`：在 `Result.planText` 中包含可读 plan 文本。
- `logger?: { info/warn/error }`：注入日志实现（可选）。

## 目录结构（维护者）

```text
src/linkany/
  api/        # 4 个对外操作，分别一个文件
  core/       # 执行引擎：plan/apply/fs/audit/runner/backup
  manifest/   # manifest 类型与读写（写回保持未知字段）
  index.ts    # 对外统一导出
  types.ts    # 公共类型（Result/Step/Options）
```

更详细的维护说明见 `src/linkany/KNOWLEDGE_BASE.md`。
