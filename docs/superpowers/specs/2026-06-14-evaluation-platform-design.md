# 评测平台设计

日期：2026-06-14

## 目标

基于 `Enterprise Admin Dashboard DesignV3` 中的高保真后台界面，建设一个平台级评测系统。

平台采用独立前后端分离架构，连接通过 Docker 启动的 Langfuse 实例。平台应优先使用 Langfuse public API 读取和写入 Trace、Dataset、Evaluator、Evaluation Rule、Score 等数据。不得修改 Langfuse 既有表结构。平台自有状态可以存放在 Langfuse 使用的同一个 Postgres 数据库中，但只能新增带 `eval_platform_*` 前缀的表。

第一条生产可交付主流程：

1. 在平台中筛选 Langfuse Traces。
2. 从选中或抽样的 Traces 创建评测任务。
3. 由 Python 平台 worker 执行评测。
4. 通过 Langfuse Scores API 将结果写回 Langfuse。
5. 在 Enterprise Admin Dashboard 风格的界面中展示进度、报告、分数分布和 Bad Cases。

## 已确认决策

- 架构：独立评测平台，前后端分离。
- Langfuse：使用 Docker 启动，不使用源码启动。
- 后端：Python FastAPI。
- Worker：模块化单体后端加异步 worker 队列。
- 数据库：复用 Langfuse Docker 栈中的 Postgres，但只新增 `eval_platform_*` 表。
- 执行策略：Python 平台执行评测，再写回 Langfuse Scores。
- 认证与权限：平台自有用户、角色和项目权限。
- 第一版评估器类型：LLM Judge、简单规则评估器、OpenJudge 内置 grader adapter。

## 非目标

- 不修改 Langfuse 既有表结构或既有迁移。
- 不依赖 Langfuse Web session 作为平台认证体系。
- 第一版不实现完整人工标注工作流。
- 核心评测闭环跑通前，不拆成多个微服务。
- 前端不直接调用 Langfuse API。
- 第一版不开放任意用户代码执行型评估器。

## 总体架构

平台采用“模块化单体后端 + 异步 worker”的架构。

前端：

- React 应用，基于 `Enterprise Admin Dashboard DesignV3` 改造。
- 沿用现有信息架构：项目、Trace、评测任务、评估器、数据集、设置、用户、租户、系统设置。
- 只调用平台 FastAPI 后端，不直接访问 Langfuse。

后端：

- FastAPI REST API。
- 建议模块：
  - `auth`：平台用户、角色、会话和鉴权。
  - `projects`：平台项目与 Langfuse 项目/API key 映射。
  - `langfuse_client`：Langfuse API client 和只读兜底 repository。
  - `traces`：Trace 查询、筛选、详情加载和抽样。
  - `datasets`：Langfuse Dataset 列表和相关操作。
  - `evaluators`：LLM Judge、规则、OpenJudge evaluator 定义。
  - `tasks`：评测任务生命周期。
  - `workers`：异步执行编排。
  - `reports`：报告聚合、Bad Case 提取和报告快照。
  - `audit`：平台操作审计。

Worker：

- 从队列中处理评测任务项。
- 支持并发、重试、取消，并为后续暂停/恢复预留状态。
- 通过统一 evaluator interface 执行评测。
- 通过 Langfuse Scores API 写回结果。
- 更新平台自有 task、item、report 表。

基础设施：

- Langfuse 使用 Docker Compose 启动，保留其 web、worker、Postgres、ClickHouse、Redis、MinIO 等服务。
- 平台新增独立 compose 或 compose override，包含 `frontend`、`api`、`worker`。
- 平台 API 和 worker 连接 Langfuse Docker 栈中的 Postgres 和 Redis。
- 平台只拥有 `eval_platform_*` 表和平台自己的队列命名空间。
- Alembic 只管理平台自有表。

## 数据所有权

Langfuse 仍是以下数据的来源：

- Langfuse 侧项目和 API credential。
- Traces、Observations、Sessions 和 ingestion 数据。
- Dataset 和 Dataset Run，其中 Langfuse API 能覆盖的部分优先通过 API 使用。
- 平台写入的 Scores。
- 平台需要引用或同步的 Langfuse 原生 evaluator 元数据。

评测平台是以下数据的来源：

