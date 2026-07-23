# Task 5：可靠评估 Worker 与二分拆批实现报告

## 基线与范围

- 基线提交：`a56163f8`
- 实现范围：批量评估执行器、注入式评估适配器协议、心跳租约、Worker ACK/重试/死信协议、Redis PEL 回收、原子完成与后续 Job 创建。
- 未修改 `langfuse/`、`tests/test_auto_evaluations.py`、旧成员报告 `.superpowers/sdd/task-5-report.md` 或外部 `CLAUDE.md` 改动。
- Task 4 已提供内容寻址的 `ManifestStorage.put_result()`，本任务直接复用，因此无需修改 `storage.py` / `test_storage.py`。

## TDD RED 证据

接续时先审阅遗留测试，再补齐状态迁移失败、未知适配器、损坏分片描述符、成功/失败计数、HTTP 429/5xx 与错误码脱敏等边界。

1. 首次聚焦收集失败：3 个 import error，缺失 `BatchSplitExecutionError`、`FollowupJobSpec` 等 Task 5 接口。
2. 补接口骨架后的行为 RED：`32 failed, 51 passed, 2 skipped`；失败来自 Worker/Executor 未实现、`claim_stale()` / `complete_with_followups()` 缺失、Prepare payload 缺少 `shardStart/shardEnd`。
3. HTTP 分类 RED：429 被错误归为通用 provider unavailable，`1 failed, 1 passed`。
4. 并发锁序 RED：完成与单样本死信没有先锁 Run，`2 failed`。
5. 脱敏 RED：外部异常的 `token-secret-value` 被直接当作错误码持久化，`1 failed`。

以上失败均由对应最小生产改动转为 GREEN。

## 实现结果

### 执行器与适配器

- `EvaluatorAdapter` 仅定义注入协议，接收 `config_snapshot`、带稳定 `sampleId/globalIndex` 的批次和 checkpoint；运行时核心没有导入或复制 `auto_evaluations.py`。
- `EvaluateBatchExecutor` 构造并校验 `ShardDescriptor`，调用 `read_shard()`，按全局 `[batch_start, batch_end)` 相对 `shardStart` 切片。
- 模型调用前、模型调用后、对象存储写入前各检查一次租约。
- 适配器输出校验为 `{sampleId, status, outputs, scores, error}`，结果通过内容寻址 key 写对象存储；正常完成仅创建一个 `SYNC_SCORE_BATCH` followup。
- Prepare payload 同时写入 `start/end` 与 `shardStart/shardEnd`；执行器兼容旧 `start/end`。

### 错误分类与二分拆批

| 类别 | 动作 | 持久化信息 |
| --- | --- | --- |
| 确定性样本/映射错误，范围 > 1 | 父 Job 成功，二分创建两个 `EVALUATE_BATCH` 子 Job | 不增加 Run 计数 |
| 确定性样本/映射错误，范围 = 1 | 进入死信 | `failed_count += 1` |
| Timeout / Connection / HTTP 429 / HTTP 5xx | 只调度原 Job 重试 | 安全分类码，不拆批 |
| 配置缺失、未知适配器、其他 `retryable=False` | 进入死信 | 固定安全消息 |

异常原文不会写入数据库；错误消息使用固定文本，错误码仅允许大写字母、数字和下划线的内部格式。

### ACK、PEL 与租约

- 畸形消息不 claim，直接 ACK；claim 返回 `None`（包括已成功的 ACK 前宕机重投）直接 ACK，不再执行模型。
- 成功路径严格为：claim → 启动心跳 → execute → 单事务完成/创建 followup → ACK。
- 数据库提交后 ACK 失败时消息保留在 PEL；再次投递因 Job 已终态而直接 ACK，模型只调用一次。
- `XAUTOCLAIM` 返回 cursor 和全部消息，兼容 bytes/str、redis-py 二元素/三元素响应。
- heartbeat 返回 `False` 立即标记 lease lost；连续两次网络异常后标记 lost，一次异常后成功可恢复。
- lease lost 或任何条件状态迁移返回 `None` 时，不 ACK，且不执行后续业务副作用。

### 事务与计数

- `complete_with_followups()` 在一个事务内条件更新 `RUNNING + lease_owner`、保存结果、清理租约、标记 `SUCCEEDED`、更新 Run 计数，并以一次 bulk INSERT 创建稳定 followups。
- 完成和单样本死信通过 materialized CTE 先锁 Run 再更新 Job，与取消路径保持同一锁顺序。
- 叶批次只将 `SUCCEEDED` 结果计入 `completed_count`，失败结果计入 `failed_count`；split 父 Job 不计数；单样本确定性失败计入一次失败。
- 重复完成因条件更新失败而不会重复增加计数或创建 followup。

