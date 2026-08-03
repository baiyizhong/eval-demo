# PA Eval 接口与表清单

日期：2026-07-28

## 1. 统计口径

本清单基于 `pa-eval-backend/app/**/*.py` 中的 `APIRouter` 与 `@router.get/post/patch/delete/put` 静态扫描生成，并结合 `LangfusePublicClient`、adapter、`LangfuseDatabaseReader`、ClickHouse reader/writer 和 Alembic 迁移做人工归类。

当前静态定义接口共 **129 个**，其中包含 `/health` 1 个；业务接口 **128 个**。按模块统计：

| 模块 | 文件 | 接口数 |
|---|---|---:|
| Admin Users | `app/admin_users.py` | 3 |
| Annotations / Scores | `app/annotations.py` | 34 |
| Audit / Admin Overview | `app/audit.py` | 2 |
| Auth | `app/auth.py` | 2 |
| Auto Evaluations / Reports | `app/auto_evaluations.py` | 21 |
| Datasets | `app/datasets.py` | 16 |
| Evaluators | `app/evaluators.py` | 5 |
| Health | `app/main.py` | 1 |
| Observability | `app/observability.py` | 5 |
| Organizations | `app/organizations.py` | 10 |
| Projects | `app/projects.py` | 21 |
| Scheduled Jobs | `app/scheduled_jobs.py` | 9 |
| User Session | `app/users.py` | 1 |

访问路径说明：

| 路径 | 含义 |
|---|---|
| Public API | 经项目级 `LangfusePublicClient` 调 Langfuse Public API，或经 `LangfuseAdminClient` 调 Langfuse score API；当前不使用 Langfuse 组织级接口。 |
| Adapter | 后端聚合多个 Langfuse API、补充分页/筛选/转换，或做可补偿流程。 |
| PA 表 | 写入/读取 PA 自定义 `pa_*` 控制面表。 |
| DB Read | 直接读取 Langfuse PostgreSQL 原生表，用于鉴权、展示聚合或补足 Public API 暂缺字段。 |
| DB Write | 直接写 Langfuse PostgreSQL 原生表。仅在 Langfuse 无可用项目级 Public API 或本项目明确采用历史可用链路时保留。 |
| ClickHouse | 直接读/写 Langfuse ClickHouse `traces`、`observations`、`scores`。 |

> 注意：运行 `from app.main import app` 时当前只枚举到 FastAPI 文档路由和 `/health`，未能拿到已 include 的业务路由；本清单以源码静态路由为准。

## 2. 接口清单

### 2.1 Auth / User / Admin

| 方法 | 接口 | Handler | 数据路径 | 主要表 / 资源 |
|---|---|---|---|---|
| GET | `/health` | `health` | 本地 | 无 |
| GET | `/api/auth/github/login` | `github_login` | 外部 GitHub + 本地配置 | 无业务表 |
| GET | `/api/auth/github/callback` | `github_callback` | GitHub + DB Read | `users` |
| GET | `/api/user/session` | `get_user_session` | DB Read | `users`、`organization_memberships`、`project_memberships`、`organizations`、`projects` |
| GET | `/api/admin/users` | `list_admin_users` | DB Read | `users` |
| GET | `/api/admin/users/{user_id}/role-bindings` | `get_admin_user_role_bindings` | DB Read | `organization_memberships`、`project_memberships`、`organizations`、`projects` |
| PATCH | `/api/admin/users/{user_id}/admin` | `patch_admin_user_admin` | DB Write | `users` |
| GET | `/api/admin/overview` | `get_admin_overview` | DB Read | `organizations`、`projects`、`users`、`pa_audit_logs` |
| GET | `/api/audit-logs` | `list_audit_logs` | PA 表 | `pa_audit_logs` |

### 2.2 Organizations