- 平台用户、角色和项目权限。
- Langfuse 连接映射。
- 评测任务定义和执行状态。
- 平台自有 evaluator 定义。
- 每个任务项的执行状态。
- 报告快照和 Bad Case 列表。
- 平台操作审计日志。

## 新增表设计

所有平台表使用 `eval_platform_*` 前缀。

### `eval_platform_users`

存储平台用户、角色和账号状态。

核心字段：

- `id`
- `email`
- `name`
- `password_hash` 或外部身份引用
- `role`
- `status`
- `created_at`
- `updated_at`

### `eval_platform_projects`

存储平台项目和 Langfuse 项目的映射。

核心字段：

- `id`
- `name`
- `description`
- `langfuse_base_url`
- `langfuse_project_id`
- `langfuse_public_key`
- `langfuse_secret_key_encrypted`
- `status`
- `created_by`
- `created_at`
- `updated_at`

### `eval_platform_evaluators`

存储平台 evaluator 定义。

核心字段：

- `id`
- `project_id`
- `name`
- `type`：`llm_judge`、`rule` 或 `openjudge`
- `status`
- `config_json`
- `output_schema_json`
- `created_by`
- `created_at`
- `updated_at`

### `eval_platform_tasks`

存储评测任务生命周期和运行配置。

核心字段：

- `id`
- `project_id`
- `name`
- `description`
- `status`：`pending`、`running`、`completed`、`failed`、`cancelled`
- `source_type`：第一版为 `trace`，后续可复用为 dataset 任务
- `trace_filter_json`
- `sampling_strategy_json`
- `evaluator_id`
- `runtime_config_json`：并发、重试、缓存策略、超时
- `total_items`
- `completed_items`
- `failed_items`
- `created_by`
- `started_at`
- `completed_at`
- `created_at`
- `updated_at`

### `eval_platform_task_items`

存储每条 Trace 或 Observation 的评测执行状态。

核心字段：

- `id`
- `task_id`
- `project_id`
- `langfuse_trace_id`
- `langfuse_observation_id`
- `status`：`pending`、`running`、`completed`、`failed`、`cancelled`
- `attempt_count`
- `evaluation_input_json`
- `score`
- `passed`
- `reason`
- `dimension_scores_json`
- `metadata_json`
- `error_type`
- `error_message`
- `langfuse_score_id`
- `created_at`
- `updated_at`

### `eval_platform_reports`

存储任务详情页和分析页需要的报告快照。

核心字段：

- `id`
- `task_id`
- `project_id`
- `summary_json`
- `score_distribution_json`
- `dimension_radar_json`
- `bad_cases_json`
- `generated_at`
- `created_at`
- `updated_at`

### `eval_platform_audit_logs`

存储平台级操作审计。

核心字段：

- `id`
- `project_id`
- `user_id`
- `resource_type`
- `resource_id`
- `action`
- `before_json`
- `after_json`
- `created_at`

### 预留表

- `eval_platform_dataset_views`：只存平台侧 dataset 分类、标签、版本备注，不复制 Langfuse Dataset 内容。
- `eval_platform_eval_runs`：如果后续需要一个任务多次运行和横向对比，再拆出 run 表。

## 核心工作流

### 1. 连接项目

管理员在平台创建项目，填写 Langfuse base URL、project id、public key、secret key。平台后端加密保存 secret key，并通过 Langfuse API 进行连接测试。测试通过后，项目才可用于评测任务。

### 2. 筛选 Traces

Trace 页面将筛选条件提交给平台后端。后端优先使用 Langfuse API。若 public API 覆盖不足，可使用只读 repository 查询 Langfuse 存储层数据。该兜底路径只能读取，不能修改 Langfuse 表。

### 3. 创建任务

用户直接选择 Traces，或配置全量、随机 N 条、随机百分比、均匀抽样、分层抽样。后端创建一条 `eval_platform_tasks` 记录，并为每条待评测 Trace 或 Observation 创建 `eval_platform_task_items`。

### 4. 执行评测

Worker 领取 pending item，构造标准化 evaluator 输入：

- `input`
- `output`
- `expected`
- `metadata`
- `trace_id`
- `observation_id`

每个 evaluator 返回：

- `score`
- `passed`
- `reason`
- `metadata`
- `dimension_scores`

### 5. 写回 Scores

Worker 通过 Langfuse Scores API 写入每条结果，并将返回的 `score_id` 写入 `eval_platform_task_items.langfuse_score_id`。

