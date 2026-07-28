# PA Table Production Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在所有现有前端/API 功能不变的情况下，以可回滚、可双写、可校验、可切读方式整合 PA 扩展表并对齐 Langfuse 原生能力。

**Architecture:** 使用 expand-migrate-contract。新建 resource extensions、evaluation jobs 和 job executions 三个规范化存储，保留报告快照、条目级分配和审计；通过兼容 repository 将现有 API DTO 与新旧存储隔离，按域启用双写和新读路径。

**Tech Stack:** Python 3.12、FastAPI、Pydantic、psycopg 3、PostgreSQL、Alembic、pytest、uv、Langfuse Public API。

## Implementation Record (2026-07-23)

- 完成：Task 1-5 的配置、expand migration、强类型模型、repository、幂等 backfill。
- 完成：自动评测、报告 Badcase 快照、Report Flowback 双写。
- 完成：定时任务定义、执行、暂停/恢复、终态、删除归档双写。
- 完成：Dataset Export、Annotation Export、Trace Bulk 创建、状态、租约、产物双写；Trace Bulk 由 legacy 表唯一 claim。
- 完成：默认评估模型与 Annotation Assignment Policy 双写和优先新读/legacy fallback。
- 完成：只读一致性校验、受控 backfill/verify CLI、生产 runbook。
- 完成：Langfuse Public API 安全客户端和契约测试；项目级 Basic 与组织级 Bearer 分离。
- 待生产凭据与发布环境完成：公开 API 写切换的外部补偿演练、真实 PostgreSQL Alembic 升降级、生产 backfill/verify、逐域 switch-read。
- 验证：后端全量 pytest、Python compileall、前端 typecheck/build、diff check 已通过；未执行 commit/push。

## Global Constraints

- 不修改 `langfuse/` 和 `dify/`。
- 不改变 `pa-eval-frontend/src/api/registry.ts` 的路径、方法和 DTO。
- 新增 PA 表审计字段必须位于最前并包含表/字段注释。
- 不直接修改 Langfuse 原生表结构。
- 新增、更新、删除 Langfuse 资源优先使用公开 API。
- 不新增明文 Secret 存储或日志输出。
- 所有迁移必须支持 downgrade；首次发布不删除旧表。
- Python 命令使用 `uv`。

---

### Task 1: 锁定迁移模式和配置开关

**Files:**
- Modify: `pa-eval-backend/app/config.py`
- Test: `pa-eval-backend/tests/test_config.py`

**Interfaces:**
- Produces: `Settings.pa_consolidated_writes_enabled: bool`、`Settings.pa_consolidated_reads_enabled: bool`、`Settings.pa_langfuse_native_resource_writes_enabled: bool`

- [ ] 写失败测试，验证三个环境变量缺省值分别为 `true/false/false`。
- [ ] 运行 `uv run pytest tests/test_config.py -q`，确认测试因字段缺失失败。
- [ ] 在 Settings 中增加三个带环境别名的布尔配置，不写死外部地址或密钥。
- [ ] 重跑测试并确认通过。

### Task 2: 创建 expand Alembic 迁移

**Files:**
- Create: `pa-eval-backend/migrations/versions/20260723_0015_create_consolidated_pa_tables.py`
- Test: `pa-eval-backend/tests/test_pa_consolidation_migration.py`

**Interfaces:**
- Produces: `pa_resource_extensions`、`pa_evaluation_jobs`、`pa_job_executions`，以及 report item Badcase 扩展字段。

- [ ] 写迁移结构测试，断言审计字段顺序、表/字段注释、检查约束、唯一索引和 downgrade 删除顺序。
- [ ] 运行目标测试，确认迁移文件缺失导致失败。
- [ ] 使用 Alembic 创建三张新表；为 execution claim、项目历史、resource extension 唯一键建立索引。
- [ ] 为 `pa_evaluation_report_items` 增加 `is_badcase`、`badcase_rule_snapshot`、`primary_score_value`、`badcase_reason`、`badcase_comment`、`badcase_source_type`。
- [ ] 实现 downgrade，仅撤销新增字段和新表，不触碰 legacy 数据。
- [ ] 运行迁移结构测试和现有 `test_pa_migration_schema.py`。