| 方法 | 接口 | Handler | 数据路径 | 主要表 / 资源 |
|---|---|---|---|---|
| GET | `/api/organizations` | `list_organizations` | DB Read | `organizations`、`projects`、`organization_memberships` |
| GET | `/api/organizations/member-email-settings` | `get_member_email_settings` | 本地配置 | 无 |
| POST | `/api/organizations` | `create_organization` | DB Write | `users`、`organizations`、`organization_memberships`、`projects`、`project_memberships` |
| GET | `/api/organizations/{organization_id}` | `get_organization` | DB Read | `organizations`、`projects` |
| PATCH | `/api/organizations/{organization_id}` | `update_organization` | DB Write | `organizations` |
| GET | `/api/organizations/{organization_id}/members` | `list_organization_members` | DB Read | `organization_memberships`、`users` |
| POST | `/api/organizations/{organization_id}/members` | `create_organization_member` | DB Write | `users`、`organization_memberships`、`membership_invitations` |
| POST | `/api/organizations/{organization_id}/members/import` | `import_organization_members` | DB Write | 批量写 `users`、`organization_memberships`、`membership_invitations` |
| PATCH | `/api/organizations/{organization_id}/members/{member_id}` | `update_organization_member` | DB Write | `organization_memberships` |
| DELETE | `/api/organizations/{organization_id}/members/{member_id}` | `delete_organization_member` | DB Write | `organization_memberships` |

### 2.3 Projects / Members / Models / API Keys

| 方法 | 接口 | Handler | 数据路径 | 主要表 / 资源 |
|---|---|---|---|---|
| GET | `/api/projects` | `list_projects` | DB Read + PA overlay | `projects`、`organizations`、`project_memberships`、`pa_resource_extensions` |
| POST | `/api/projects` | `create_project` | DB Write | `projects`、`project_memberships` |
| PATCH | `/api/projects/{project_id}` | `update_project` | DB Write | `projects` |
| POST | `/api/projects/{project_id}/archive` | `archive_project` | PA 表 | `pa_resource_extensions` (`PROJECT_ARCHIVE_STATE`) |
| POST | `/api/projects/{project_id}/restore` | `restore_project` | PA 表 | `pa_resource_extensions` (`PROJECT_ARCHIVE_STATE`) |
| GET | `/api/projects/{project_id}/settings/members` | `get_project_members` | DB Read | `project_memberships`、`organization_memberships`、`users` |
| POST | `/api/projects/{project_id}/settings/members` | `create_project_member` | DB Write | `users`、`organization_memberships`、`project_memberships`、`membership_invitations` |
| PATCH | `/api/projects/{project_id}/settings/members/{member_id}` | `update_project_member` | DB Write | `project_memberships` |
| DELETE | `/api/projects/{project_id}/settings/members/{member_id}` | `delete_project_member` | DB Write | `project_memberships` |
| GET | `/api/projects/{project_id}/settings/models` | `get_project_model_settings` | Adapter + PA 表 + DB Read | `/api/public/llm-connections`、`/api/public/models`、`pa_resource_extensions`、`llm_api_keys` |
| PATCH | `/api/projects/{project_id}/settings/models/default` | `update_project_default_model` | PA 表 + Public API 读 | `pa_resource_extensions` (`DEFAULT_EVALUATION_MODEL`)、`/api/public/llm-connections` |
| POST | `/api/projects/{project_id}/settings/models/llm-connections` | `create_project_llm_connection` | Public API + PA 表 | `/api/public/llm-connections`、`pa_job_executions` |
| PATCH | `/api/projects/{project_id}/settings/models/llm-connections/{connection_id}` | `update_project_llm_connection` | Adapter + DB Read + PA 表 | `/api/public/llm-connections`、`llm_api_keys` 只读解密、`pa_job_executions` |
| DELETE | `/api/projects/{project_id}/settings/models/llm-connections/{connection_id}` | `delete_project_llm_connection` | Adapter + DB Read + PA 表 | `/api/public/llm-connections`、`llm_api_keys` 只读解密、`pa_job_executions` |
| POST | `/api/projects/{project_id}/settings/models/definitions` | `create_project_model_definition` | Public API + PA 表 | `/api/public/models`、`pa_job_executions` |
| PATCH | `/api/projects/{project_id}/settings/models/definitions/{model_id}` | `update_project_model_definition` | Adapter + PA 表 | `/api/public/models` create/delete replacement、`pa_job_executions` |
| DELETE | `/api/projects/{project_id}/settings/models/definitions/{model_id}` | `delete_project_model_definition` | Public API + PA 表 | `/api/public/models`、`pa_job_executions` |
| GET | `/api/projects/{project_id}/settings/api-keys` | `list_project_api_keys` | PA 表 | `pa_project_api_keys` |
| POST | `/api/projects/{project_id}/settings/api-keys` | `create_project_api_key` | PA 表 + DB Write | `pa_project_api_keys`、Langfuse 原生 `api_keys` |
| PATCH | `/api/projects/{project_id}/settings/api-keys/{key_id}` | `update_project_api_key` | PA 表 | `pa_project_api_keys` |
| DELETE | `/api/projects/{project_id}/settings/api-keys/{key_id}` | PA 表 + DB Write | `pa_project_api_keys`、Langfuse 原生 `api_keys` |

