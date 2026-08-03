# PA 表整合生产运行手册

## 1. 发布不变量

- 不修改、删除或重命名 Langfuse 原生表。
- 不修改 `langfuse/`、`dify/` 参考代码。
- `20260723_0015` Expand 阶段不删除 PA legacy 表；只有独立 Contract
  迁移 `20260723_0016` 删除 11 张旧表。
- 第 3～8 节记录 Contract 前的历史过渡流程。当前 consolidated-only
  应用已不包含 legacy 在线读写路径，关闭功能开关不能恢复旧表访问。
- 生产执行前先备份 PostgreSQL，并记录 Alembic 当前 revision、应用版本和操作 txId。
- 本手册中的命令不包含真实数据库地址、Token 或 Secret；全部由环境变量注入。

## 2. Loop Engine

每一阶段只执行一个业务域，并按以下闭环运行：

1. Observe：采集迁移版本、应用版本、任务积压、错误率和一致性报告。
2. Choose：选择一个尚未通过门禁的域，不跨域同时切换。
3. Act：执行 expand、backfill、dual-write、verify 或 switch-read 中的单一动作。
4. Verify：运行域测试、只读一致性校验和可观测性检查。
5. Record：记录 txId、开始/结束时间、行数、差异和回滚结论。
6. Stop：Contract 前发现异常时停止当前域并按当时阶段回退开关；Contract
   发布后必须停止服务，执行“应用版本回退 + Alembic downgrade”完整回退。

域顺序：Resource Extensions → 自动评测 → 定时任务 → Dataset Export → Annotation Export → Trace Bulk → Report Flowback → Badcase Read。

## 3. Expand（Contract 前历史阶段）

本节到第 8 节仅用于说明 `0015` Expand 到 Contract 前的过渡顺序，不是
当前 consolidated-only 版本的在线回退方案。

在应用代码发布但三个开关均关闭的条件下执行：

```bash
cd pa-eval-backend
uv run alembic current
uv run alembic upgrade 20260723_0015
uv run alembic current
```

门禁：三张新表、索引、检查约束、表注释和字段注释存在；legacy 表和现有 API 均未改变。

数据库回退仅在尚未写入新表且未启用双写时使用：

```bash
uv run alembic downgrade 20260719_0014
```

## 4. Backfill（Contract 前历史阶段）

通过受控管理命令在单一数据库事务内执行。先在影子库运行，再在生产维护窗口执行。任务可重复运行，禁止复制 `pa_project_api_keys` 的 Secret 字段。

```bash
cd pa-eval-backend
uv run python -m app.consolidation.cli backfill --apply --actor pa-consolidation-backfill
uv run python -m app.consolidation.cli verify
```

校验发现差异时退出码为 `2`，便于发布流水线自动停止。

回填后必须运行 `verify_consolidated_data(cursor)`，要求：

- 每条 legacy 来源均有 consolidated 记录覆盖，允许新增 consolidated-only 记录；
- 状态及进度一致；
- Badcase 数量一致；
- 无 legacy 记录缺失对应 consolidated 记录；
- 差异总数为 0。

若 consolidated 记录的 `update_date` 晚于 legacy，final backfill 保留该记录的可变业务字段；legacy 审计字段与 downgrade 快照仍必须完整写入。final backfill 开始后必须保持停写，直到 Contract 完成，禁止在 backfill 与删表迁移之间开放业务流量。

统一执行的无损回退快照固定写入 `result_payload.paLegacy`。校验必须覆盖六类 execution 的完整快照；运行时结果更新采用 JSON 合并，不得删除该键。

存在差异时保持所有开关关闭，只允许重新执行幂等回填或发布经评审的修复版本；校验器不得自动修复数据。

## 5. Dual Write（Contract 前历史阶段）

先发布一个完整观察窗口，配置：

```env
PA_CONSOLIDATED_WRITES_ENABLED=true
PA_CONSOLIDATED_READS_ENABLED=false
PA_LANGFUSE_NATIVE_RESOURCE_WRITES_ENABLED=false
```

逐域执行创建、更新、失败、重试和终态用例。旧表与新表写入共用 PostgreSQL 事务；任一侧失败应整体回滚。Trace Bulk 继续以 legacy 表为唯一 claim 源，统一执行表只镜像租约，避免双重消费。

回滚：将 `PA_CONSOLIDATED_WRITES_ENABLED=false` 并滚动重启应用。不要 downgrade 数据库，不删除已写入的新表数据。

## 6. Switch Read（Contract 前历史阶段）

仅在双写观察窗口内一致性报告持续为零差异后启用：

```env
PA_CONSOLIDATED_WRITES_ENABLED=true
PA_CONSOLIDATED_READS_ENABLED=true
PA_LANGFUSE_NATIVE_RESOURCE_WRITES_ENABLED=false
```

当时的过渡版本允许新记录缺失时回退 legacy，并保持现有 API 路径、DTO、分页、权限和错误码不变。该能力不属于 consolidated-only Contract 版本。

上述历史阶段的读路径回滚可设置 `PA_CONSOLIDATED_READS_ENABLED=false`；
一旦发布 consolidated-only 应用或执行 `0016`，禁止用此开关代替应用与数据库回退。

## 7. Langfuse Public API 写切换（Contract 前历史阶段）

在 LLM Connections、Models、API Keys 和 Langfuse 原生 Evaluators 的适配器通过契约测试后，单独启用：

```env
PA_LANGFUSE_NATIVE_RESOURCE_WRITES_ENABLED=true
```