如果评测已成功但 Scores 写回失败，worker 保留 item 中的评测结果，重试时只重放写回步骤，避免重复调用 judge。

### 6. 生成报告

任务完成后，后端聚合 task item 和必要的 Langfuse Score 数据，生成报告快照并写入 `eval_platform_reports`。报告包含概览指标、分数分布、维度雷达、失败项详情和 Bad Cases。

## API 设计

后端提供 REST API，响应 envelope 统一为：

```json
{
  "data": {},
  "meta": {},
  "error": null
}
```

第一版 API：

- `GET /api/projects`
- `POST /api/projects`
- `PATCH /api/projects/{project_id}`
- `POST /api/projects/{project_id}/connection/test`
- `GET /api/projects/{project_id}/traces`
- `POST /api/projects/{project_id}/traces/sample`
- `GET /api/projects/{project_id}/datasets`
- `GET /api/projects/{project_id}/evaluators`
- `POST /api/projects/{project_id}/evaluators`
- `PATCH /api/projects/{project_id}/evaluators/{evaluator_id}`
- `POST /api/projects/{project_id}/evaluators/{evaluator_id}/test`
- `GET /api/projects/{project_id}/tasks`
- `POST /api/projects/{project_id}/tasks`
- `GET /api/projects/{project_id}/tasks/{task_id}`
- `POST /api/projects/{project_id}/tasks/{task_id}/cancel`
- `POST /api/projects/{project_id}/tasks/{task_id}/retry`
- `GET /api/projects/{project_id}/reports/{task_id}`

第一版进度通过轮询 `/tasks/{task_id}` 获取。后续可增加 SSE 或 WebSocket，不改变任务存储模型。

## 前端范围

前端遵循 `Enterprise Admin Dashboard DesignV3` 的布局和视觉体系。

第一版接真实数据的页面：

- `ProjectList`：平台项目列表、Langfuse 连接创建和编辑。
- `TraceLogs`：Trace 列表、筛选、选择、抽样预览、启动评测。
- `Evaluators`：评估器管理和测试运行。
- `EvaluationTasks`：任务列表、进度、详情、重试、取消、报告和 Bad Case。
- `Datasets`：Langfuse Dataset 列表，以及 Langfuse API 支持的基础 dataset 操作。
- `Settings`：Langfuse 连接、模型供应商密钥、默认评测运行参数。

第一版保留框架或最小实现的页面：

- `LLMJudge`：功能并入 `Evaluators` 的创建/编辑向导，不单独实现完整页面。
- `HumanAnnotation`：保留导航和空状态，第一版不实现完整标注流。
- `TenantManagement`：保留平台级租户控制结构，先不实现复杂配额。
- `UserManagement`：实现基础平台用户和角色管理。
- `SystemSettings`：实现最小全局配置。

## Evaluator 设计

所有 evaluator 使用统一接口：

```python
class Evaluator:
    async def evaluate(self, input: EvaluationInput) -> EvaluationResult:
        ...
```

`EvaluationInput` 包含标准化的 `input`、`output`、`expected`、metadata、Trace id、Observation id 和任务上下文。

`EvaluationResult` 包含 score、pass/fail、reason、metadata，以及可选 dimension scores。

Evaluator 类型：

- `LLMJudgeEvaluator`：根据配置的模型供应商执行 prompt-based judge。
- `RuleEvaluator`：执行 JSON 合法性、关键词存在、长度阈值、字符串匹配、正则匹配、数值范围等确定性规则。第一版只支持预设规则类型和用户参数，不执行任意用户代码。
- `OpenJudgeEvaluator`：将选定的 OpenJudge grader 适配为平台统一接口。

第一版每种 evaluator 至少提供一个可用实现。

OpenJudge adapter 第一批候选：

- 文本类 grader：`StringMatchGrader`、`NumberAccuracyGrader`，以及依赖可满足时的 similarity grader。
- 通用质量类 grader：relevance、correctness、hallucination、harmfulness、instruction following。
- Agent 响应类 grader：response helpfulness、response completeness。

需要不安全代码执行、多模态资产或重型外部依赖的 OpenJudge grader 不进入第一版，除非后续提供明确 sandbox 配置。

## 错误处理