### 2.4 Observability

| 方法 | 接口 | Handler | 数据路径 | 主要表 / 资源 |
|---|---|---|---|---|
| GET | `/api/projects/{project_id}/trace-metrics` | `get_trace_metrics` | Adapter | `/api/public/v2/metrics`，必要时 scores/traces 聚合 |
| GET | `/api/projects/{project_id}/traces` | `list_traces` | Adapter | `/api/public/traces`、`/api/public/v2/observations`、`/api/public/v3/scores` |
| GET | `/api/projects/{project_id}/traces/{trace_id}` | `get_trace` | Public API | `/api/public/traces/{traceId}` |
| GET | `/api/projects/{project_id}/traces/{trace_id}/observations/{observation_id}` | `get_trace_observation` | Public API | `/api/public/v2/observations` |
| PATCH | `/api/projects/{project_id}/traces/{trace_id}` | `patch_trace` | ClickHouse Read + DB Write | `traces`。当前仍通过 `patch_trace_for_user` 更新 PG `traces`，未完全新链路化。 |

### 2.5 Datasets

| 方法 | 接口 | Handler | 数据路径 | 主要表 / 资源 |
|---|---|---|---|---|
| POST | `/api/projects/{project_id}/datasets/{dataset_id}/export-jobs` | `create_dataset_export_job` | PA 表 | `pa_job_executions` (`DATASET_EXPORT`) |
| GET | `/api/projects/{project_id}/datasets/{dataset_id}/export-jobs/{job_id}` | `get_dataset_export_job` | PA 表 | `pa_job_executions` |
| GET | `/api/projects/{project_id}/datasets/{dataset_id}/export-jobs/{job_id}/download` | `download_dataset_export_job` | PA 文件 + PA 表 | `pa_job_executions` |
| GET | `/api/projects/{project_id}/datasets` | `list_datasets` | Adapter + PA overlay | `/api/public/v2/datasets`、`/api/public/dataset-items`、`pa_resource_extensions` |
| POST | `/api/projects/{project_id}/datasets` | `create_dataset` | Public API | `/api/public/v2/datasets` |
| GET | `/api/projects/{project_id}/datasets/name-availability` | `get_dataset_name_availability` | Adapter | `/api/public/v2/datasets` |
| GET | `/api/projects/{project_id}/datasets/{dataset_id}` | `get_dataset` | Adapter + PA overlay | `/api/public/v2/datasets`、`pa_resource_extensions` |
| PATCH | `/api/projects/{project_id}/datasets/{dataset_id}` | `update_dataset` | PA 表 | `pa_resource_extensions` (`RESOURCE_DISPLAY_OVERRIDE`) |
| DELETE | `/api/projects/{project_id}/datasets/{dataset_id}` | `delete_dataset` | PA 表 | `pa_resource_extensions` (`RESOURCE_SOFT_DELETE`) |
| GET | `/api/projects/{project_id}/datasets/{dataset_id}/metrics` | `get_dataset_metrics` | Adapter | `/api/public/dataset-items` |
| GET | `/api/projects/{project_id}/datasets/{dataset_id}/items/status-counts` | `count_dataset_item_statuses` | Adapter | `/api/public/dataset-items` |
| GET | `/api/projects/{project_id}/datasets/{dataset_id}/items` | `list_dataset_items` | Adapter | `/api/public/dataset-items` |
| POST | `/api/projects/{project_id}/datasets/{dataset_id}/items` | `create_dataset_item` | Public API | `/api/public/dataset-items` |
| PATCH | `/api/projects/{project_id}/datasets/{dataset_id}/items/{item_id}` | `update_dataset_item` | Adapter | `/api/public/dataset-items` upsert |
| POST | `/api/projects/{project_id}/datasets/{dataset_id}/items/{item_id}/archive` | `archive_dataset_item` | Adapter | `/api/public/dataset-items` upsert `status=ARCHIVED` |
| DELETE | `/api/projects/{project_id}/datasets/{dataset_id}/items/{item_id}` | `delete_dataset_item` | Public API | `/api/public/dataset-items/{itemId}` |

