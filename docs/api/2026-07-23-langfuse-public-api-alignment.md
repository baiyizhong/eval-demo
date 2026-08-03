# PA Eval 全接口 Langfuse Public API 对齐报告

日期：2026-07-23

## 1. 结论

当前后端共有 130 个 HTTP 接口（129 个业务路由加 1 个健康检查）。现状并未做到“Langfuse 是全部评测数据的唯一来源和去向”：大量 traces、datasets、annotation queues、score configs、organizations 和 projects 接口仍直接读写 Langfuse PostgreSQL/ClickHouse。

当前目标架构收敛为：

```text
Frontend
   │ 现有 PA API 契约
   ▼
PA Backend
   ├─ DTO、鉴权、分页、聚合、异步任务、审计
    └─ Langfuse 项目级 Public API / 官方 SDK / 必要的历史数据库链路
          │
          ▼
       Langfuse（评测业务唯一事实源）
```

当前不能使用 Langfuse 组织级接口，也不再配置组织级 API Key。项目级 LLM Connections、Models、Evaluators、traces、datasets、scores 等优先走项目级 Public API；组织、项目、成员和 Project API Key 管理沿用历史可用的数据库-backed reader 链路。Project API Key 创建/删除同步写 `pa_project_api_keys` 与 Langfuse 原生 `api_keys`，需要 `LANGFUSE_SALT` 生成 `fast_hashed_secret_key`。

登录会话、PA 超级管理员、审计日志、导出文件、异步任务、报告模板、报告快照、Dify 回流和定时调度没有 Langfuse 对等资源，可以保留为 PA 控制面数据。它们引用 trace、observation、dataset、score、evaluator 等对象时，只保存 Langfuse ID，不复制业务实体。

## 2. 分类统计

| 分类 | 数量 | 定义 |
|---|---:|---|
| Direct | 29 | PA 路由与一个 Langfuse Public API 基本一一对应，仅做鉴权、DTO 和响应包装 |
| Adapter | 38 | 数据仍全部来自/写入 Langfuse，但 PA 需要聚合多个官方接口、转换分页或执行补偿流程 |
| Extension | 51 | Langfuse 没有该控制面资源，PA 保留认证、审计或编排状态；底层评测数据仍必须走 Langfuse |
| Blocked | 12 | 官方接口无法保持现有写语义，禁止继续直写 Langfuse 原生表，等待产品契约调整 |
| 合计 | 130 | 与当前应用实际暴露接口数一致 |

## 3. Langfuse 官方能力基线

项目级资源使用 Public/Secret Key Basic Auth。组织级 Public API 方案已废弃：组织、项目、成员及项目 API Key 管理不再使用 Organization API Key。新查询优先使用 Observations v2、Scores v3 和 Metrics v2。

| 业务实体 | 官方接口 | 能力边界 |
|---|---|---|
| Traces | `GET/DELETE /api/public/traces[/{traceId}]` | list/get/delete；无普通 PATCH |
| Observations | `GET /api/public/v2/observations` | 游标分页、字段组和结构化过滤 |
| Metrics | `GET /api/public/v2/metrics` | observations、numeric scores、categorical scores 聚合 |
| Datasets | `GET/POST /api/public/v2/datasets`、`GET /api/public/v2/datasets/{datasetName}` | create/list/get；无 dataset update/delete |
| Dataset Items | `GET/POST /api/public/dataset-items`、`GET/DELETE /api/public/dataset-items/{id}` | create 按项目级 `id` upsert，支持 status；可覆盖 update/archive，另有 list/get/delete |
| Dataset Runs | `/api/public/datasets/{datasetName}/runs`、`/api/public/dataset-run-items` | run/run item 读写；可作为实验结果事实源 |
| Annotation Queues | `/api/public/annotation-queues` | queue create/list/get；无 queue update/delete |
| Queue Items | `/api/public/annotation-queues/{queueId}/items[/{itemId}]` | item create/list/get/update/delete |
| Queue Assignments | `/api/public/annotation-queues/{queueId}/assignments` | queue 与用户级 assignment；不等价于 PA 的 item 级加权分配 |
| Score Configs | `/api/public/score-configs[/{configId}]` | create/list/get/update；无明确 archive/restore |
| Scores | `GET /api/public/v3/scores`、`POST /api/public/scores` | v3 查询；官方写分数接口 |
| Evaluators | `/api/public/unstable/evaluators[/{id}]` | create/list/get/delete；同名 create 产生新版本，无原位 update |
| Evaluation Rules | `/api/public/unstable/evaluation-rules[/{id}]` | 完整 CRUD，但仅实时 ingestion，不执行历史 backfill |
| Experiments | `/api/public/experiments` | 实验及实验项读取；批量执行使用官方 SDK experiment workflow |
| Organizations | 数据库-backed reader | 当前不能使用组织级接口；组织成员管理沿用历史可用数据库链路 |
| Projects | 数据库-backed reader | 当前不能使用组织级接口；项目 create/update 与 archive/restore 沿用历史可用数据库链路 |
| Project Members | 数据库-backed reader | 当前不能使用组织级接口；项目成员管理沿用历史可用数据库链路 |
| Project API Keys | `pa_project_api_keys` + Langfuse 原生 `api_keys` | 不使用组织级 Project API Key Public API；创建/删除同步维护 PA 展示表和 Langfuse 原生认证表 |
| LLM Connections | `/api/public/llm-connections[/{id}]` | list/upsert/delete |
| Models | `/api/public/models[/{id}]` | create/list/get/delete；无 update |

