# Task 6 报告：Langfuse Score 幂等同步

- 基线提交：`d7c07d85`
- 任务范围：实现 `SyncScoreBatchExecutor`、`LangfuseProjectApiClient.create_score()`、Task 5 结果对象读取、部分成功确认续跑，以及 Evaluate/Sync 全终态后的幂等 `GENERATE_REPORT` 门控。
- 状态：完成，未扩大到 Task 7。

## 实现摘要

### Score payload 与 API 写入边界

- 复用 `deterministic_score_id(run_id, sample_id, score_name)` 生成稳定 Score ID。
- Score metadata 写入 `paAutoEvaluationRunId`、`paEvaluationJobId`、`paEvaluationSampleId`，并保留安全的业务 metadata。
- `SyncScoreBatchExecutor` 的 Langfuse 写入仅调用 `LangfuseProjectApiClient.create_score()`。
- `create_score()` 使用 Langfuse Public Score API：`POST /api/public/scores`；未引入 ClickHouse writer，也未对 Langfuse PostgreSQL/ClickHouse 执行写 SQL。
- HTTP 409（确定性 ID 已存在）按成功处理，返回并记录远端对象 ID。

### 部分成功、重试与限流

- 每批最多发送 100 个 Score，并以 `asyncio.Semaphore` 限制并发；默认并发上限为 10，且不允许超过单批大小。
- 首次 100 条中前 60 条成功、后 40 条超时时：
  - 当前 Job 的 `result_summary.confirmedScores` 持久化 60 条 `{scoreId, remoteObjectId}`；
  - 原子创建只包含 40 个 `pendingScoreIds` 的后续 `SYNC_SCORE_BATCH`；
  - 后续执行从同一不可变结果对象重建 payload，但只发送未确认的 40 条。
- 若一次执行完全无进展，则抛出原始异常，交给既有 Job retry/deadletter 机制；已有 `pendingScoreIds` 的 Job 仍只重发该子集。
- 429 读取并尊重 `Retry-After`，支持秒数和 HTTP-date 两种标准格式，然后在有界并发内重试一次。

### 结果对象与报告门控

- `ManifestStorage.read_result()` 校验结果 key、对象 metadata hash、解压后内容 hash 与 JSON mapping 结构。
- `complete_with_followups()` 先完成当前 Job、再插入 pending Sync followup，最后检查报告条件，避免部分成功时提前创建报告。
- Repository 在 Run 锁保护下确认所有 `EVALUATE_BATCH` / `SYNC_SCORE_BATCH` 均处于 `SUCCEEDED`、`DEAD_LETTER` 或 `CANCELLED` 后，幂等插入一个 `GENERATE_REPORT`。
- 报告 Job 使用稳定 idempotency key 和 `ON CONFLICT (idempotency_key) DO NOTHING`；样本或 Score 同步存在 deadletter 时仍允许生成部分成功报告。
- 普通 deadletter、单样本 deadletter和 retry 耗尽路径均执行相同报告终态检查。

## 变更文件

- `pa-eval-backend/app/evaluation_runtime/executors.py`
- `pa-eval-backend/app/evaluation_runtime/repository.py`
- `pa-eval-backend/app/evaluation_runtime/storage.py`
- `pa-eval-backend/app/langfuse_client.py`
- `pa-eval-backend/tests/evaluation_runtime/test_score_sync.py`
- `pa-eval-backend/tests/evaluation_runtime/test_repository.py`
- `pa-eval-backend/tests/evaluation_runtime/test_storage.py`
- `pa-eval-backend/tests/test_langfuse_project_api_client.py`
- `.superpowers/sdd/task-6-report.md`

## TDD 证据

### RED

1. `cd pa-eval-backend && uv run pytest tests/evaluation_runtime/test_score_sync.py tests/test_langfuse_project_api_client.py -q`
   - 结果：collection 失败，2 errors；缺少 `SyncScoreBatchExecutor` 与 `LangfuseRateLimitError`。