### Task 3: 实现强类型整合模型

**Files:**
- Create: `pa-eval-backend/app/consolidation/models.py`
- Create: `pa-eval-backend/app/consolidation/__init__.py`
- Test: `pa-eval-backend/tests/test_consolidation_models.py`

**Interfaces:**
- Produces: `ResourceExtensionType`、`EvaluationJobType`、`JobExecutionType`、`JobExecutionStatus` 和 `validate_execution_payload(job_type, payload)`。

- [ ] 写参数化失败测试，覆盖合法 payload、未知字段、Secret 字段、非法状态转换和 schema version。
- [ ] 运行目标测试并确认模块缺失。
- [ ] 实现枚举和按类型分发的 Pydantic models；拒绝 `secretKey`、`authToken`、`authorization` 等敏感键。
- [ ] 重跑测试并确认通过。

### Task 4: 实现统一 repository 与双写边界

**Files:**
- Create: `pa-eval-backend/app/consolidation/repository.py`
- Test: `pa-eval-backend/tests/test_consolidation_repository.py`

**Interfaces:**
- Produces: `ConsolidationRepository.upsert_resource_extension()`、`upsert_evaluation_job()`、`create_execution()`、`claim_execution()`、`update_execution()`、`get_execution()`。

- [ ] 使用 fake async cursor 写失败测试，验证 SQL 参数绑定、project scope、幂等冲突和 lock owner 校验。
- [ ] 运行目标测试并确认失败。
- [ ] 实现 repository；所有方法接收调用方已有 transaction cursor，禁止内部偷偷新建事务。
- [ ] 重跑测试并确认通过。

### Task 5: 实现幂等历史回填

**Files:**
- Create: `pa-eval-backend/app/consolidation/backfill.py`
- Test: `pa-eval-backend/tests/test_consolidation_backfill.py`

**Interfaces:**
- Produces: `backfill_consolidated_tables(cursor, batch_size) -> BackfillSummary`。

- [ ] 写失败测试，覆盖 20 张 legacy 表的映射、重复执行、空字段、失败批次回滚和确定性 external ID。
- [ ] 运行目标测试并确认失败。
- [ ] 使用 `INSERT ... SELECT ... ON CONFLICT DO UPDATE/NOTHING` 实现批量回填；不读取或复制 API Key Secret。
- [ ] 为 report badcases 回填 report item 新字段。
- [ ] 重跑测试并确认通过。

### Task 6: 自动评测与报告双写

**Files:**
- Modify: `pa-eval-backend/app/auto_evaluations.py`
- Test: `pa-eval-backend/tests/test_auto_evaluations.py`
- Test: `pa-eval-backend/tests/test_evaluation_reports.py`

**Interfaces:**
- Consumes: `ConsolidationRepository`
- Produces: legacy API DTO 不变，同时写入 `pa_evaluation_jobs`、`pa_job_executions` 和 report item Badcase 字段。

- [ ] 增加失败测试，断言创建、重跑、完成、失败和回流时新旧记录一致。
- [ ] 运行目标测试并确认新表交互缺失。
- [ ] 在现有 transaction cursor 中增加受配置控制的双写。
- [ ] Badcase 列表和回流增加 consolidated read 分支；legacy read 保留。
- [ ] 重跑自动评测和报告测试。

### Task 7: 定时任务双写与统一幂等

**Files:**
- Modify: `pa-eval-backend/app/scheduled_jobs.py`
- Test: `pa-eval-backend/tests/test_scheduled_jobs.py`

**Interfaces:**
- Produces: scheduled definition 映射到 evaluation job，fire log 映射到 job execution；`fire_key` 映射为 `idempotency_key`。

- [ ] 写失败测试覆盖创建、修改、暂停、恢复、手动触发、重复 fire key、租约过期恢复。
- [ ] 运行测试确认失败。
- [ ] 接入双写，确保 legacy 和 consolidated 写入同一事务。
- [ ] 增加 consolidated read 分支并保持返回字段不变。
- [ ] 重跑调度测试。

### Task 8: 导出与 Trace 批处理整合

