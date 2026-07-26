# Skill 评估器模块需求

日期：2026-07-25

## 1. 背景与目标

现有自动评测模块已支持 `LLM_AS_JUDGE`、`CODE`、`WORKFLOW`、`SDK`（OpenJudge）四类评估器，覆盖了单轮问答、指令遵循、事实性等标准化评估场景。但在实际业务中，越来越多的评估对象呈现复杂化趋势：

- 业务 Skill 评估：需要理解 Skill 的调用链路、工具选择正确性、目标达成度。
- 多轮对话质量：需要结合完整对话历史、上下文记忆、话题流转综合评判。
- 多轮推理与工具调用轨迹：需要在评估过程中模拟或复现推理过程，甚至调用外部工具验证中间结论。

这些场景无法通过单次 LLM 调用或固定脚本完成，需要可编程的、能调用工具的、多步推理的评估流程。

本期目标：

- 引入新的评估器类型 `SKILL`，支持以 Skill 形式定义完全自定义的评估流程。
- Skill 是动态的、项目级隔离的：每个项目有自己的 Skill 集合，预置一部分通用 Skill，同时支持项目上传自定义 Skill。
- Skill 评估过程中可以调用工具（检索、代码执行、外部 API 等），由 Agent 执行器承载。
- Skill 评估的输入支持单条或多条 Langfuse Trace，也支持数据集（Dataset Items）。
- Skill 评估的结果统一写入 Langfuse `scores`，与现有评估器结果一致。
- 评估器管理和 Skill 管理提供完整的前端交互能力。

参考实现：pi-mono（earendil-works/pi）是一个开源的 AI Agent Harness，原生支持 Agent Skills 标准、headless RPC 调用、自定义工具，本期以其作为 Skill 执行器。

## 2. 设计原则

- **Skill 动态化**：Skill 不硬编码在系统里，以目录形式存在于文件系统，支持运行时加载；每个项目的 Skill 相互隔离。
- **Agent 执行**：Skill 的评估逻辑由 Agent 执行器（pi-mono）承载，Skill 定义（`SKILL.md`）描述评估流程，Agent 自主加载并执行，支持多步推理和工具调用。
- **复用现有链路**：Skill 评估器作为 `EvaluatorType` 的新增类型，接入现有自动评测任务流程；评分结果复用现有 `scores` 写入和报告生成链路，不新增 score 表。
- **不修改 Langfuse 原生表**：Skill 评估器配置存储在 PA 扩展表 `pa_evaluators` 的 `config` JSONB 字段，不新增表，不修改 Langfuse 表。
- **容器化部署**：pa-eval-backend 镜像内置 pi-mono 运行时；Skill 通过持久化 Volume 管理，不需要重新构建镜像。
- **安全边界人工保证**：Skill 可包含可执行代码，不做复杂审核和沙箱隔离；通过路径校验防止目录穿越，通过容器限制爆炸半径，内容由部署方人工保证。

## 3. 范围说明

### 3.1 本期范围

| 功能域 | 功能点 | 说明 |
| --- | --- | --- |
| 评估器类型 | 新增 SKILL 类型 | `EvaluatorType` 增加 `SKILL`，`EvaluatorProvider` 增加 `PI` |
| Skill 管理 | 预置 Skill | 系统内置一批通用 Skill，所有项目只读可用 |
| Skill 管理 | 项目 Skill 列表 | 查询当前项目可用的 Skill（含预置和项目自定义） |
| Skill 管理 | Skill 详情 | 查看 Skill 的 `SKILL.md` 内容和元信息 |
| Skill 管理 | 上传 Skill | 上传 Skill 压缩包，解压校验后部署到项目目录 |
| Skill 管理 | 删除 Skill | 删除项目自定义 Skill（预置不可删） |
| 评估器创建 | 创建 SKILL 评估器 | 选择 Skill、配置输入变量映射、输出变量映射、模型 |
| 评估执行 | 批量评估 | Skill 评估器接入自动评测任务，支持批量样本 |
| 评估执行 | 数据来源适配 | Skill 输入支持 Trace 来源和 Dataset 来源 |
| 评估执行 | 结果回写 | 评分写入 Langfuse `scores`，生成评测报告 |
| 部署 | 容器化 | 后端镜像内置 pi-mono，docker-compose 编排 |

### 3.2 非本期范围