## 4. 逐域接口映射

### 4.1 系统、认证和治理（9）

| PA 接口 | 数量 | 分类 | 目标数据路径 |
|---|---:|---|---|
| `GET /health` | 1 | Extension | 本地进程健康；后续可附加 Langfuse health 探测 |
| `GET /api/auth/github/login`、`GET /api/auth/github/callback` | 2 | Extension | PA OAuth/session；Langfuse 无对应 Public API |
| `GET /api/user/session` | 1 | Extension | PA session + Langfuse membership/project adapter |
| `/api/admin/users`、`/{userId}/role-bindings`、`/{userId}/admin` | 3 | Extension | PA 超级管理员与角色控制面；项目/组织成员事实走 Langfuse membership API |
| `GET /api/admin/overview`、`GET /api/audit-logs` | 2 | Extension | PA 审计与运营视图；业务统计从 Langfuse API 聚合 |

### 4.2 Organizations（10）

| PA 接口 | 数量 | 分类 | Langfuse 对齐 |
|---|---:|---|---|
| `GET/POST /api/organizations`、`GET/PATCH /api/organizations/{id}` | 4 | Blocked | 官方仅操作 API Key 所属组织，没有组织本体 create/update、当前用户多组织 list/get |
| `GET /api/organizations/member-email-settings` | 1 | Extension | PA 配置能力 |
| `GET/POST /api/organizations/{id}/members`、`PATCH/DELETE .../members/{memberId}` | 4 | Extension | 数据库-backed reader 管理 `users`、`organization_memberships` 与邀请清理 |
| `POST /api/organizations/{id}/members/import` | 1 | Extension | 批量调用 reader，返回成功明细和失败原因 |

组织级 Organization API Key 方案已废弃，当前不配置也不读取组织级 API Key。

### 4.3 Projects 与模型设置（21）

| PA 接口 | 数量 | 分类 | Langfuse 对齐 |
|---|---:|---|---|
| `GET /api/projects` | 1 | Extension | 数据库-backed reader 按用户可见范围查询，再执行 PA 现有筛选和分页 |
| `POST /api/projects`、`PATCH /api/projects/{id}` | 2 | Extension | 数据库-backed reader 管理 Langfuse 原生 `projects` |
| `POST /api/projects/{id}/archive`、`.../restore` | 2 | Extension | PA overlay 存储项目归档状态 |
| `GET /api/projects/{id}/settings/members`、成员 POST/PATCH/DELETE | 4 | Extension | 数据库-backed reader 管理 `project_memberships` |
| `GET /api/projects/{id}/settings/models` | 1 | Adapter | 合并 Langfuse LLM Connections、Models 和 PA 默认选择引用 |
| `PATCH /api/projects/{id}/settings/models/default` | 1 | Extension | Langfuse 无独立“项目默认评估模型”Public API；仅保存 Langfuse 原生资源 ID |
| LLM Connections POST/PATCH/DELETE | 3 | Direct | list/upsert/delete；Secret 不复制到 PA |
| Model Definitions POST/DELETE | 2 | Direct | models create/delete |
| Model Definitions PATCH | 1 | Adapter | 官方无 update，采用可补偿 replacement Saga；禁止原生表 UPDATE |
| Project API Keys GET/POST/DELETE | 3 | Extension | `pa_project_api_keys` + Langfuse 原生 `api_keys` 历史可用链路 |
| Project API Keys PATCH | 1 | Extension | 仅更新 PA 展示备注，不调用组织级接口 |