**Files:**
- Modify: `pa-eval-backend/app/langfuse_db.py`
- Modify: `pa-eval-backend/app/dataset_exports.py`
- Modify: `pa-eval-backend/app/annotations.py`
- Test: `pa-eval-backend/tests/test_datasets.py`
- Test: `pa-eval-backend/tests/test_annotation_exports.py`
- Test: `pa-eval-backend/tests/test_annotations.py`

**Interfaces:**
- Produces: Dataset export、Annotation export、Trace bulk 的统一 execution 状态与 legacy DTO。

- [ ] 写失败测试覆盖创建、claim、续租、进度更新、成功、失败、过期和下载。
- [ ] 运行相关测试并确认 consolidated 交互缺失。
- [ ] 接入 `pa_job_executions` 双写；新记录保存 artifact reference 字段，不把 Secret 放入 payload。
- [ ] consolidated read 分支转换为现有 job DTO。
- [ ] 重跑三个领域测试。

### Task 9: Resource Extensions 接入

**Files:**
- Modify: `pa-eval-backend/app/langfuse_db.py`
- Test: `pa-eval-backend/tests/test_project_settings.py`
- Test: `pa-eval-backend/tests/test_annotations.py`

**Interfaces:**
- Produces: 默认评估模型和 Annotation assignment policy 双写/切读。

- [ ] 写失败测试覆盖默认模型、average/random/weighted、权重归一化和 legacy fallback。
- [ ] 运行测试并确认失败。
- [ ] 接入强类型 resource extension；保留 legacy 表双写。
- [ ] consolidated read 启用时优先读 extension，无记录时回退 legacy。
- [ ] 重跑测试。

### Task 10: Langfuse 原生资源 API Adapter

**Files:**
- Create: `pa-eval-backend/app/langfuse/public_client.py`
- Modify: `pa-eval-backend/app/langfuse_db.py`
- Modify: `pa-eval-backend/app/evaluators.py`
- Test: `pa-eval-backend/tests/test_langfuse_public_client.py`
- Test: `pa-eval-backend/tests/test_project_settings.py`
- Test: `pa-eval-backend/tests/test_evaluators.py`

**Interfaces:**
- Produces: LLM Connections、Models、API Keys、Langfuse Evaluators 的 API 调用封装和稳定 PA 错误映射。

- [ ] 写 mock HTTP 失败测试，覆盖鉴权头、超时、4xx/5xx、脱敏和响应 DTO 转换。
- [ ] 运行测试确认 client 缺失。
- [ ] 使用现有依赖实现 public API client，配置来自环境变量。
- [ ] 在 feature flag 开启时走 API；关闭时保持 legacy 路径作为回退。
- [ ] 确认自定义 Workflow/SDK evaluator 仍只使用 `pa_evaluators`。
- [ ] 重跑项目设置和评估器测试。

### Task 11: 一致性校验与运行手册

**Files:**
- Create: `pa-eval-backend/app/consolidation/verification.py`
- Create: `docs/superpowers/plans/2026-07-23-pa-table-consolidation-runbook.md`
- Test: `pa-eval-backend/tests/test_consolidation_verification.py`

**Interfaces:**
- Produces: `verify_consolidated_data(cursor) -> ConsolidationVerificationReport`。

- [ ] 写失败测试，覆盖总数、状态、外部 ID、进度、报告 Badcase 和 orphan 差异。
- [ ] 实现只读校验，不自动修复生产数据。
- [ ] 编写 expand、backfill、dual write、switch read、rollback 和监控步骤，列出准确环境变量。
- [ ] 重跑校验测试。

### Task 12: 全量验证

**Files:**
- Modify only if verification exposes scoped defects.

- [ ] 运行 `uv run pytest -q`。
- [ ] 运行 `uv run python -m compileall app`。
- [ ] 运行 Alembic upgrade 到 head、downgrade 一版、再次 upgrade 的隔离数据库测试。
- [ ] 在 `pa-eval-frontend` 运行现有 typecheck、test 和 build 命令。
- [ ] 使用 `rg` 扫描新增明文 Secret、绝对路径、直接 Langfuse DML 和未注释字段。
- [ ] 检查 `git diff --check` 和 `git status --short`，记录验证证据；不自动 commit/push。
