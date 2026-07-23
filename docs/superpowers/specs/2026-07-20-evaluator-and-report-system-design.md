# 评估器与评估报告体系设计

日期：2026-07-20

## 背景

PA Eval 现有自动评测、评估器、评测报告和数据集回流能力已经具备基础闭环，但当前模型更偏“任务 + 单评估器 + 报告”。新需求希望结合 Dify、n8n、Langfuse、OpenJudge、LangSmith、OpenEvals 和 AgentEvals，形成一套可评估智能体、大模型、Skill、工作流和 RAG 应用的统一体系，并覆盖单轮对话、多轮对话、工具调用、记忆、Agent 轨迹和 Skill 执行产物等场景。

本设计在不修改 `langfuse/` 和 `dify/` 参考源码、不修改 Langfuse 原生表结构的前提下，扩展 PA Plus 层和前端 Web 层。事实数据优先复用 Langfuse traces、observations、sessions、datasets、dataset_items、scores、job_configurations 和 job_executions；PA 只新增必要的 `pa_` 扩展表、适配器配置、运行快照和报告快照。

## 参考来源

- Langfuse Scores 是评估结果的统一对象，可挂到 traces、observations、sessions 或 dataset runs，支持 numeric、categorical、boolean、text 等分数类型。
- LangSmith 将 Agent 评估拆成 final response、single step、trajectory 三类，适合分别评估最终答案、单步工具选择和完整工具调用路径。
- OpenEvals 提供 LLM-as-judge、RAG、结构化输出、代码、Agent trajectory、多轮模拟等通用评估能力。
- AgentEvals 适合补充 Agent 轨迹匹配、工具调用顺序、工具参数和轨迹 LLM-as-judge。
- n8n Evaluations 区分轻量开发期评估和生产期指标评估，强调用测试数据集回归工作流。
- Dify 工作流适合作为企业可视化评估器编排入口，通过 HTTP 调用返回 score、passed、reason 和结构化维度分。

## 目标

- 支持评估对象：`MODEL`、`AGENT`、`SKILL`、`WORKFLOW`、`RAG_APP`。
- 支持评估场景：单轮、多轮、工具调用、多轮工具调用、记忆、RAG 事实一致性、安全合规、Agent/Skill、自定义。
- 支持评估器来源：Langfuse 原生评估器、PA 工作流评估器、Dify、n8n、OpenJudge、OpenEvals、AgentEvals、LangSmith 导入结果。
- 支持同一评测任务绑定多个评估器，并按场景、对象、指标维度聚合。
- 统一评估样本协议，能承载输入、输出、期望输出、上下文、消息历史、工具轨迹、记忆快照、Skill 信息和产物。
- 统一输出协议，评估器必须返回可落入 Langfuse scores 的结果，同时保留 reason、evidence、rawOutput 和 cost/latency。
- 扩展报告，覆盖总体结论、对象维度、场景维度、指标维度、轨迹分析、工具调用分析、记忆分析、Skill 分析、badcase、趋势、回流建议和复现信息。
- 支持 badcase 和全量评测数据回流 Langfuse datasets / dataset_items。

## 非目标

- 不修改 Langfuse 原生表结构。
- 不直接修改 `langfuse/`、`dify/` 目录参考代码。
- 不把 API 地址、密钥、数据库连接写入代码；所有外部平台连接信息通过 `.env` 或环境变量注入。
- 不在第一阶段实现完整 LangSmith 双向同步；先支持导入/适配评估结果，后续再扩展远程实验触发。
- 不在第一阶段实现复杂调度编排系统；复用现有自动评测任务和计划任务框架。

## 方案比较

### 方案 A：Langfuse Scores 为事实层，PA 扩展评估计划和报告

评估执行结果统一写入 Langfuse scores，PA 新增评估对象、场景配置、适配器配置、运行快照和报告快照。Dify/n8n/OpenJudge/OpenEvals/AgentEvals 都通过 PA 适配器接入。