- Skill 版本管理和多版本共存。
- Skill 执行的细粒度权限控制和沙箱隔离。
- Skill 执行过程的实时日志流（仅在结果中记录 raw trace）。
- Skill 市场 or 跨项目共享。
- Skill 的可视化编辑器。
- pi-mono 自身的定制或二次开发。
- 非 pi-mono 的 Skill 执行器适配。

## 4. 用户场景

### 场景 1：评估 RAG 业务 Skill

某项目有一个"知识库问答"业务 Skill，需要评估回答的事实准确性。

1. 业务方编写一个评估 Skill `rag-factuality-check`，在 `SKILL.md` 中定义：读取输入的 context（检索文档）、output（回答），调用文档检索工具交叉验证关键事实，输出准确性评分。
2. 上传该 Skill 到项目目录。
3. 创建 SKILL 评估器，选择 `rag-factuality-check`，配置输入映射（`context` ← `{{ sample.context }}`，`output` ← `{{ sample.output }}`）。
4. 创建自动评测任务，选择该评估器和数据集，运行。
5. 结果写入 Langfuse `scores`，在评测报告中查看。

### 场景 2：评估多轮对话 Agent 质量

某项目有一个客服 Agent，需要评估多轮对话的整体质量（上下文记忆、话题流转、工具调用正确性）。

1. 评估 Skill `multi-turn-agent-quality` 的 `SKILL.md` 定义：解析完整对话历史和工具调用轨迹，对上下文连贯性、工具选择合理性、目标达成度分别评分。
2. 创建 SKILL 评估器，从 Trace 过滤条件选择多轮对话 Trace。
3. 运行评测，Skill 内部可能调用模拟器工具复现中间步骤。

### 场景 3：使用预置 Skill 快速评估

项目刚启用，想快速评估单轮问答质量。

1. 从预置 Skill 列表选择 `single-turn-quality`。
2. 创建评估器，配置数据集，运行。

## 5. 功能需求

### 5.1 Skill 管理

#### 5.1.1 Skill 目录结构

Skill 以目录形式存储，遵循 Agent Skills 规范：

```
<skill_root>/
├── _builtin/                              # 预置 Skill，所有项目只读
│   ├── single-turn-quality/
│   │   └── SKILL.md
│   └── rag-factuality-check/
│       ├── SKILL.md
│       └── scripts/
│           └── verify.py
└── <project_id>/                          # 项目级 Skill，项目隔离
    ├── multi-turn-agent-quality/
    │   ├── SKILL.md
    │   └── tools/
    │       └── simulator.py
    └── custom-business-eval/
        └── SKILL.md
```

#### 5.1.2 Skill 列表查询

- 接口：`GET /api/projects/{projectId}/skills`
- 返回当前项目可用的所有 Skill，包括预置和项目自定义。
- 每个 Skill 返回：名称、描述、来源（`BUILTIN` / `PROJECT`）、变量列表、更新时间。

#### 5.1.3 Skill 详情

- 接口：`GET /api/projects/{projectId}/skills/{skillName}`
- 返回 Skill 的 `SKILL.md` 原文内容和 frontmatter 元信息。

#### 5.1.4 上传 Skill

- 接口：`POST /api/projects/{projectId}/skills`
- `Content-Type: multipart/form-data`
- 参数：
  - `file`：Skill 压缩包（`.zip` 或 `.tar.gz`），解压后必须包含 `SKILL.md`。
  - `name`：Skill 名称，校验规则 `^[a-z0-9-]+$`，长度 1-64，必须与 frontmatter `name` 一致。
  - `overwrite`：是否覆盖同名 Skill，默认 `false`。
- 校验：
  - 压缩包解压后顶层必须包含 `SKILL.md`。
  - `SKILL.md` 的 frontmatter `name` 必须与请求参数 `name` 一致。
  - 名称校验防路径穿越（禁止 `.`、`..`、`/` 等）。
- 部署：校验通过后移动到 `<skill_root>/<project_id>/<name>/`。

#### 5.1.5 删除 Skill

- 接口：`DELETE /api/projects/{projectId}/skills/{skillName}`
- 仅允许删除项目自定义 Skill，预置 Skill 返回错误。

### 5.2 SKILL 评估器

#### 5.2.1 数据模型扩展

`EvaluatorType` 新增 `SKILL`，`EvaluatorProvider` 新增 `PI`。

SKILL 评估器存储在 `pa_evaluators` 表，`config` JSONB 字段存储：