### 2.6 Annotation / Score Configs / Scores

| 方法 | 接口族 | 数量 | 数据路径 | 主要表 / 资源 |
|---|---|---:|---|---|
| GET/POST/PATCH/POST/POST | `/score-configs*` | 5 | Public API / Adapter | `/api/public/score-configs`；archive/restore 通过 `isArchived` patch |
| GET | `/annotation-users` | 1 | DB Read | `project_memberships`、`organization_memberships`、`users` |
| GET/POST/GET/GET/PATCH/DELETE/GET | `/annotation-queues*` | 7 | Public API / Adapter + PA overlay | `/api/public/annotation-queues`、`/items`、`/assignments`、`pa_resource_extensions` |
| POST/GET/GET | `/annotation-queues/{queue_id}/export-*` | 3 | PA 表 + Langfuse 读 | `pa_job_executions`、queue items、traces/observations/scores |
| GET/GET/POST/GET/DELETE/PATCH | `/annotation-queues/{queue_id}/items*` | 6 | Public API / Adapter / PA 表 | queue items API、`pa_annotation_queue_item_assignments`、`pa_resource_extensions` |
| POST/POST/POST | `/batch-preview`、`/batch-scores`、`/items/{item_id}/scores` | 3 | Adapter + Public API + ClickHouse fallback | `/api/public/scores`、`scores` ClickHouse writer、queue item PATCH |
| POST | `/items/{item_id}/dataset-items` | 1 | Adapter | queue item read + `/api/public/dataset-items` |
| POST | `/traces/annotation-task` | 1 | Adapter | traces/observations 查询 + score config/queue/item Public API |
| POST/GET | `/traces/annotation-task-jobs*` | 2 | PA 表 + Adapter | `pa_job_executions` (`TRACE_ANNOTATION_IMPORT`)、Langfuse trace/queue APIs |
| POST/GET | `/traces/dataset-import-jobs*` | 2 | PA 表 + Adapter | `pa_job_executions` (`TRACE_DATASET_IMPORT`)、Langfuse trace/dataset APIs |
| POST | `/traces/dataset-items` | 1 | Adapter | traces/observations 查询 + `/api/public/dataset-items` |

### 2.7 Evaluators

| 方法 | 接口 | Handler | 数据路径 | 主要表 / 资源 |
|---|---|---|---|---|
| GET | `/api/evaluators` | `list_evaluators` | DB Read + PA 表 | `eval_templates`、`pa_evaluators`、`projects` |
| POST | `/api/evaluators` | `create_evaluator` | Public API 或 PA 表 | Langfuse 类型走 `/api/public/unstable/evaluators`；WORKFLOW/SDK 写 `pa_evaluators` |
| GET | `/api/evaluators/{evaluator_id}` | `get_evaluator` | DB Read + PA 表 | `eval_templates`、`pa_evaluators` |
| PATCH | `/api/evaluators/{evaluator_id}` | `update_evaluator` | PA 表 | 只允许 PA evaluator，写 `pa_evaluators`；Langfuse evaluator 返回业务错误 |
| DELETE | `/api/evaluators/{evaluator_id}` | `delete_evaluator` | Public API 或 PA 表 | Langfuse 类型走 `/api/public/unstable/evaluators/{id}`；PA 类型删 `pa_evaluators` |

### 2.8 Auto Evaluations / Reports

| 方法 | 接口族 | 数量 | 数据路径 | 主要表 / 资源 |
|---|---|---:|---|---|
| GET/POST/PATCH/DELETE | `/report-templates*` | 4 | PA 表 | `pa_evaluation_report_templates` |
| POST | `/traces/count` | 1 | ClickHouse / PG Read | ClickHouse `traces`、`observations`；PG fallback `traces`、`observations` |
| POST/GET/GET/POST/GET/DELETE/GET/GET | `/auto-evaluations*` | 8 | PA 表 + Langfuse API/ClickHouse | `pa_evaluation_jobs`、`pa_job_executions`、`pa_evaluation_reports`、`pa_evaluation_report_items`、datasets/items、traces/observations、scores |
| GET/GET/DELETE/GET/GET/GET/POST/POST | `/evaluation-reports*` | 8 | PA 表 + Adapter | `pa_evaluation_reports`、`pa_evaluation_report_items`、`pa_job_executions`、dataset item Public API、trace/score reads |