优点：贴合现有架构和项目规约，报告事实来源清晰，后续可与 Langfuse analytics 和 datasets 复用。
代价：PA 需要维护适配器协议和报告聚合逻辑。

### 方案 B：PA 自建完整评估结果库

评估器、任务、运行、分数、报告全部放在 PA 自定义表中，仅把 trace/dataset 当作外部数据源。

优点：PA 业务模型更自由。
代价：绕开 Langfuse scores，数据割裂，回流和观测分析重复建设，不符合当前“Langfuse 事实数据优先”的原则。

### 方案 C：按平台分别接入

Dify、n8n、OpenJudge、LangSmith 各自形成独立任务和报告。

优点：单平台接入快。
代价：评估对象、场景、指标和报告口径分裂，无法统一比较智能体、大模型和 Skill。

## 推荐方案

采用方案 A。PA 将“评估计划、适配器、样本映射、报告快照、回流记录”作为扩展层；Langfuse 继续作为 traces、datasets 和 scores 的事实层。

推荐分三期实现：

1. 第一阶段：完善评估器与场景模型，支持多评估器任务、Dify/n8n/OpenJudge/OpenEvals/AgentEvals 适配器元数据、统一报告设计文档和前端配置入口。
2. 第二阶段：新增 PA 扩展表和后端接口，支持多评估器执行、统一 score 写入、报告生成和回流。
3. 第三阶段：接入 LangSmith 实验结果导入、趋势对比、跨版本报告、评估器校准和人工复核闭环。

## 核心概念

### 评估对象

| 对象 | 说明 | 典型输入 | 典型报告关注点 |
| --- | --- | --- | --- |
| `MODEL` | 单模型或模型配置 | input、output、expectedOutput、context | 正确性、相关性、完整性、安全性、成本、延迟 |
| `AGENT` | 具备规划、工具调用、记忆的智能体 | messages、trajectory、toolCalls、memory | 最终答案、单步决策、工具轨迹、记忆使用、任务完成 |
| `SKILL` | Agent 可选择和执行的能力单元 | instruction、skill、steps、artifact | Skill 选择、步骤遵循、产物质量、异常恢复 |
| `WORKFLOW` | Dify/n8n/自研工作流 | workflowInput、workflowOutput、nodeOutputs | 节点稳定性、输出质量、边界案例、回归表现 |
| `RAG_APP` | 检索增强应用 | input、retrievedContext、output、reference | 检索相关性、事实一致性、引用覆盖、幻觉风险 |

### 评估场景

| 场景 | 枚举 | 样本形态 | 推荐评估器 |
| --- | --- | --- | --- |
| 单轮对话 | `SINGLE_TURN` | input、output、expectedOutput、context | Langfuse LLM-as-judge、OpenJudge、OpenEvals correctness |
| 多轮对话 | `MULTI_TURN` | messages/history、output、expectedState | OpenJudge memory、OpenEvals multi-turn simulation |
| 工具调用 | `TOOL_CALLING` | input、toolCalls、toolResults、output | AgentEvals trajectory、OpenJudge trajectory |
| 多轮工具调用 | `MULTI_TURN_TOOL_CALLING` | messages + trajectory + state | AgentEvals + LLM-as-judge |
| 记忆 | `MEMORY` | memoryBefore、messages、memoryAfter、expectedMemory | 自定义规则 + LLM-as-judge |
| RAG 事实一致性 | `RAG_FACTUALITY` | input、retrievedContext、output、reference | OpenEvals RAG、Langfuse LLM-as-judge |
| 安全合规 | `SAFETY` | input、output、policy | OpenJudge harmfulness、OpenEvals safety |
| Agent/Skill | `AGENT_SKILL` | instruction、selectedSkill、steps、artifact | AgentEvals、Dify/n8n 工作流评估器 |
| 自定义 | `CUSTOM` | schema 自定义 | Dify/n8n/SDK/Code |

