# linkany Knowledge Base

## 1. Purpose

`linkany` 是 `cursor-rules-sync` 内部抽取出的“安全 symlink 管理器”，目标是提供一个 **安全、可追溯、默认拒绝风险操作** 的 API，用于维护一组 `source ↔ target` 的链接关系。

核心约束（必须满足）：

- **仅 symlink**：创建 symlink 失败时直接报错；不提供“copy 兜底安装”。
- **不删除 source**：`remove/uninstall` 永远不触碰 source（不 rm、不覆盖、不清空）。
- **冲突默认拒绝**：任何可能导致数据丢失或误删真实文件/目录的情形，都应拒绝或 abort。
- **有记录**：所有操作写审计日志（JSONL），便于追溯与排错。

## 2. Public API

对外 API 只有四个（每个独立文件）：

- `src/linkany/api/add.ts`: `add(manifestPath, mapping, opts?)`
- `src/linkany/api/remove.ts`: `remove(manifestPath, key, opts?)`
- `src/linkany/api/install.ts`: `install(manifestPath, opts?)`
- `src/linkany/api/uninstall.ts`: `uninstall(manifestPath, opts?)`

统一导出：

- `src/linkany/index.ts`

公共类型：

- `src/linkany/types.ts`（`Result/Step/CommonOptions` 等）

## 3. Directory Structure

```text
src/linkany/
  api/
    add.ts
    remove.ts
    install.ts
    uninstall.ts
    index.ts
  core/
    apply.ts        # 执行 Step 序列，返回 Result
    audit.ts        # JSONL 审计日志
    runner.ts       # 统一 operation 入口（计时/dryRun/planText/audit）
    format-plan.ts  # Step[] -> human-readable plan text
    backup.ts       # 通用备份策略与 step 化
    fs.ts           # 可注入 FS 接口（解耦 plan 与 fs-extra）
    fs-ops.ts       # fs 操作封装（symlink/copy/rename）
    plan.ts         # 生成 Step 序列（含 atomic tmp/rename）
  manifest/
    types.ts        # manifest 类型、解析、resolveEntry、loadManifest
    io.ts           # loadOrCreate/save/upsert/remove（写回保留未知字段）
  index.ts
  types.ts
```

职责划分原则：

- `api/*`：只处理“业务语义 + 安全策略”，负责组装 steps、写 manifest、写 audit。
- `core/*`：只做可复用的执行/工具能力（plan/apply/fs/audit）。
- `manifest/*`：只负责结构、解析、读写与稳定写回。

## 4. Manifest v1

在 `src/linkany/manifest/types.ts` 定义与校验。

关键点：

- `version` 必须为 `1`
- `installs` 必须为数组
- `source/target` 可为相对路径：相对基准为 manifest 文件所在目录（`getManifestBaseDir` + `resolveEntry`）
- 允许额外字段存在，并在写回时保留

## 5. Safety Semantics (Important)

### 5.1 add()

`add` 的目标是：**让 target 成为指向 source 的 symlink，并把映射写入 manifest**。

关键行为：

- 如果 `target` 已经是指向 `source` 的 symlink：只 upsert manifest（no-op on FS）。
- 如果 `source` 与 `target` 同时存在：**拒绝**（error），避免覆盖/迁移引发数据丢失。
- 如果 `target` 存在且不是 symlink、同时 `source` 不存在：执行一次安全迁移：
  - copy `target -> source`
  - move `target -> target.bak.<timestamp>.<rand>`
  - 再创建 `target -> source` symlink
- 如果 `source` 不存在且 `target` 不存在：创建空 source，再 link。

### 5.2 install()

`install` 是 **全量** 收敛：

- 任何 `source` 不存在：abort
- 任何 `target` 存在但不是 symlink：abort

（目的：避免 install 过程中误删/覆盖真实文件目录）

### 5.3 remove()/uninstall()

两者都遵循：

- **只删除 target 的 symlink**
- target 若不是 symlink：跳过（noop），避免误删真实文件/目录
- **永不删除 source**

## 6. Atomic Strategy

在 `core/plan.ts` 与 `core/apply.ts` 中体现。

对于 symlink：

- 先创建 `target.tmp.<rand>` 指向 source
- 再 `rename(tmp -> target)` 替换到位

替换已有 symlink（更强原子替换 / 可恢复）：

- 优先将旧 `target` 移到 `target.bak.<timestamp>.<rand>`（`core/backup.ts`）
- 再将 tmp symlink `rename` 到 `target`

对 copy（仅用于 `add` 的 target->source 迁移）：

- 优先 copy 到临时路径，再 rename 到位（减少半成品风险）

注意：

- atomic 是“尽力而为”，依赖底层文件系统的 `rename` 语义（POSIX 上通常可用）。

## 7. Audit Log

在 `core/audit.ts`：

- 默认路径：`${manifestPath}.log.jsonl`
- 写入内容：完整 `Result`（一行一条 JSON）

Result 设计要点：

- `steps`: 每个计划步骤的执行状态（planned/executed/skipped/failed）
- `changes`: 变更摘要（用于快速浏览）
- `warnings/errors`: 明确记录异常原因
- `planText`：可选的人类可读 plan（当 `opts.includePlanText=true`）
- `rollbackSteps`：best-effort 的回滚 steps（协议/数据结构，未来可扩展为 rollback 命令）

## 7.1 dry-run

`CommonOptions.dryRun=true` 时，通过 `core/apply.ts` 跳过所有写操作：

- 不会调用 `symlink/rename/unlink/copy`
- `Result` 仍然会包含 steps（通常为 `skipped`）以及可选 planText
- 默认仍写审计日志（便于审计/预演）；如未来需要可引入 `auditOnDryRun` 开关

## 8. Integration: CRS

当前 `cursor-rules-sync` 的 `src/link.ts` 已改为通过 `linkany/core/*` 的安全 symlink 能力来创建/删除链接，从而保证“只删 symlink、不删真实文件”的安全属性。

## 9. Testing Notes

- `src/linkany/__tests__/safety.test.ts` 覆盖最关键的安全语义（精简用例）：
  - `add` 在 source/target 同时存在时拒绝
  - `install` 遇到“target 存在但不是 symlink”时 abort
  - `dryRun` 不触发 unlink/symlink 等 side effects

建议未来补充（可选）：

- `remove` 默认会 unlink symlink，但当 target 为真实目录/文件时应 noop
- `audit` 写入失败时只 warning，不影响主流程（或按需要调整）