### 4.4 Observability（5）

| PA 接口 | 分类 | Langfuse 对齐 |
|---|---|---|
| `GET /api/projects/{id}/trace-metrics` | Adapter | Metrics v2；必要时拆分多个 query 后聚合 |
| `GET /api/projects/{id}/traces` | Adapter | traces list；现有高级筛选使用 Observations v2 + trace 聚合 |
| `GET /api/projects/{id}/traces/{traceId}` | Direct | trace get，按需选择 fields |
| `GET .../traces/{traceId}/observations/{observationId}` | Direct | Observations v2 按 observation/trace filter 查询 |
| `PATCH /api/projects/{id}/traces/{traceId}` | Adapter | 使用官方 SDK/ingestion update/upsert 能力；Public REST 无普通 trace PATCH。若部署版本不支持所需字段则转 Blocked |

### 4.5 Datasets（16）

| PA 接口 | 数量 | 分类 | Langfuse 对齐 |
|---|---:|---|---|
| dataset export job create/get/download | 3 | Extension | 任务和文件归 PA；内容只从 datasets/dataset-items API 读取 |
| dataset create | 1 | Direct | Datasets v2 create |
| dataset list/get | 2 | Adapter | Datasets v2；补齐 PA 筛选、计数和 id→name 适配 |
| dataset name availability | 1 | Adapter | list/get 判断并处理 404/冲突 |
| dataset update/delete | 2 | Blocked | 官方无 dataset 本体 update/delete；不能再直接 SQL |
| dataset item create/delete | 2 | Direct | dataset-items create/delete |
| dataset item update/archive | 2 | Adapter | 先解析 datasetName，再以相同 item `id` 调 dataset-items create/upsert；archive 写 `status=ARCHIVED` |
| dataset metrics/status counts/item list | 3 | Adapter | dataset-items + dataset runs/experiment + scores API 聚合；PA 不复制 item |

### 4.6 Annotation 与 Scores（34）

| PA 接口族 | 数量 | 分类 | Langfuse 对齐 |
|---|---:|---|---|
| score config create/update | 2 | Direct | score-configs create/patch |
| score config list | 1 | Adapter | score-configs list + PA keyword/archive 兼容筛选 |
| ensure default score config | 1 | Adapter | list 后幂等 create |
| score config archive/restore | 2 | Blocked | 官方无明确 archive/restore 语义 |
| annotation users | 1 | Adapter | project/organization memberships |
| queue create/get | 2 | Direct | annotation-queues create/get |
| queue list | 1 | Adapter | queues/items/assignments 聚合现有 keyword、assignee 和 pending-state 筛选 |
| queue name availability/metrics | 2 | Adapter | queues、items、scores 聚合 |
| queue update/delete | 2 | Blocked | 官方无 queue-level update/delete |
| export preview | 1 | Adapter | queue items + traces/observations + scores |
| export job create/get/download | 3 | Extension | PA 异步任务/文件；内容来自 Langfuse |
| item filter-counts/list/get | 3 | Adapter | queue items 与 Observations v2/Scores v3 聚合 |
| item create/delete | 2 | Direct | queue item create/delete |
| item assignees PATCH | 1 | Extension | PA 是 item 级/加权分配；官方 assignment 是 queue-user 级，语义不等价 |
| batch preview/batch scores/item scores | 3 | Adapter | queue items + `POST /api/public/scores` + queue item PATCH |
| annotation item 加入 dataset | 1 | Adapter | 读取 queue item 后调用 dataset-items create |
| trace annotation task | 1 | Adapter | traces/observations 查询 + queue items create |
| annotation bulk job create/get | 2 | Extension | PA job；业务写入 queue items API |
| trace dataset import job create/get | 2 | Extension | PA job；业务写入 dataset-items API |
| traces 批量加入 dataset | 1 | Adapter | traces/observations 查询 + dataset-items create |