| 字段 | 说明 |
| --- | --- |
| `skillName` | Skill 目录名，用于拼接路径 |
| `modelConfig` | Agent 使用的模型配置（provider、model、api key 引用） |
| `inputMapping` | 输入变量映射，复用现有 `normalize_sample_mapping` |
| `outputMapping` | 输出变量映射 |
| `outputVariableMappings` | 输出变量到 score 字段的映射 |
| `evaluationScenario` | 评估场景类型 |

#### 5.2.2 创建 SKILL 评估器

- 接口：复用 `POST /api/evaluators`
- `type = "SKILL"`，`provider = "PI"`
- 必填：`skillName`（复用 `endpointUrl` 字段传递）、`inputVariables`、`outputVariableMappings`。
- `modelConfig` 可选，为空时使用项目默认评估模型。

#### 5.2.3 评估器列表和详情

- 复用现有 `GET /api/evaluators`，支持按 `type=SKILL` 过滤。

### 5.3 评估执行

#### 5.3.1 数据来源

Skill 评估支持两种数据来源，与现有自动评测一致：

- **Dataset**：从已有数据集选择样本，复用 `_normalize_dataset_item_sample`。
- **Trace 过滤**：按 Langfuse trace 过滤条件选择，Trace 的完整 observations、span 树、工具调用记录会传递给 Skill。

#### 5.3.2 样本输入

每个样本构造为统一结构传递给 Skill：

| 字段 | 说明 |
| --- | --- |
| `sampleId` | 样本唯一标识 |
| `traceId` | Langfuse Trace ID（Trace 来源时存在） |
| `input` | 用户输入 |
| `output` | 待评估输出 |
| `expectedOutput` | 参考答案 |
| `context` | 上下文 |
| `messages` | 多轮对话原始消息列表（含工具调用记录） |
| `metadata` | 原始元数据 |

#### 5.3.3 执行流程

1. 自动评测任务触发后台执行。
2. 判断评估器类型为 `SKILL`，进入 Skill 评估分支。
3. 构造样本输入列表。
4. 拼接 Skill 路径：`<skill_root>/<project_id>/<skillName>`。
5. 启动 pi-mono 子进程（`pi --mode rpc`），加载目标 Skill。
6. 批量发送样本，Agent 按 `SKILL.md` 执行评估（可调用工具、多步推理）。
7. 收集 Agent 输出，解析为标准评分结构。
8. 结果写入 Langfuse `scores`（经 `LangfuseAdminClient`），生成评测报告。

#### 5.3.4 Skill 输出约定

Skill 的 `SKILL.md` 必须约定输出格式为严格 JSON 数组，每元素：

```json
{
  "sampleId": "与输入一致",
  "scores": [
    {"name": "事实准确性", "value": 0.85, "comment": "关键事实遗漏 1 处"}
  ],
  "passed": true,
  "reason": "整体回答覆盖了主要事实点"
}
```

#### 5.3.5 结果回写

- 评分复用现有 `_complete_auto_evaluation_success` 写入 ClickHouse `scores` 和 `pa_evaluation_reports`。
- Skill 评估的 `raw` 字段记录：Agent session ID、模型信息、token usage、Skill 版本，用于审计和复现。

## 6. 非功能需求

### 6.1 部署

- pa-eval-backend 镜像内置 pi-mono 运行时（多阶段构建）。
- Skill 通过 Docker Volume 持久化，不写入镜像。
- 预置 Skill 只读挂载，项目 Skill 可读写。
- docker-compose 新增独立文件，不覆盖 Langfuse 配置。

### 6.2 性能

- 单次 Skill 评估超时由配置控制（默认 300 秒）。
- 并发 pi 进程数上限由配置控制（默认 4）。
- 一个评测任务的整批样本由一个 pi 进程处理，避免逐样本冷启动。

### 6.3 安全

- Skill 名称校验防止路径穿越。
- Skill 目录权限受控，以非 root 用户运行。
- pi 子进程运行在容器内，不挂载主机文件系统。
- Skill 内容安全由部署方人工保证。

## 7. 数据来源

| 依赖 | 说明 |
| --- | --- |
| pi-mono | Skill 执行器，作为子进程调用，不部署为独立服务 |
| Langfuse scores | 评分写入目标，复用现有写入链路 |
| pa_evaluators | 评估器存储，扩展 SKILL 类型，不新增表 |
| Docker Volume | Skill 持久化存储 |