## 验证结果

- 聚焦测试：`88 passed, 2 skipped`
- `tests/evaluation_runtime` 全组：`135 passed, 3 skipped`
- Ruff：`All checks passed!`
- 真实 Redis、PostgreSQL、对象存储测试因未配置专用测试环境而按约定 skip，未连接业务设施。
- `git diff --check` 与运行时核心禁导入检查在提交前再次执行。

## 文件清单

- `pa-eval-backend/app/evaluation_runtime/broker.py`
- `pa-eval-backend/app/evaluation_runtime/evaluator_adapters.py`
- `pa-eval-backend/app/evaluation_runtime/executors.py`
- `pa-eval-backend/app/evaluation_runtime/repository.py`
- `pa-eval-backend/app/evaluation_runtime/worker.py`
- `pa-eval-backend/tests/evaluation_runtime/test_broker.py`
- `pa-eval-backend/tests/evaluation_runtime/test_evaluate_batch.py`
- `pa-eval-backend/tests/evaluation_runtime/test_repository.py`
- `pa-eval-backend/tests/evaluation_runtime/test_worker.py`
- `.superpowers/sdd/task-5-runtime-report.md`

## 独立审查修复追加（2026-07-23）

### 修复内容

1. 新增 `EvaluationWorkerRunner`：
   - `run_once()` 使用 `asyncio.gather()` 同时读取 Redis Stream 新消息和 `XAUTOCLAIM` PEL 消息。
   - 保存并推进 XAUTOCLAIM cursor，支持跨迭代分页和回到 `0-0`。
   - `run(stop_event)` 提供可停止的生产消费循环，测试可只执行单次迭代。
   - PEL 中已终态 Job 直接 ACK，不重复执行模型。
2. 收紧二分拆批边界：
   - 仅缺少稳定 `sampleId` 等明确、可定位的样本映射错误产生 `BatchSplitExecutionError`。
   - 适配器结果数量/字段/样本对齐错误统一为 `EVALUATOR_CONTRACT_ERROR`。
   - 无效 shard descriptor、越界 batch range、对象元数据完整性错误均作为全局非重试错误，不创建拆分树。
3. 精确区分 Provider 错误：
   - built-in/httpx timeout、connection、HTTP 429、HTTP 5xx 才进入退避重试。
   - HTTP 400/404 为 `PROVIDER_REQUEST_REJECTED`，401/403 为 `PROVIDER_AUTHENTICATION_FAILED`，未知异常为 `NON_RETRYABLE_EXECUTION`，均进入死信且不重试。
4. Heartbeat 仅吞并明确瞬时连接异常：built-in connection/timeout 与 psycopg `OperationalError`；其他异常通过 checkpoint 立即传播。
5. 新增受控并发领取测试：两个 Worker 同时到达 claim 屏障后竞争原子状态，仅一个获得 Job 并调用模型，两个消息最终各自 ACK。

### 审查修复 TDD 证据

- Runner 缺失 RED：`AttributeError: EvaluationWorkerRunner`；补 runner 后 cursor/终态重投与并发测试 `2 passed`。
- 全局错误边界 RED：`5 failed, 6 passed`，证明契约、范围、descriptor 被错误包装为 split；修复后 EvaluateBatch `11 passed`。
- Provider 确定性错误 RED：400/401/403/404 和未知异常共 `5 failed`，均被错误 retry；修复后 Worker 分类全绿。
- httpx 临时错误 RED：`2 failed, 2 passed`，ConnectError/ReadTimeout 未进入 retry；补明确类型后 `4 passed`。
- Heartbeat 捕获面 RED：未知 `ValueError` 未传播；收紧捕获类型并让 checkpoint 检查后台任务异常后通过。
- 生产循环 RED：缺少 `run(stop_event)`；实现后单迭代停止测试通过。

### 完整验证结果

- 聚焦测试：`104 passed, 2 skipped in 0.19s`
- `tests/evaluation_runtime` 全组：`151 passed, 3 skipped in 0.29s`
- Ruff：`All checks passed!`
- `git diff --check`：通过
- runtime 核心禁导入 `auto_evaluations`：通过
- 真实 Redis、PostgreSQL、对象存储仍未配置，相关测试按既有条件 skip，未连接业务设施。