2. `cd pa-eval-backend && uv run pytest tests/evaluation_runtime/test_storage.py::test_result_round_trip_validates_hash_and_returns_mapping tests/evaluation_runtime/test_repository.py::test_final_sync_inserts_one_report_only_after_followups_and_all_dependencies_terminal tests/evaluation_runtime/test_repository.py::test_partial_sync_followup_is_inserted_before_report_terminal_gate -q`
   - 结果：3 failed；缺少 `read_result()` 和 `GENERATE_REPORT` 门控。
3. `cd pa-eval-backend && uv run pytest tests/evaluation_runtime/test_repository.py::test_sync_dead_letter_still_enqueues_partial_report_when_all_jobs_terminal -q`
   - 结果：1 failed；deadletter 终态未创建报告。
4. `cd pa-eval-backend && uv run pytest tests/evaluation_runtime/test_repository.py::test_exhausted_sync_retry_enqueues_partial_report_when_run_is_terminal -q`
   - 结果：1 failed；retry 耗尽未创建报告。
5. `cd pa-eval-backend && uv run pytest tests/test_langfuse_project_api_client.py::test_create_score_accepts_http_date_retry_after -q`
   - 结果：1 failed；HTTP-date `Retry-After` 尚未解析。

### GREEN

1. Score/API 聚焦测试：首次实现后 `12 passed`；增加 HTTP-date 场景并 fresh 重跑后 `13 passed`。
2. 结果对象与报告门控聚焦测试：`3 passed`。
3. deadletter 报告测试：`1 passed`。
4. retry 耗尽报告测试：`1 passed`。
5. Repository 测试：`36 passed, 1 skipped`。
6. 全部运行时测试：`166 passed, 3 skipped`。

## 最终验证

1. `cd pa-eval-backend && uv run pytest tests/evaluation_runtime/test_score_sync.py tests/test_langfuse_project_api_client.py -q`
   - 结果：`13 passed in 0.13s`。
2. `cd pa-eval-backend && uv run pytest tests/evaluation_runtime -q`
   - 结果：`166 passed, 3 skipped in 0.28s`。
3. `cd pa-eval-backend && uv run ruff check app/evaluation_runtime/executors.py app/evaluation_runtime/repository.py app/evaluation_runtime/storage.py app/langfuse_client.py tests/evaluation_runtime/test_score_sync.py tests/evaluation_runtime/test_repository.py tests/evaluation_runtime/test_storage.py tests/test_langfuse_project_api_client.py`
   - 结果：`All checks passed!`。
4. `git diff --check`
   - 结果：通过，无 whitespace error。
5. 源码边界检查
   - `langfuse/` 无改动。
   - `executors.py` 不包含 ClickHouse writer、`langfuse_db` 或 Langfuse Score 写 SQL。

## 约束验证

- 未修改 `langfuse/` 参考代码或 Langfuse 原生表结构。
- 未新增数据库迁移或直接数据库操作；报告 Job 仅写入既有 PA 表 `pa_evaluation_jobs`。
- Score 写入只经过 Langfuse API client；同步模块无 ClickHouse writer、Langfuse PG/CK 写入或 Score 写 SQL。
- 未硬编码外部地址、密钥或真实凭据；测试中的地址和 token 均为本地假值。
- 测试使用 fake HTTP client、fake object store 与 fake repository cursor；未连接真实 Langfuse、PostgreSQL、ClickHouse、Redis 或对象存储。
- 保留并排除用户已有 `CLAUDE.md` 改动。

## Concerns

- 未配置真实外部服务，因此未执行 live Langfuse/Object Storage/数据库集成测试；相关边界均通过 mock/fake 验证，环境依赖的运行时测试显式 skipped。
- Task 7 的生产装配、报告内容生成与 Run 最终状态推进不在本任务范围内。
