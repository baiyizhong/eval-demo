# PA Legacy Table Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除 11 张已整合旧表，使在线功能只依赖最终 12 张 PA 表且现有 API 行为不变。

**Architecture:** 先将资源设置、评测定义、统一执行和 Badcase 的在线读写切成 consolidated-only，再用独立 Alembic Contract 迁移执行带门禁删除。downgrade 重建兼容表并从整合表恢复数据。

**Tech Stack:** Python 3.11、FastAPI、Pydantic、psycopg 3、PostgreSQL、Alembic、pytest、uv、Langfuse Public API。

## Global Constraints

- 不修改 `langfuse/` 和 `dify/`。
- 不改变前端 API 路径、方法、DTO 和权限。
- 不自动 commit、push 或创建 PR。
- 所有数据库变化可 downgrade；生产执行需单独授权。
- Python 命令统一使用 `uv`。

---

### Task 1: Contract 静态契约

**Files:**
- Create: `pa-eval-backend/tests/test_pa_contract_migration.py`
- Create: `pa-eval-backend/migrations/versions/20260723_0016_contract_legacy_pa_tables.py`

- [ ] 先写失败测试，断言 revision 链、11 张表删除顺序、preflight 门禁、downgrade 重建/回填和完整注释。
- [ ] 运行目标测试并确认因迁移缺失失败。
- [ ] 实现 migration upgrade/downgrade，并重跑目标测试。

### Task 2: Resource Extensions consolidated-only

**Files:**
- Modify: `pa-eval-backend/app/langfuse_db.py`
- Modify: `pa-eval-backend/tests/test_consolidated_reads.py`
- Modify: `pa-eval-backend/tests/test_annotations.py`

- [ ] 写失败测试，禁止默认模型和 assignment policy 在线 SQL 引用两张旧设置表。
- [ ] 将读写改为只使用 `pa_resource_extensions`，保持 DTO 与权重归一化。
- [ ] 重跑相关测试。

### Task 3: Evaluation Jobs consolidated-only

**Files:**
- Modify: `pa-eval-backend/app/auto_evaluations.py`
- Modify: `pa-eval-backend/app/scheduled_jobs.py`
- Modify: corresponding tests

- [ ] 写失败测试，覆盖自动任务和定时任务 CRUD、列表、详情、暂停、恢复、删除和触发不引用旧定义表。
- [ ] 将定义读写改为 `pa_evaluation_jobs` 并转换原 DTO。
- [ ] 重跑自动评测和定时任务测试。

### Task 4: Job Executions consolidated-only

**Files:**
- Modify: `pa-eval-backend/app/auto_evaluations.py`
- Modify: `pa-eval-backend/app/scheduled_jobs.py`
- Modify: `pa-eval-backend/app/langfuse_db.py`
- Modify: corresponding tests

- [ ] 写失败测试，覆盖 run、schedule log、export、Trace claim/lease/progress/terminal、flowback 只使用 `pa_job_executions`。
- [ ] 将 Worker claim 源迁到统一租约并保持幂等、lock owner 与 DTO。
- [ ] 重跑各领域测试。

### Task 5: Badcase consolidated-only

**Files:**
- Modify: `pa-eval-backend/app/auto_evaluations.py`
- Modify: `pa-eval-backend/tests/test_auto_evaluations.py`

- [ ] 写失败测试，覆盖 Badcase 列表、详情、编辑和回流不引用 `pa_evaluation_report_badcases`。
- [ ] 统一使用 report item Badcase 字段并保持 API DTO。
- [ ] 重跑报告测试。

### Task 6: Contract 校验与文档

**Files:**
- Modify: `pa-eval-backend/app/consolidation/verification.py`
- Modify: `pa-eval-backend/app/consolidation/cli.py`
- Modify: `docs/superpowers/plans/2026-07-23-pa-table-consolidation-runbook.md`

- [ ] 增加 contracted-schema verify，确认 11 张表不存在、12 张表存在且引用完整。
- [ ] 更新 CLI 和生产 runbook 的部署、停止、downgrade 顺序。
- [ ] 添加测试并重跑。

### Task 7: 全量验收

- [ ] 运行 `uv run pytest -q`、compileall、Ruff 和 `git diff --check`。
- [ ] 扫描在线模块，确认不再引用 11 张删除表。
- [ ] 运行前端 typecheck/build。
- [ ] 记录真实数据库 migration 未执行的授权边界。