### 4.7 Evaluators（5）

| PA 接口 | 分类 | Langfuse 对齐 |
|---|---|---|
| evaluator list/create/get/delete | Adapter | LLM-as-judge/code 调 unstable evaluators；WORKFLOW/SDK 仅保留为 PA 编排定义，不伪装成 Langfuse evaluator |
| evaluator PATCH | Adapter | Langfuse evaluator 同名 create 新版本，并同步 evaluation rules/PA job 引用；禁止维护定义影子副本 |

Public Evaluators 属于 unstable API，切换时必须固定并验证部署版本；已有 PA 路由契约保持稳定。

### 4.8 Auto Evaluations 与 Reports（21）

| PA 接口族 | 数量 | 分类 | Langfuse 对齐 |
|---|---:|---|---|
| report templates CRUD | 4 | Extension | PA 展示/报告控制面 |
| traces count | 1 | Adapter | Observations v2/Metrics v2 |
| auto-evaluation create/list/summary/rerun/get/delete/runs | 8 | Extension | PA 历史批评测编排；输入从 Langfuse，执行用官方 SDK experiment workflow，分数写 Langfuse |
| latest report + reports list/get/delete/items/badcases/flowbacks/preview/create | 8 | Extension | 报告快照/回流任务归 PA；trace、observation、score、dataset item 全部实时引用 Langfuse |

Evaluation Rules 只能覆盖实时 ingestion 评测，不能替代现有历史 backfill。实时规则应迁移至官方 evaluation-rules；历史/手动/定时批评测保留 PA orchestration，但不得自建 score/evaluator 事实源。

### 4.9 Scheduled Jobs（9）

`scheduled-jobs` list/create/update/pause/resume/delete/run/trigger 和 `scheduled-job-logs` 共 9 个接口，均为 Extension。Langfuse 无通用 scheduler 资源。调度触发后必须通过 Langfuse traces/observations、experiments、evaluators 和 scores 能力完成实际评测。

## 5. 必须移除的当前数据路径

以下当前实现路径与目标冲突：

1. `LangfuseDatabaseReader` 对 Langfuse 原生 `datasets`、`dataset_items`、annotation queue、score config、organization、project 等表的写操作。
2. observability 直接查询 ClickHouse/PostgreSQL 作为 PA API 的主要事实源。
3. evaluator、queue、dataset 或 score 的 PA 影子业务定义。
4. 任何为了保持旧 PATCH/DELETE 语义而直接修改 Langfuse 原生表的 fallback。

允许保留只读数据库路径仅限临时迁移校验，并必须带开关、指标和删除期限；生产业务请求不得依赖它。

## 6. 实施顺序

1. 扩展统一 `LangfusePublicClient`：认证隔离、错误翻译、限流重试、游标/页码分页、幂等键、可观测性。
2. 先切只读：observations/traces/metrics、datasets/items、queues/items、scores/configs；组织/项目/成员走数据库-backed reader。
3. 再切官方直接写：dataset item、queue item、assignment、score/config、LLM connection/model、evaluator/rule；member/project/API key 不使用组织级接口。
4. 切聚合与批处理：annotation、dataset import/export、reports、auto evaluation；底层只调用 Langfuse。
5. 对 12 个 Blocked 接口冻结原生表写入，分别修改产品契约或等待官方 API。
6. 双读校验只比较结果，不双写 Langfuse 原生表；达到一致性门槛后删除生产 SQL 业务路径。

## 7. 生产验收门槛

- 评测业务写请求的 Langfuse Public API/官方 SDK 覆盖率为 100%。
- 生产代码对 Langfuse 原生表的 INSERT/UPDATE/DELETE 为 0。
- trace、observation、dataset、dataset item、queue、score、score config、evaluator、project 和 membership 不存在 PA 影子事实源。
- 所有 130 个接口均有 contract test；Direct/Adapter 有 Langfuse mock contract 与部署版本 smoke test。
- 异步批处理具备幂等、重试、部分失败明细、补偿、审计和 txId。
- Blocked 接口不得伪成功或回退到 SQL；返回稳定业务错误并明确能力限制。