### 2.9 Scheduled Jobs

| 方法 | 接口族 | 数量 | 数据路径 | 主要表 / 资源 |
|---|---|---:|---|---|
| GET/POST/PATCH/POST/POST/DELETE/POST/POST | `/scheduled-jobs*` | 8 | PA 表 | `pa_evaluation_jobs`、`pa_job_executions` |
| GET | `/scheduled-job-logs` | 1 | PA 表 | `pa_job_executions` |

## 3. 表清单

### 3.1 PA 现役扩展表

按 `migrations/versions/20260723_0016_contract_legacy_pa_tables.py` 的最终契约，PA 最终保留 12 张表；当前运行时代码实际直接引用其中 10 张。

| 表名 | 当前运行时使用 | 用途 | 主要接口域 |
|---|---|---|---|
| `pa_resource_extensions` | 是 | 通用资源扩展/overlay；默认模型、标注分配策略、展示覆盖、软删除、项目归档状态。 | Projects、Datasets、Annotations |
| `pa_evaluation_jobs` | 是 | 自动评测/定时评测定义合并表。 | Auto Evaluations、Scheduled Jobs |
| `pa_job_executions` | 是 | 导出、批处理、自动评测 run、定时执行、回流、原生资源同步任务。 | Datasets、Annotations、Auto Evaluations、Scheduled Jobs、Model Settings |
| `pa_evaluators` | 是 | PA-only evaluator 定义，主要是 WORKFLOW/SDK。 | Evaluators、Auto Evaluations |
| `pa_evaluation_report_templates` | 是 | 评测报告模板。 | Reports |
| `pa_evaluation_reports` | 是 | 评测报告快照。 | Auto Evaluations、Reports |
| `pa_evaluation_report_items` | 是 | 评测报告明细、badcase 标识、回流状态。 | Reports、Flowbacks |
| `pa_audit_logs` | 是 | 请求审计日志。 | Audit、Admin Overview |
| `pa_annotation_queue_item_assignments` | 是 | PA item 级标注处理人分配。 | Annotations |
| `pa_project_api_keys` | 是 | PA 展示/保存项目 API Key；创建/删除时同步写 Langfuse 原生 `api_keys`，不使用组织级 Project API Key Public API。 | Project Settings |
| `pa_project_llm_connections` | 否 | 最终契约保留/兼容表；运行时代码已不引用。 | 历史模型设置 |
| `pa_project_model_definitions` | 否 | 最终契约保留/兼容表；运行时代码已不引用。 | 历史模型设置 |

`pa_resource_extensions.extension_type` 当前枚举：

| extension_type | 用途 |
|---|---|
| `DEFAULT_EVALUATION_MODEL` | 项目默认评测模型引用。 |
| `ITEM_ASSIGNMENT_POLICY` | 标注任务 item 级分配策略和权重。 |
| `API_KEY_DISPLAY_NOTE` | API Key 展示备注 payload 类型，当前运行时代码主要仍用 `pa_project_api_keys.note`。 |
| `RESOURCE_DISPLAY_OVERRIDE` | Dataset / Annotation Queue 名称、描述、类型等 PA 展示覆盖。 |
| `RESOURCE_SOFT_DELETE` | Dataset / Annotation Queue 在 PA 视图内软删除。 |
| `PROJECT_ARCHIVE_STATE` | 项目在 PA 视图内归档/恢复。 |

`pa_job_executions.job_type` 当前枚举：`AUTO_EVALUATION`、`SCHEDULED_EVALUATION`、`DATASET_EXPORT`、`ANNOTATION_EXPORT`、`TRACE_DATASET_IMPORT`、`TRACE_ANNOTATION_IMPORT`、`REPORT_FLOWBACK`、`NATIVE_RESOURCE_SYNC`。

### 3.2 PA 已退役 / 已合并旧表

以下表在迁移历史中存在，并在 `20260723_0016` 合同迁移中被定义为 legacy/contracted；`tests/test_new_path_cutover.py` 也要求 `app/` 与 `scripts/` 运行时代码不得引用它们。

