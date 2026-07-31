# Langfuse API Research

## 全接口 Public API 对齐（2026-07-23）

- 已审计 PA Backend 129 个业务路由及 1 个 health 路由，共 130 个接口。
- 分类结果：29 Direct、38 Adapter、51 Extension、12 Blocked。
- 新查询统一优先 Observations v2、Scores v3、Metrics v2。
- 可作为唯一业务事实源的官方资源：traces、observations、datasets、dataset items/runs、annotation queues/items/assignments、scores/configs、evaluators/rules、experiments、projects/memberships/API keys、LLM connections、models。
- Dataset Item create 明确按项目级 `id` upsert并支持 status，因此 item update/archive 可通过相同 ID 的官方 upsert 对齐。
- Public API 缺口：organization 本体 CRUD/多组织列表、dataset update/delete、annotation queue update/delete、score config archive/restore、project archive/restore、普通 trace PATCH、evaluator/model/API key 原位 update。
- Evaluation Rules 仅支持实时 ingestion，不支持历史 backfill；历史批评测使用 PA orchestration + Langfuse SDK experiment workflow。
- 详细路由矩阵见 `docs/api/2026-07-23-langfuse-public-api-alignment.md`。
- 结论：生产业务禁止直接 SQL 写 Langfuse 原生表；无官方等价写能力的接口必须 blocked 或修改产品语义。

## PA 模型设置原生资源切换（2026-07-23）

### LLM Connections

- 官方文档：`https://langfuse.com/docs/administration/llm-connection`
- API：`GET /api/public/llm-connections`、`PUT /api/public/llm-connections`、`DELETE /api/public/llm-connections/{id}`。
- 认证：项目 Public/Secret Key Basic Auth。
- GET 只返回 `displaySecretKey` 等安全字段，明确不返回 `secretKey`。
- PUT 按 `(projectId, provider)` upsert，且请求必须包含真实 `secretKey`。
- 推荐路径：查询和写入使用 direct Langfuse public API；仅为空 Secret 更新执行参数绑定的原生表只读与兼容解密，禁止直接写原生表。

### Models

- 官方文档：`https://langfuse.com/docs/observability/features/token-and-cost-tracking`
- API：`GET /api/public/models`、`POST /api/public/models`、`GET /api/public/models/{modelId}`、`DELETE /api/public/models/{modelId}`。
- 认证：项目 Public/Secret Key Basic Auth。
- 响应包含 `id`、`modelName`、`matchPattern`、价格、`unit`、`tokenizerId`、`isLangfuseManaged`。
- 没有模型更新 API；同项目 `modelName` 唯一。
- 推荐路径：direct Langfuse public API + backend adapter replacement Saga。

### 验证

```bash
uv run pytest tests/test_langfuse_public_client.py tests/test_native_model_settings.py -q
uv run pytest tests/test_project_model_settings.py -q
```

## 切换完成验证（2026-07-24）

- 评测业务写路由 100% 经由 `LangfusePublicClient`；路由文件不再调用 denylist 中的 reader 原生写方法。
- 守护测试 `tests/test_no_langfuse_native_writes.py`（7 passed）作为回归门：新增原生表直写或禁用 reader 写方法调用将立即失败。
- 验收命令：`cd pa-eval-backend && uv run pytest -q`（585 passed）、`uv run python -m compileall app -q`（无错误）。
- 保留的 reader 写方法仅作用于 `pa_*` 扩展表与异步任务表（PA 评测编排、导出、批处理），不写 Langfuse 原生业务表。
- 证据汇总见 `docs/api/2026-07-23-langfuse-public-api-alignment.md` 第 9 节。

## Flowback 漏洞修正（2026-07-27）