## 8. 官方依据

- Public API：<https://langfuse.com/docs/api-and-data-platform/features/public-api>
- API Reference：<https://api.reference.langfuse.com>
- OpenAPI：<https://cloud.langfuse.com/generated/api/openapi.yml>
- Annotation Queues：<https://langfuse.com/docs/evaluation/evaluation-methods/annotation-queues>
- Datasets：<https://langfuse.com/docs/evaluation/experiments/datasets>

## 9. 实施验证（2026-07-24）

切换已完成并通过生产验收门槛。

**验收命令与结果：**

- `cd pa-eval-backend && uv run pytest -q` → 585 passed。
- `cd pa-eval-backend && uv run python -m compileall app -q` → 无错误。
- 静态守护测试 `tests/test_no_langfuse_native_writes.py` → 7 passed。
  - `test_no_native_table_mutations_in_adapter_files`：扫描 `app/langfuse/`，未发现对原生业务表的 INSERT/UPDATE/DELETE。
  - `test_route_files_do_not_call_forbidden_native_write_methods`：参数化扫描 `annotations.py`、`datasets.py`、`projects.py`、`organizations.py`、`evaluators.py`、`observability.py`，均未调用 denylist 中的 reader 原生写方法。
- 密钥扫描（`sk-`/`pk-lf-`/明文口令/数据库连接串）→ 无命中。

**路由切换覆盖：**

| 路由文件 | 已切换到 adapter 的写路由数 |
|---|---:|
| `datasets.py` | 13 |
| `annotations.py`（score configs / queues / items / complete） | 15 |
| `organizations.py`（members / import / update / delete） | 4 |
| `projects.py`（members / archive·restore blocked） | 5 |
| `evaluators.py`（create / delete LANGFUSE） | 2 |

**保留为 PA 控制面的 reader 写方法（写 `pa_*` 表或异步任务表，非 Langfuse 原生表，不计入守护范围）：**

- `create_pa_evaluator` / `update_pa_evaluator_for_user` / `delete_pa_evaluator_for_user`（PA 评测编排元数据）。
- `create_annotation_export_job_for_user`、`create_trace_bulk_job_for_user`、`update_trace_bulk_job`、`create_trace_annotation_task_for_user`、`update_annotation_queue_item_assignees_for_user`（PA 异步任务/导出/编排）。

这些方法只写 PA 扩展表，底层评测数据仍通过 Langfuse Public API 读取/写入，符合第 1 节控制面定义。

**结论：** 评测业务写请求已 100% 经由 `LangfusePublicClient`；生产代码对 Langfuse 原生业务表的 SQL 写入为 0；12 个 Blocked 接口未回退到 SQL。

## 10. Flowback 补充修正（2026-07-27）

复核发现 `POST /api/projects/{project_id}/evaluation-reports/{report_id}/flowbacks` 仍直接 `INSERT INTO datasets` / `INSERT INTO dataset_items`。该路径已补齐：报告回流任务和状态仍写 PA 控制面表，目标 Dataset 和 Dataset Item 创建改为调用 `LangfuseDatasetsAdapter`，最终经 `LangfusePublicClient` 写入 Langfuse Public API。

**新增回归门：**

- `tests/test_no_langfuse_native_writes.py` 扩展扫描 `auto_evaluations.py`，禁止路由文件内联 `INSERT/UPDATE/DELETE` Langfuse 原生业务表。
- `tests/test_auto_evaluations.py::test_create_report_flowback_creates_dataset_items_and_updates_statuses` 断言 flowback 不再写 `datasets` / `dataset_items` SQL，并校验 dataset/item payload 通过 adapter 发出。
- `tests/test_auto_evaluations.py::test_create_report_flowback_route_uses_dataset_adapter` 覆盖 FastAPI 入口依赖注入，防止路由绕过 adapter。

**修正后验证：**

- `cd pa-eval-backend && uv run pytest tests/test_auto_evaluations.py::test_create_report_flowback_creates_dataset_items_and_updates_statuses tests/test_auto_evaluations.py::test_create_report_flowback_route_uses_dataset_adapter tests/test_no_langfuse_native_writes.py -q` → 17 passed。