现有前端 `EvaluationScenario` 已覆盖大多数场景，建议补充 `MEMORY`，并让 `MULTI_TURN` 与 `MEMORY` 可以组合筛选。

## 统一样本协议

评估任务在执行前将 Langfuse trace、observation、session 或 dataset item 归一化为 `EvaluationSample`：

```json
{
  "id": "sample_xxx",
  "objectType": "AGENT",
  "scenario": "TOOL_CALLING",
  "input": {},
  "output": {},
  "expectedOutput": {},
  "context": [],
  "messages": [],
  "trajectory": [],
  "toolCalls": [],
  "toolResults": [],
  "memoryBefore": {},
  "memoryAfter": {},
  "skill": {},
  "artifact": {},
  "metadata": {
    "traceId": "trace_xxx",
    "observationId": "obs_xxx",
    "sessionId": "session_xxx",
    "datasetId": "dataset_xxx",
    "datasetItemId": "item_xxx"
  }
}
```

字段规则：

- `input/output/expectedOutput/context` 兼容现有单轮和 RAG。
- `messages` 保留多轮对话原文，包含 role、content、timestamp 和可选 tool call。
- `trajectory` 是 Agent 执行轨迹的结构化视图，包含 step、thought/action、toolName、toolArgs、toolResult、observationId。
- `memoryBefore/memoryAfter` 用于评估记忆写入、读取、遗忘和污染。
- `skill` 保存候选 Skill、选中 Skill、Skill 版本和约束。
- `artifact` 保存最终产物摘要或结构化结果，避免报告页面直接暴露过长内容。

## 统一评估器协议

评估器配置保留现有 `pa_evaluators` 能力，并扩展以下字段：

| 字段 | 说明 |
| --- | --- |
| `target_object_types` | 支持的评估对象列表 |
| `evaluation_scenarios` | 支持的场景列表 |
| `adapter_type` | `LANGFUSE`、`DIFY`、`N8N`、`OPENJUDGE`、`OPENEVALS`、`AGENTEVALS`、`LANGSMITH_IMPORT`、`CUSTOM_HTTP` |
| `input_mapping` | 从 `EvaluationSample` 到评估器入参的映射 |
| `output_mapping` | 从评估器输出到 score/result 的映射 |
| `score_schema` | 评估器可产出的指标定义 |
| `runtime_config` | 运行配置，不含密钥 |
| `credential_ref` | 凭据引用，不存明文 |

评估器输出统一为 `EvaluationResult`：

```json
{
  "sampleId": "sample_xxx",
  "evaluatorId": "evaluator_xxx",
  "status": "SUCCEEDED",
  "scores": [
    {
      "name": "trajectory_accuracy",
      "dataType": "NUMERIC",
      "value": 0.82,
      "stringValue": "",
      "comment": "工具选择正确，第二步参数缺少 region"
    }
  ],
  "passed": true,
  "reason": "完成任务但存在轻微参数问题",
  "evidence": [
    {
      "type": "TOOL_CALL",
      "ref": "step_2",
      "message": "search_order 参数缺少 region"
    }
  ],
  "rawOutput": {},
  "latencyMs": 1200,
  "costUsd": 0.0021
}
```

写入规则：

- 每个 `scores[]` 写入 Langfuse `scores`，`source` 使用 `EVAL` 或 API/SDK 可表达的等价来源。
- `comment` 保存评估理由摘要，不写入密钥、token 或内部异常堆栈。
- `rawOutput` 和长 evidence 保存到 PA 运行快照表，报告中默认展示摘要。
- 失败样本不写伪分数，记录执行错误并进入报告的执行质量分析。

## 适配器设计

### Langfuse

- 复用 Langfuse 原生 LLM-as-judge、Code evaluator、job_configurations、job_executions 和 scores。
- PA 列表中可展示 Langfuse 原生评估器，但编辑和删除仍提示到 Langfuse 管理。
- 报告按 score name、config、source、trace/session/dataset run 聚合。