| 表名 | 合并去向 |
|---|---|
| `pa_project_model_settings` | `pa_resource_extensions` (`DEFAULT_EVALUATION_MODEL`) |
| `pa_annotation_queue_settings` | `pa_resource_extensions` (`ITEM_ASSIGNMENT_POLICY`) |
| `pa_auto_evaluation_tasks` | `pa_evaluation_jobs` |
| `pa_scheduled_jobs` | `pa_evaluation_jobs` |
| `pa_auto_evaluation_runs` | `pa_job_executions` |
| `pa_scheduled_job_execution_logs` | `pa_job_executions` |
| `pa_dataset_export_jobs` | `pa_job_executions` (`DATASET_EXPORT`) |
| `pa_annotation_export_jobs` | `pa_job_executions` (`ANNOTATION_EXPORT`) |
| `pa_trace_bulk_jobs` | `pa_job_executions` (`TRACE_DATASET_IMPORT` / `TRACE_ANNOTATION_IMPORT`) |
| `pa_evaluation_report_flowbacks` | `pa_job_executions` (`REPORT_FLOWBACK`) |
| `pa_evaluation_report_badcases` | `pa_evaluation_report_items.is_badcase` 与 `extra` |

### 3.3 Langfuse PostgreSQL 原生表

当前 `app/` 代码中通过 SQL 字符串读取或写入过的 Langfuse PG 原生表如下：

| 表名 | 当前用途 | 访问类型 |
|---|---|---|
| `users` | 登录会话、成员展示、管理员开关。 | Read；`admin_users` 和组织创建路径有 Write |
| `organizations` | 组织列表/详情/统计。 | Read；组织创建/更新仍有 Write |
| `organization_memberships` | 组织成员、权限、项目可见性。 | Read；组织创建默认 owner 仍有 Write |
| `membership_invitations` | 组织/项目成员邀请兼容读取/清理。 | Read/少量 Delete 兼容路径 |
| `projects` | 项目列表/详情/权限/统计。 | Read；项目创建/更新、组织默认项目创建仍有 Write |
| `project_memberships` | 项目成员、项目可见性。 | Read；项目创建默认成员仍有 Write |
| `datasets` | 自动评测样本、兼容读。 | Read |
| `dataset_items` | 自动评测样本、报告回流重复检查/展示。 | Read |
| `dataset_runs` | 数据集 run 计数/兼容读。 | Read |
| `annotation_queues` | 标注队列兼容读、分配/导出聚合。 | Read |
| `annotation_queue_items` | 标注 item 兼容读、导出/报告聚合。 | Read |
| `annotation_queue_assignments` | queue-user assignment 兼容读。 | Read |
| `score_configs` | score config 兼容读、自动评测 score 映射。 | Read；历史迁移有更新 |
| `scores` | PG 环境下 score 兼容读/写 helper。 | Read；`langfuse_db.py` 仍有 `INSERT INTO scores` helper |
| `eval_templates` | Langfuse 原生 evaluator 读取。 | Read |
| `job_configurations` | Langfuse evaluator/job 配置兼容读取。 | Read |
| `llm_api_keys` | LLM Connection secret 空更新时只读解密。 | Read |
| `traces` | PG fallback、trace patch。 | Read；`patch_trace_for_user` 仍有 Write |
| `observations` | PG fallback、trace/annotation/report 聚合。 | Read |
| `trace_sessions` | 标注 item/trace 展示补充。 | Read |

### 3.4 Langfuse ClickHouse 表

| 表名 | 当前用途 | 访问类型 |
|---|---|---|
| `traces` | 观测列表、trace 详情、批量筛选、自动评测样本。 | Read |
| `observations` | observation 详情、latency/cost、输入输出筛选、自动评测样本。 | Read |
| `scores` | score 筛选、标注/自动评测分数查询；Public API 失败时存在 ClickHouse writer fallback。 | Read/Write |

## 4. Langfuse Public API 清单

当前 `LangfusePublicClient` 封装的 Langfuse API 能力：

