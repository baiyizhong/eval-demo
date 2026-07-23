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

---

## 正式审查修复追加（2026-07-24）

本节追加记录对提交 `0cb70d54` 的正式审查修复；以上初始报告中“Admin 鉴权、任意 409 成功、仅重试一次 429、结果对象只校验 hash、部分取消路径未执行报告门控”等描述，以本节为准。

### 修复设计与协议依据

- Public Scores 鉴权改为项目级 `publicKey` / `secretKey` 的 HTTP Basic Auth；Admin Bearer 与 `x-langfuse-admin-api-key` 等 header 仍只用于原有 Admin 能力，Public Score 请求不会携带这些 header。
- 执行器通过最小异步 `ProjectCredentialProvider` 按 `project_id` 获取项目凭据。凭据仅在一次执行的内存调用链中传递，不写入 Job payload、执行结果、followup 或日志；未配置时抛出不可重试且不泄露凭据内容的业务异常。
- 只读核对 Langfuse 官方实现后确认：官方测试工具默认用 `createBasicAuthHeader(publicKey, secretKey)` 调用 Public API，`GET /api/public/scores/{scoreId}` 支持相同项目凭据；当前 Scores v1 POST 为异步 upsert，未提供可依赖的稳定 duplicate 409 业务错误码。因此 POST 409 后必须用同一 Basic Auth 按确定性 Score ID 查询，且仅在返回 `id` 精确匹配时确认成功；查询失败、再次冲突或 ID 不匹配均保留为上游失败。
- 429 使用有界循环处理，默认最多重试 3 次，每次读取最新 `Retry-After`；同时支持秒数和 HTTP-date。`NaN`、`inf`、负数及非法值统一回退为 1 秒，避免无限或异常等待。
- Evaluate 首次生成 Sync followup 时写入不可变 `resultProducerJobId`；多级部分成功 followup 原样保留该字段。Score metadata 的 `paEvaluationJobId` 指向原始 Evaluate producer，而不是当前 Sync Job。
- `ManifestStorage.read_result()` 除 metadata/content hash 外，还要求 key 中的 project、run、producer job 与当前上下文精确一致，拒绝跨项目或跨运行复用合法对象。
- `mark_succeeded()`、`mark_cancelled()`、`request_run_cancel()` 与 lease reaper 的 deadletter 路径均在同一事务内遵循 Run→Job 锁顺序并执行报告终态门控；取消后仍以稳定 idempotency key 保证最多一个报告 Job。

### 审查修复 RED / GREEN

#### RED

1. Public Scores 凭据 provider：Score 同步测试 collection 失败，缺少 `ProjectApiCredentials`。
2. Public Scores Client：引入新错误类前 collection 失败；切换调用契约后 6 个签名错误；非法 `Retry-After` 场景为 `3 failed, 1 passed`；GET 再次 409 未映射为上游失败。
3. 结果对象上下文：6 个用例失败，`read_result()` 尚不接受 expected project/run/producer 参数。
4. 报告门控：取消/成功路径聚焦用例 `5 failed`；lease reaper 最终 deadletter 报告用例 `1 failed`。
5. Evaluate producer：聚焦用例因缺少 `resultProducerJobId` 报 `KeyError`。

#### GREEN

1. Public Scores Client：`14 passed`。
2. Score 同步：`10 passed`。
3. 结果对象存储：`33 passed, 1 skipped`。
4. Repository：门控聚焦 `5 passed`；加入 reaper 场景后完整为 `38 passed, 1 skipped`。
5. Evaluate producer：聚焦用例 `1 passed`。

### 修复后最终验证

1. `cd pa-eval-backend && uv run pytest tests/evaluation_runtime/test_score_sync.py tests/test_langfuse_project_api_client.py tests/evaluation_runtime/test_repository.py tests/evaluation_runtime/test_storage.py -q`
   - 结果：`95 passed, 2 skipped in 0.19s`。
2. `cd pa-eval-backend && uv run pytest tests/evaluation_runtime/test_score_sync.py tests/test_langfuse_project_api_client.py -q`
   - 结果：`24 passed in 0.13s`。
3. `cd pa-eval-backend && uv run pytest tests/evaluation_runtime -q`
   - 结果：`177 passed, 3 skipped in 0.29s`。
4. `cd pa-eval-backend && uv run ruff check app/errors.py app/langfuse_client.py app/evaluation_runtime/executors.py app/evaluation_runtime/repository.py app/evaluation_runtime/storage.py tests/evaluation_runtime/test_score_sync.py tests/evaluation_runtime/test_evaluate_batch.py tests/evaluation_runtime/test_repository.py tests/evaluation_runtime/test_storage.py tests/test_langfuse_project_api_client.py`
   - 结果：`All checks passed!`。
5. `git diff --check`
   - 结果：通过，无 whitespace error。
6. 边界复核：`langfuse/` 无改动；`executors.py` 不包含 ClickHouse writer、Langfuse DB 连接或 Score 写 SQL；未连接任何真实 Langfuse、数据库、Redis 或对象存储。

### 修复追加文件

- `pa-eval-backend/app/errors.py`
- `pa-eval-backend/app/langfuse_client.py`
- `pa-eval-backend/app/evaluation_runtime/executors.py`
- `pa-eval-backend/app/evaluation_runtime/repository.py`
- `pa-eval-backend/app/evaluation_runtime/storage.py`
- `pa-eval-backend/tests/evaluation_runtime/test_evaluate_batch.py`
- `pa-eval-backend/tests/evaluation_runtime/test_repository.py`
- `pa-eval-backend/tests/evaluation_runtime/test_score_sync.py`
- `pa-eval-backend/tests/evaluation_runtime/test_storage.py`
- `pa-eval-backend/tests/test_langfuse_project_api_client.py`
- `.superpowers/sdd/task-6-report.md`