### Dify

- 以 `WORKFLOW` 评估器接入，通过 endpoint、auth type、input mapping 和 output mapping 调用。
- 推荐输出：`score`、`passed`、`reason`、`metrics`、`badcaseReason`。
- Dify DSL 示例继续放在 `docs/dify/`，作为导入模板，不在代码里硬编码地址或密钥。

### n8n

- 以 `WORKFLOW` 或 `CUSTOM_HTTP` 接入，适合工作流质量、回归测试和生产执行样本评估。
- 支持轻量评估模式和指标评估模式：前者用于少量样本预发验证，后者用于大数据集回归。
- PA 只保存 webhook/workflow 引用和映射配置，凭据通过环境变量或凭据引用获取。

### OpenJudge

- 继续保留当前内置默认评估器：正确性、相关性、指令遵循、幻觉、安全、有用性、完整性、多轮上下文记忆、工具调用轨迹。
- 扩展 Skill/Agent grader：`skill_selection`、`skill_adherence`、`artifact_quality`、`memory_consistency`。
- OpenJudge SDK 输出映射到统一 `EvaluationResult`。

### OpenEvals

- 以 `SDK` 评估器接入，适合 LLM-as-judge、RAG、结构化输出、代码检查、多轮模拟。
- 支持 evaluator package、evaluator function、prompt、model、schema、threshold 配置。
- 第一阶段只落适配器元数据和配置模型；真实运行可在第二阶段通过 Python worker 实现。

### AgentEvals

- 以 `SDK` 评估器接入，专注 Agent trajectory。
- 指标包括轨迹严格匹配、无序匹配、子集/超集匹配、工具参数匹配和轨迹 LLM-as-judge。
- 对应场景为 `TOOL_CALLING`、`MULTI_TURN_TOOL_CALLING`、`AGENT_SKILL`。

### LangSmith

- 第一阶段作为结果导入和报告对齐来源，不直接远程触发实验。
- 支持导入 final response、single step、trajectory 三类评估结果，映射到 PA 报告维度和 Langfuse scores。
- 后续可以新增 LangSmith experiment remote runner。

## 任务编排

自动评测任务从“单评估器任务”升级为“评估计划”：

1. 选择评估对象类型和目标对象。
2. 选择场景模板。
3. 选择数据来源：Langfuse trace filter、session filter、dataset、dataset run、手工上传。
4. 选择一个或多个评估器。
5. 配置样本映射、输出映射、score mapping 和 badcase 规则。
6. 执行任务，生成 evaluator runs 和 score 写入。
7. 任务完成后生成报告快照。

执行状态：

- 任务级：`DRAFT`、`READY`、`RUNNING`、`COMPLETED`、`FAILED`、`CANCELLED`。
- 评估器运行级：`PENDING`、`RUNNING`、`SUCCEEDED`、`PARTIAL_FAILED`、`FAILED`。
- 样本执行级：`PENDING`、`SUCCEEDED`、`FAILED`、`SKIPPED`。

## 数据模型

### 复用 Langfuse 原生表

| 表/对象 | 用途 |
| --- | --- |
| `traces` | 单轮、Agent、RAG、workflow 的端到端样本来源 |
| `observations` | 模型调用、工具调用、节点输出、Agent step |
| `sessions` | 多轮对话和记忆场景 |
| `datasets` / `dataset_items` | 离线评测集、badcase 回流、黄金集 |
| `scores` | 统一评估结果 |
| `job_configurations` / `job_executions` | Langfuse 原生评估任务与执行 |

### PA 扩展表

所有新增表使用 Alembic，支持 downgrade；审计字段 `create_by`、`update_by`、`create_date`、`update_date` 放在业务字段前。

#### `pa_evaluation_targets`

保存可评估对象快照和引用。