- 复核发现报告回流创建数据集/数据项路径仍直接写 `datasets`、`dataset_items`。
- 已将 `POST /api/projects/{project_id}/evaluation-reports/{report_id}/flowbacks` 的 dataset / dataset item 写入改为 `LangfuseDatasetsAdapter`，由 `LangfusePublicClient` 调 Langfuse Public API。
- PA 仍保留 `pa_job_executions`、`pa_evaluation_report_items`、`pa_evaluation_reports` 控制面写入，用于回流任务审计、状态和计数。
- 守护测试扩展扫描 `auto_evaluations.py`，防止后续路由内联 SQL 写 Langfuse 原生业务表。
- 聚焦验证：`uv run pytest tests/test_auto_evaluations.py::test_create_report_flowback_creates_dataset_items_and_updates_statuses tests/test_auto_evaluations.py::test_create_report_flowback_route_uses_dataset_adapter tests/test_no_langfuse_native_writes.py -q` → 17 passed。

## Public API 缺口的 PA Overlay 闭环（2026-07-28）

- 复核页面端到端动作时，发现 dataset update/delete、annotation queue update/delete、project archive/restore 仍返回 501，导致页面功能无法闭环。
- Langfuse Public API 能力边界未变化：dataset 本体只支持 list/get/create，annotation queue 本体只支持 list/get/create，project 只支持 list/create/update/delete，没有 PA 产品语义中的 edit/delete/archive/restore 等价接口。
- 实现路径调整为 backend extension：不写 Langfuse 原生表，不修改 Langfuse schema；PA 在 `pa_resource_extensions` 存储 `RESOURCE_DISPLAY_OVERRIDE`、`RESOURCE_SOFT_DELETE`、`PROJECT_ARCHIVE_STATE`。
- Dataset/Annotation Queue 的 list/get/metrics/item 写入口会合并或检查 PA overlay；软删除后 PA 视图隐藏并返回 404，底层 Langfuse 原生对象保留。Dataset item upsert 仍使用原生 dataset name，避免覆盖显示名破坏 Public API 调用。
- Project archive/restore 存储 PA 归档状态并在 administration adapter 列表/返回值中合并为 `status=archived|active`。
- 路径分类：上述 6 个接口从 blocked 调整为 backend extension；底层资源写入仍以 Langfuse Public API 为事实源，PA overlay 只表达 PA 产品层状态。
- 聚焦验证：`uv run pytest tests/test_langfuse_datasets_adapter.py tests/test_langfuse_annotations_adapter.py tests/test_langfuse_administration_adapter.py tests/test_datasets.py tests/test_annotations.py tests/test_projects.py` → 170 passed。

## 接口与表清单（2026-07-28）

- 已按当前源码静态扫描整理 PA Backend 129 个接口，以及运行时代码引用的 PA 表、Langfuse PostgreSQL 原生表、Langfuse ClickHouse 表。
- 清单区分 Public API、Adapter、PA 表、DB Read、DB Write、ClickHouse 六类数据路径。
- 当前仍需清理的主要对齐点：项目 create/update、组织 create/update、trace patch 仍存在 Langfuse PG 原生表写路径；score 写入仍有 ClickHouse fallback。
- 详细清单见 `docs/api/2026-07-28-api-table-inventory.md`。

## 场景实验模块对齐（2026-07-30）

- Langfuse 场景本身没有独立 Public API 资源；PA 场景定义属于产品层运行配置，已复用现有 `pa_resource_extensions` 存储 `SCENE_CONFIG`，不新增表、不改 Langfuse 原生 schema。
- Langfuse experiment 官方读取入口已补齐到 `LangfusePublicClient`：`GET /api/public/experiments`、`GET /api/public/experiment-items`。
- Langfuse 官方创建实验结果的推荐路径是 Experiment runner SDK，非 SDK 场景可通过 OTEL traces + experiment attributes 写入；本次后端页面闭环先生成 PA 实验 group/report/baseline 快照，保存在 `pa_resource_extensions` 的 `EXPERIMENT_*` 扩展类型中，不写 `dataset_runs` / `dataset_run_items` 等原生表。
- 场景实验创建会校验项目、数据集、场景启用状态、Webhook 和评估器绑定关系；报告中保留 `langfuseExperimentName`，作为后续接入真实 Langfuse SDK/OTEL experiment run 的稳定桥接字段。
- Webhook 表单提交的明文 `credential` 不进入扩展表 payload，仅保留 `maskedCredential` 等非敏感展示字段。