项目级 LLM Connections、Models 和 Evaluators 使用项目 Public/Secret Key 的 Basic Auth。Project API Keys 不再使用 Langfuse 组织级接口，创建/删除沿用历史可用链路：同步写 `pa_project_api_keys` 与 Langfuse 原生 `api_keys`，并使用 `LANGFUSE_SALT` 生成 `fast_hashed_secret_key`。API 地址和凭据只从部署环境读取。上游失败必须转换为稳定 PA 错误码，日志不得包含 Authorization、Token、Secret 或上游完整错误响应。Workflow/SDK 自定义评估器继续使用 `pa_evaluators`。

回滚：关闭该开关；不要通过 SQL 直接修改 Langfuse 原生资源。

## 8. 监控与停止条件

监控项：

- PA API 非零业务码和 HTTP 5xx；
- 双写事务回滚率；
- legacy/consolidated 覆盖差异；
- 任务状态、进度和终态差异；
- claim 冲突、租约过期和重复执行；
- 导出产物缺失；
- Badcase 数量与回流结果差异；
- Langfuse API 超时、429 和 5xx。

任一未知差异、数据丢失、重复消费或 Secret 泄露迹象均为立即停止条件。
Contract 前可关闭对应开关；Contract 后应停止全部服务并进入第 9.3 节完整回退。
两种情况都必须保留现场日志和 txId，且不得自动修复数据。

## 9. Contract

Contract 使用独立迁移 `20260723_0016`，只允许在至少一个完整数据保留周期内 legacy 无新增写入、所有一致性报告持续通过、恢复演练通过且获得单独审批后执行。禁止把删除操作追加到 `20260723_0015`。

### 9.1 发布前门禁

1. 停止 API、后台 Worker、Scheduler 和所有可能写 PA 表的管理任务。
2. 确认没有 `RUNNING` 的相关统一执行，且维护窗口内不会产生新写入。
3. 完成 PostgreSQL 备份并验证恢复点，记录当前 revision、应用版本、txId 和操作人。
4. 在旧表仍存在且所有写入已停止时，使用 Contract 版本代码执行最后一次幂等 backfill，再运行一致性校验；两条命令退出码都必须为 `0`：

```bash
cd pa-eval-backend
uv run alembic current
uv run python -m app.consolidation.cli backfill --apply --actor pa-consolidation-backfill
uv run python -m app.consolidation.cli verify
```

任一差异、未知执行状态或迁移版本不为 `20260723_0015` 时立即停止，不得执行删表迁移。完成 final backfill 后继续保持全部服务停止；此后不得产生任何 legacy 或 consolidated 写入。

### 9.2 执行 Contract

保持 PA API、Worker 和 Scheduler 全部停止，PostgreSQL 与 Langfuse API 保持可用。维护窗口期间必须在网关或访问控制层禁止除迁移主机外的 Langfuse LLM Connections/Models 写请求（包括 Langfuse Web 管理操作）；查询流量可以继续。同步工具和 PA 在线写路径会使用同一 provider advisory lock，但 Langfuse 原生写入口不识别该锁，因此外部写冻结是消除跨入口 TOCTOU 的必要生产门禁。部署 consolidated-only Contract 版本，并在同一维护窗口内立即执行：

```bash
uv run alembic upgrade 20260723_0016
uv run python scripts/sync_native_model_settings.py
uv run alembic upgrade 20260723_0017
uv run alembic current
uv run python -m app.consolidation.cli verify-contract
```

`verify-contract` 退出码必须为 `0`，并同时满足：

- 最终 10 张 PA 表全部存在；
- 13 张 contracted legacy/shadow 表全部不存在；
- 自动/定时评测执行、报告、报告项和人工标注分配无孤儿引用。

`sync_native_model_settings.py` 必须先完成连接、模型和默认连接 ID 的原生迁移；`0017` 会重新校验每条 ACTIVE 旧资源的成功映射、原生资源存在性和默认引用，任一不完整都会在 DROP 前终止。PA 后端必须配置与 Langfuse 相同的 `LANGFUSE_ENCRYPTION_KEY`，用于连接编辑时安全保留原密钥；该值不得写入代码、日志或命令行。

`0016` 在任何 DROP 前还会拒绝未知 `pa_%` 表、错误的 job/execution discriminator、缺失的 `paLegacy` 回退快照及上述孤儿引用；迁移失败时整个事务回滚，不会留下部分删表状态。

final backfill、部署 consolidated-only 版本和 `0016` Contract 是同一个连续停写闭环，中间禁止启动任何旧版或新版业务进程。较新的 consolidated 记录保持事实源，迁移门禁只要求 legacy 数据被完整覆盖并保留审计/回退快照。

验证通过后再启动 API、Worker 和 Scheduler，执行自动评测、定时任务、导出、Trace Bulk、Badcase 和回流冒烟测试，并观察一个完整发布窗口。

### 9.3 Contract 回退

应用尚未恢复写入或可接受丢弃维护窗口后新写入时，可在停止所有进程后执行：

```bash
uv run alembic downgrade 20260723_0015
uv run python -m app.consolidation.cli verify
```

`downgrade` 会重建 11 张兼容表并从三张整合表反向回填。若 Contract 后已恢复业务写入，必须先停止服务、备份现场并评估反向回填覆盖范围；禁止在运行中的生产实例直接 downgrade。数据库回退后需同步回退到仍支持 legacy schema 的应用版本。

Contract 回退是不可拆分操作：先停止 API、Worker、Scheduler，再执行数据库
downgrade，并部署与 legacy schema 匹配的历史应用版本。不得只切换
`PA_CONSOLIDATED_READS_ENABLED` 或 `PA_CONSOLIDATED_WRITES_ENABLED` 并期待旧路径恢复。

本仓库交付只包含迁移、校验器和运行手册；不得在开发环境代替生产审批执行真实生产 backfill、Contract drop 或 downgrade。