- Langfuse 连接失败：连接测试失败，该项目不能启动任务。
- Trace 读取失败：对应 task item 标记为 failed，可重试。
- Evaluator 执行失败：task item 记录 error type、error message 和 attempt count。
- Score 写回失败：保留评测结果，只重试写回步骤。
- 任务取消：停止派发新 item；正在执行的 item 完成当前步骤后尊重取消状态。
- 报告生成失败：Langfuse Scores 不受影响，可从 task items 重新生成报告。

## 安全设计

- 平台用户和角色独立于 Langfuse session。
- Langfuse secret key 和模型供应商 key 必须加密存储。
- 前端永远不接收 Langfuse secret key。
- 后端每个接口都必须校验项目访问权限。
- 连接变更、evaluator 变更、任务创建、任务取消、任务重试、设置更新都写审计日志。

## 部署设计

Langfuse 使用 Docker 启动。平台提供独立 Docker Compose，或在部署文档中说明如何与 Langfuse Docker Compose 联合启动。

Langfuse Docker 栈：

- `langfuse-web`
- `langfuse-worker`
- `postgres`
- `clickhouse`
- `redis`
- `minio`

平台 Docker 栈：

- `frontend`
- `api`
- `worker`

平台服务通过环境变量连接 Langfuse Docker 栈中的服务：

- `DATABASE_URL`：指向 Langfuse Postgres。
- `REDIS_URL`：指向 Redis，用于平台队列。
- `LANGFUSE_DEFAULT_BASE_URL`：默认 Langfuse Web 地址，例如 `http://langfuse-web:3000` 或宿主机地址。
- `PLATFORM_SECRET_KEY`
- `KEY_ENCRYPTION_SECRET`
- 模型供应商 key 或密钥引用。

迁移：

- 平台使用 Alembic 管理迁移。
- 迁移脚本只能创建或修改 `eval_platform_*` 表。
- 不改 Langfuse Prisma schema，不改 Langfuse migration，不改 Langfuse 既有表结构。

开发环境：

- 先通过 Langfuse 提供的 Docker Compose 启动 Langfuse。
- 再启动平台 compose，使 `api` 和 `worker` 连接同一 Postgres/Redis。
- 平台前端通过环境变量指向平台 API，不直接指向 Langfuse。

## 测试策略

后端单元测试：

- evaluator interface 和 evaluator 实现
- Trace 抽样逻辑
- task 和 item 状态流转
- 报告聚合
- credential 加密辅助函数

后端集成测试：

- mock Langfuse datasets、traces、scores API
- 项目连接验证
- score 写回成功和失败处理
- 报告重新生成

Worker 测试：

- item claiming
- retry 行为
- cancel 行为
- score 写回幂等

前端测试：

- 第一版真实页面 smoke test
- Trace filter 和 sampling 表单行为
- evaluator 创建和测试流程
- task 创建流程
- task detail 和 report 渲染

端到端测试：

- 创建 Langfuse 连接
- 列出和筛选 traces
- 创建评测任务
- 使用测试 evaluator 执行小任务
- 将 scores 写入 mock 或本地 Docker Langfuse
- 渲染完成后的报告

## 实施阶段

阶段 1：基础工程

- 搭建 frontend、FastAPI backend、worker、Alembic migrations、Docker Compose。
- 实现平台 auth 和 project connection model。
- 实现 Langfuse client wrapper 和连接测试。

阶段 2：核心评测闭环

- Trace list/filter adapter。
- LLM Judge、rule、OpenJudge evaluator CRUD。
- 任务创建和 worker 执行。
- Langfuse Scores API 写回。

阶段 3：报告和 UI 完成度

- 任务列表、详情、进度 UI。
- 报告聚合和 Bad Case 提取。
- Dataset 列表集成。
- Settings 和基础用户管理。

阶段 4：工程加固

- Retry 和 cancel 细节完善。
- 加密凭据安全审查。
- 集成测试和端到端测试。
- Docker 部署文档。

## 验收标准

- 用户可以将平台连接到 Docker 启动的 Langfuse 项目。
- 用户可以在平台 UI 中筛选 Langfuse Traces。
- 用户可以从选中或抽样 Traces 创建评测任务。
- Worker 可以使用 LLM Judge、rule、OpenJudge evaluator 执行 task items。
- Worker 可以通过 Langfuse Scores API 写回评测结果。
- 平台只在 `eval_platform_*` 表中保存任务状态和 score 引用。
- 报告页展示总览分数、进度、分数分布、维度指标、失败项和 Bad Cases。
- 不修改任何 Langfuse 既有表结构。