| 字段 | 说明 |
| --- | --- |
| 审计字段 | `create_by`、`update_by`、`create_date`、`update_date` |
| `id` | 目标 ID |
| `project_id` | 项目 ID |
| `object_type` | `MODEL`、`AGENT`、`SKILL`、`WORKFLOW`、`RAG_APP` |
| `name` | 展示名称 |
| `version` | 目标版本 |
| `native_ref` | Langfuse/Dify/n8n/PA 原生引用 |
| `config_snapshot` | 目标配置快照，脱敏 |
| `status` | `ACTIVE`、`ARCHIVED` |

#### `pa_evaluation_plans`

替代或扩展现有 `pa_auto_eval_tasks` 的计划模型。若现有表已可承载，可优先扩展现有 PA 表，不重复建表。

| 字段 | 说明 |
| --- | --- |
| 审计字段 | `create_by`、`update_by`、`create_date`、`update_date` |
| `id` | 计划 ID |
| `project_id` | 项目 ID |
| `target_id` | 评估目标 ID |
| `target_object_type` | 目标类型冗余字段 |
| `scenarios` | 场景列表 |
| `data_source` | 数据来源配置 |
| `sample_mapping` | 样本映射模板 |
| `evaluator_ids` | 评估器列表 |
| `score_mapping` | score 输出映射 |
| `badcase_rules` | badcase 规则 |
| `report_template_id` | 报告模板 |
| `status` | 计划状态 |

#### `pa_evaluator_adapters`

保存第三方评估器运行适配配置。

| 字段 | 说明 |
| --- | --- |
| 审计字段 | `create_by`、`update_by`、`create_date`、`update_date` |
| `id` | 适配器 ID |
| `project_id` | 项目 ID |
| `evaluator_id` | 关联 `pa_evaluators.id` |
| `adapter_type` | 接入类型 |
| `runtime_config` | 运行配置，脱敏 |
| `credential_ref` | 凭据引用 |
| `input_schema` | 入参 schema |
| `output_schema` | 出参 schema |
| `status` | `ACTIVE`、`DISABLED` |

#### `pa_evaluation_plan_runs`

保存计划运行批次。

| 字段 | 说明 |
| --- | --- |
| 审计字段 | `create_by`、`update_by`、`create_date`、`update_date` |
| `id` | 运行 ID |
| `project_id` | 项目 ID |
| `plan_id` | 计划 ID |
| `status` | 运行状态 |
| `sample_count` | 样本数 |
| `succeeded_count` | 成功数 |
| `failed_count` | 失败数 |
| `badcase_count` | badcase 数 |
| `started_at` | 开始时间 |
| `ended_at` | 结束时间 |
| `config_snapshot` | 运行配置快照 |
| `error_summary` | 错误摘要 |

#### `pa_evaluator_run_items`

保存样本级执行快照和外部输出摘要。

| 字段 | 说明 |
| --- | --- |
| 审计字段 | `create_by`、`update_by`、`create_date`、`update_date` |
| `id` | 明细 ID |
| `project_id` | 项目 ID |
| `plan_run_id` | 计划运行 ID |
| `evaluator_id` | 评估器 ID |
| `sample_id` | 样本 ID |
| `source_trace_id` | 来源 trace |
| `source_observation_id` | 来源 observation |
| `source_session_id` | 来源 session |
| `source_dataset_item_id` | 来源 dataset item |
| `status` | 样本执行状态 |
| `score_ids` | 写入 Langfuse 的 score ID 列表 |
| `result_snapshot` | 统一结果快照，脱敏 |
| `raw_output_ref` | 大体积原始输出引用 |
| `error_message` | 可展示错误 |

评测报告和回流表可沿用现有 `pa_evaluation_reports`、`pa_evaluation_report_flowbacks`、`pa_evaluation_report_flowback_items`，新增字段时仍走 Alembic。

## 后端 API

响应格式遵循项目统一规范：`{ code, message, data, txId }`。

### 评估对象