| 资源 | 方法与路径 |
|---|---|
| LLM Connections | `GET/PUT /api/public/llm-connections`、`DELETE /api/public/llm-connections/{id}` |
| Models | `GET/POST /api/public/models`、`GET/DELETE /api/public/models/{id}` |
| Evaluators | `GET/POST /api/public/unstable/evaluators`、`GET/DELETE /api/public/unstable/evaluators/{id}` |
| Traces | `GET /api/public/traces`、`GET /api/public/traces/{traceId}` |
| Observations | `GET /api/public/v2/observations` |
| Metrics | `GET /api/public/v2/metrics` |
| Annotation Queues | `GET/POST /api/public/annotation-queues`、`GET /api/public/annotation-queues/{queueId}` |
| Annotation Queue Items | `GET/POST /api/public/annotation-queues/{queueId}/items`、`GET/PATCH/DELETE /api/public/annotation-queues/{queueId}/items/{itemId}` |
| Annotation Queue Assignments | `GET/POST/DELETE /api/public/annotation-queues/{queueId}/assignments` |
| Score Configs | `GET/POST /api/public/score-configs`、`GET/PATCH /api/public/score-configs/{id}` |
| Scores | `GET /api/public/v3/scores` |
| Datasets | `GET/POST /api/public/v2/datasets`、`GET /api/public/v2/datasets/{datasetName}` |
| Dataset Items | `GET/POST /api/public/dataset-items`、`GET/DELETE /api/public/dataset-items/{id}` |
| Organization / Project 管理接口 | 当前不使用 Langfuse 组织级 Public API；项目、成员和 Project API Key 管理由 `LangfuseDatabaseReader` 走现有数据库链路。 |

另外 `LangfuseAdminClient` 当前封装：`POST /api/public/scores`、`PATCH /api/public/score-configs/{id}`。

## 5. 当前未完全对齐点

这些点是从当前代码事实整理出来的后续清理清单：

| 位置 | 当前链路 | 建议目标 |
|---|---|---|
| `POST /api/projects`、`PATCH /api/projects/{project_id}` | `reader.create_project_for_user` / `update_project_for_user` 直接写 `projects`、`project_memberships`。 | 当前不能使用 Langfuse 组织级接口，保留历史可用数据库链路。 |
| `POST /api/organizations`、`PATCH /api/organizations/{organization_id}` | 直接写 `organizations`、`organization_memberships`、默认 `projects`。 | 若 Langfuse Public API 无组织本体 CRUD，需要明确 PA 产品语义；不能继续伪装成 Langfuse 原生写。 |
| `PATCH /api/projects/{project_id}/traces/{trace_id}` | `patch_trace_for_user` 直接更新 PG `traces.metadata/input/output/session/user_id/tags`。 | 改为官方 ingestion/SDK upsert 能力；若版本不支持目标字段，改为 PA overlay 或返回稳定能力限制。 |
| `app/langfuse_db.py` 残留原生写 helper | 仍可搜索到 `INSERT/UPDATE` Langfuse 原生表方法，部分不再被路由调用。 | 删除未被调用的旧 helper，并扩大守护测试扫描范围到 `langfuse_db.py` 可执行调用面。 |
| `scores` 写入 | 标注/自动评测优先 `POST /api/public/scores`，失败时仍有 ClickHouse writer fallback。 | 如果要求“全部 Public API”，移除 ClickHouse score 写 fallback；如果保留，需要明确这是运行保障例外。 |

## 6. 生成/核对命令

```bash
cd /Users/lihaoxuan/eval-demo/pa-eval-backend
uv run python - <<'PY'
import ast, pathlib
root = pathlib.Path('app')
rows = []
for path in sorted(root.rglob('*.py')):
    tree = ast.parse(path.read_text())
    router_prefix = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call):
            func = node.value.func
            is_router = (isinstance(func, ast.Name) and func.id == 'APIRouter') or (
                isinstance(func, ast.Attribute) and func.attr == 'APIRouter'
            )
            if not is_router:
                continue
            prefix = ''
            for kw in node.value.keywords:
                if kw.arg == 'prefix' and isinstance(kw.value, ast.Constant):
                    prefix = kw.value.value or ''
            for target in node.targets:
                if isinstance(target, ast.Name):
                    router_prefix[target.id] = prefix
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for dec in node.decorator_list:
                if isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute) and isinstance(dec.func.value, ast.Name):
                    method = dec.func.attr.upper()
                    if method not in {'GET', 'POST', 'PATCH', 'DELETE', 'PUT'}:
                        continue
                    sub = dec.args[0].value if dec.args and isinstance(dec.args[0], ast.Constant) else ''
                    rows.append((str(path), method, router_prefix.get(dec.func.value.id, '') + sub, node.name))
print(len(rows))
for row in rows:
    print('\t'.join(row))
PY

rg -n "FROM|JOIN|INSERT INTO|UPDATE|DELETE FROM" app -g '*.py'
rg -n "op.create_table|op.drop_table|FINAL_PA_TABLES|LEGACY_PA_TABLES" migrations/versions -g '*.py'
```