- `GET /api/projects/{projectId}/evaluation-targets`
- `POST /api/projects/{projectId}/evaluation-targets`
- `GET /api/projects/{projectId}/evaluation-targets/{targetId}`
- `PATCH /api/projects/{projectId}/evaluation-targets/{targetId}`
- `DELETE /api/projects/{projectId}/evaluation-targets/{targetId}`

### 评估器

扩展现有 `/api/evaluators`：

- `GET /api/evaluators?projectId=&objectType=&scenario=&provider=&type=`
- `POST /api/evaluators`
- `PATCH /api/evaluators/{evaluatorId}`
- `DELETE /api/evaluators/{evaluatorId}`
- `POST /api/evaluators/{evaluatorId}/debug`

### 评估计划与运行

- `GET /api/projects/{projectId}/evaluation-plans`
- `POST /api/projects/{projectId}/evaluation-plans`
- `GET /api/projects/{projectId}/evaluation-plans/{planId}`
- `PATCH /api/projects/{projectId}/evaluation-plans/{planId}`
- `POST /api/projects/{projectId}/evaluation-plans/{planId}/runs`
- `GET /api/projects/{projectId}/evaluation-plan-runs`
- `GET /api/projects/{projectId}/evaluation-plan-runs/{runId}`
- `GET /api/projects/{projectId}/evaluation-plan-runs/{runId}/items`

### 报告

扩展现有报告 API：

- `GET /api/projects/{projectId}/evaluation-reports`
- `GET /api/projects/{projectId}/evaluation-reports/{reportId}`
- `POST /api/projects/{projectId}/evaluation-reports/{reportId}/regenerate`
- `POST /api/projects/{projectId}/evaluation-reports/{reportId}/export`
- `POST /api/projects/{projectId}/evaluation-reports/{reportId}/flowbacks`

## 前端设计

### 导航

“应用评测”建议拆为：

- 数据集
- 人工评测
- 自动评测
- 场景评测
- 评估对象
- 评估器
- 评测报告

第一阶段可以保留已有“场景评测”入口，并将其作为创建评估计划的场景模板页。

### 评估对象页

用于管理大模型、Agent、Skill、工作流和 RAG 应用。列表展示对象类型、名称、版本、来源、关联 trace 数、最近评测、风险状态。详情页展示配置快照、关联评估计划、历史报告和 badcase。

### 评估器页

现有评估器页扩展：

- provider 增加 `OPENEVALS`、`AGENTEVALS`、`LANGSMITH_IMPORT`。
- type 保留 `LLM_AS_JUDGE`、`CODE`、`WORKFLOW`、`SDK`。
- 增加对象类型和场景多选。
- 增加输入/输出 schema 预览和调试面板。
- 内置 OpenJudge 评估器标记为系统内置，不允许删除。

### 自动评测/评估计划页

新建流程从三步扩展为四步：

1. 选择对象与场景。
2. 选择数据来源与样本映射。
3. 选择评估器与输出映射。
4. 配置 badcase、报告模板和运行参数。

### 报告详情

报告模块新增 tabs：

- 总览：总体分、通过率、样本量、badcase、执行成本、延迟。
- 场景分析：按场景展示指标表现。
- 对象分析：按 model/agent/skill/workflow/rag 维度展示。
- 轨迹分析：工具调用路径、参数错误、漏调用、多调用、顺序错误。
- 记忆分析：记忆命中、错误记忆、遗忘、污染。
- Skill 分析：Skill 选择、步骤遵循、产物质量。
- Badcase：原因、严重级别、证据、回流状态。
- 复现信息：计划 ID、运行 ID、评估器版本、样本过滤条件、报告模板。

## 报告指标体系

| 维度 | 指标 |
| --- | --- |
| 通用质量 | correctness、relevance、helpfulness、completeness、instruction_following |
| 安全 | harmfulness、policy_compliance、pii_leakage、refusal_quality |
| RAG | groundedness、retrieval_relevance、citation_coverage、hallucination |
| Agent | task_success、planning_quality、trajectory_accuracy、step_efficiency |
| 工具调用 | tool_selection、tool_args_correctness、tool_order、tool_result_usage |
| 多轮/记忆 | context_memory、state_consistency、memory_write_quality、memory_retrieval |
| Skill | skill_selection、skill_adherence、artifact_quality、recovery_quality |
| 运行质量 | evaluator_success_rate、latency_p95、cost_total、error_rate |

badcase 默认规则：

- numeric score 低于阈值。
- boolean score 为 false。
- categorical score 命中失败类目。
- 评估器执行失败且不是用户主动跳过。
- Agent 轨迹中出现高危工具误调用、参数泄露、越权访问或安全拒答失败。

## 安全与权限

- 外部评估器 endpoint、token、API key 不入库明文，不写日志。
- 评估器 raw output 默认脱敏，报告仅展示摘要和证据片段。
- 内部 API 继续依赖现有鉴权上下文。
- 创建、编辑、删除评估器、运行评估计划、报告回流和报告导出都记录审计日志。
- 对 Langfuse 原生表只读分析或通过 API/SDK 写 score/dataset item，不直接修改原生结构。

## 实施计划

### 第一阶段：模型和文档对齐

- 扩展 `EvaluationScenario`，增加 `MEMORY`。
- 扩展评估器类型定义和前端表单，支持对象类型、场景多选、provider 扩展。
- 补充 OpenJudge 默认 Skill/Agent/Memory 评估器元数据。
- 编写后端 schema 和 API 草案，不新增数据库。
- 完成报告结构设计和前端展示字段设计。

### 第二阶段：后端落库和执行

- 新增 Alembic 迁移：`pa_evaluation_targets`、`pa_evaluation_plans`、`pa_evaluator_adapters`、`pa_evaluation_plan_runs`、`pa_evaluator_run_items`。
- 实现评估对象、评估计划、计划运行接口。
- 抽象 evaluator adapter runner。
- Dify/n8n HTTP runner 写入统一 `EvaluationResult`。
- OpenJudge/OpenEvals/AgentEvals SDK runner 通过 `uv` 管理依赖和运行。
- 评估结果写入 Langfuse scores。

### 第三阶段：报告增强

- 基于 plan run + Langfuse scores 生成统一报告。
- 增加轨迹、工具、记忆、Skill 分析模块。
- 支持 badcase 和评测数据回流。
- 支持报告导出 Markdown，后续扩展 HTML/PDF。
- 增加趋势对比和版本对比。

## 测试策略

- 后端单元测试：schema 校验、样本归一化、输出映射、badcase 规则、报告聚合。
- 后端集成测试：Dify/n8n mock endpoint、OpenJudge/OpenEvals/AgentEvals runner mock、Langfuse score writer mock。
- 迁移测试：所有新增 `pa_` 表具备审计字段、注释、索引和 downgrade。
- 前端测试：评估器表单、场景模板、评估计划创建、报告 tabs、badcase 回流。
- 回归测试：现有自动评测、评估器、报告、数据集回流接口保持兼容。

## 验收标准

- 能在 `baiyizhong001` 分支上看到统一设计文档和后续实现改动。
- 能创建面向模型、Agent、Skill、工作流或 RAG 的评估计划。
- 能选择单轮、多轮、工具调用、记忆等场景模板。
- 能绑定多个评估器，并将结果归一化写入 scores。
- 报告能按对象、场景、指标、轨迹、工具、记忆和 Skill 展示结果。
- badcase 可回流到 Langfuse 数据集，metadata 可追溯来源。
- 不修改 Langfuse 原生表结构，不修改 `langfuse/` 和 `dify/` 参考代码。

## 自检

- 无待定项和占位符。
- 方案范围聚焦评估器、评估计划和报告体系，不包含无关登录、权限重构或模型配置重构。
- 所有新增数据库能力均要求 `pa_` 前缀、审计字段、注释和 Alembic 回滚。
- 外部平台接入只保存配置引用，不硬编码地址和密钥。
