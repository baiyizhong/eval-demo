# Trace 日志页面 — 产品需求文档 (PRD)

> **文档类型**: 反向生成 PRD（基于现有实现）  
> **生成日期**: 2026-07-01  
> **项目**: Agent Eval Platform (AEP)  
> **版本**: v1.0

---

## 1. 产品概述

### 1.1 功能定位

Trace 日志是 AEP 平台的核心可观测性模块，用于展示和管理从 Langfuse 接入的 AI Agent 调用链路数据（Traces）。用户可以通过 Trace 页面查看所有 Agent 调用的详细记录、进行多维过滤搜索、发起人工标注和评估任务，以及将 Trace 数据导出到数据集中进行评测。

### 1.2 用户角色

| 角色 | 描述 | 核心场景 |
|------|------|----------|
| 算法工程师 | 开发和调优 AI Agent | 查看 Trace 详情、分析 token 用量和延迟、筛选高质量/低质量样本 |
| 标注人员 | 负责人工标注和评估 | 从 Trace 筛选样本、发起标注任务、批量加入数据集 |
| 项目经理 | 负责项目管理和监控 | 查看 Trace 概况（总量、平均延迟、多轮占比等） |

### 1.3 入口位置

- 选择项目后，Trace 页面为**默认落地页**（路由: `/project/[id]/traces`）
- 左侧导航栏「可观测性」→「Trace 日志」

---

## 2. 功能需求

### 2.1 指标概览卡片

在页面顶部展示 4 个指标卡片，提供 Trace 数据的宏观统计：

| 编号 | 指标 | 计算方式 | 图标 |
|------|------|----------|------|
| F-2.1.1 | Trace 总数 | 当前筛选条件下所有 Trace 的数量 | 📊 |
| F-2.1.2 | 多轮会话数 | `session_id` 不为空的 Trace 数量 | 💬 |
| F-2.1.3 | 平均端到端延迟 | 所有 Trace 的 `latency` 平均值（自动从秒换算为毫秒） | ⏱️ |
| F-2.1.4 | 深度思考数 | 包含 thinking/reasoning 模式的 Trace 数量 | 🧠 |

**验收标准**:
- 卡片随筛选条件变化实时更新
- 延迟单位以毫秒显示，格式化为 「Xs」或「Xms」
- 支持空状态（无数值时显示「-」）

---

### 2.2 搜索与筛选

#### 2.2.1 自由文本搜索

| 编号 | F-2.2.1 |
|------|----------|
| 描述 | 提供一个搜索输入框，支持对 Trace 的多个字段进行模糊匹配 |
| 搜索范围 | Trace ID、Trace 名称、思考模式、会话模式、session_id、user_id |
| 交互 | 输入时实时过滤，大小写不敏感 |

#### 2.2.2 环境筛选

| 编号 | F-2.2.2 |
|------|----------|
| 描述 | 下拉选择框，按 `environment` 字段筛选 Trace |
| 选项 | 全部、default、生产、预发 |
| 默认值 | 全部 |

#### 2.2.3 高级筛选

| 编号 | F-2.2.3 |
|------|----------|
| 描述 | 可折叠的高级筛选面板，支持动态添加多个筛选条件 |
| 可筛选字段 | Trace 名称、Trace ID、环境、思考模式、会话模式、端到端延迟(ms)、首字响应(ms) |
| 运算符 | 包含 / 等于 / 不等于 / 大于 / 小于（根据字段类型动态调整可用运算符） |
| 交互 | 点击「高级筛选」按钮展开/收起面板，面板右上角显示当前生效的筛选条件数量徽标 |

**筛选字段详情**:

| 字段 | 中文标签 | 类型 | 可用运算符 | 数据来源 |
|------|----------|------|------------|----------|
| name | Trace 名称 | 文本 | contains, equals, notEquals | `trace.name` |
| id | Trace ID | 文本 | contains, equals, notEquals | `trace.id` |
| environment | 环境 | 文本 | contains, equals, notEquals | `trace.environment` |
| thinkingMode | 思考模式 | 文本 | contains | 元数据推理：「深度思考」/「默认」 |
| sessionMode | 会话模式 | 文本 | equals | 有 session_id →「多轮会话」，无 →「单轮」 |
| endToEndLatency | 端到端时长 ms | 数值 | gt, lt | `trace.latency`（自动秒→毫秒换算） |
| firstTokenLatency | 首字响应 ms | 数值 | gt, lt | `metadata.first_token_latency_ms` 或 `metadata.ttft` |

**筛选条件展示**:
- 每个生效的筛选条件以芯片（Chip）样式展示在筛选面板下方
- 芯片显示「字段名 运算符 值」，可点击 × 单独移除

#### 2.2.4 快捷筛选预设

| 预设名称 | 条件 |
|----------|------|
| 高延迟 | endToEndLatency > 3000ms |
| 多轮会话 | sessionMode = 多轮会话 |

**交互**: 点击按钮一键应用，再次点击取消。

#### 2.2.5 筛选重置

清空所有筛选条件（搜索文本 + 环境 + 高级筛选），恢复默认状态。

---

### 2.3 Trace 列表（表格视图）

#### 2.3.1 表格列

| 列名 | 数据源 | 渲染方式 |
|------|--------|----------|
| 复选框 | - | 选中/未选中/半选 |
| Trace | `trace.name` + `trace.id` | 名称（加粗）+ ID（灰色小字，带复制按钮） |
| 环境 | `trace.environment` | 文本（默认显示 "default"） |
| 思考模式 | 元数据推理 | 紫色徽章：「深度思考」/ 灰色徽章：「默认」 |
| 会话模式 | session_id 有无 | 文本：「多轮会话」/「单轮」 |
| 首字响应 | `metadata.first_token_latency_ms` | 格式化毫秒数 |
| 端到端延迟 | `trace.latency` | 格式化毫秒数 + 时钟图标 |
| 创建时间 | `trace.created_at` | zh-CN 本地化日期格式 |

#### 2.3.2 分页

| 编号 | F-2.3.2 |
|------|----------|
| 描述 | 分页展示 Trace 列表 |
| 每页数量 | 20 条 |
| 交互 | 页码按钮（最多显示 5 个）、上一页/下一页按钮 |
| 行为 | 筛选条件变化时自动重置到第 1 页 |

#### 2.3.3 行选中

| 编号 | F-2.3.3 |
|------|----------|
| 描述 | 支持单行选中和多行批量选中 |
| 全选交互 | 表头复选框支持全选/取消全选，部分选中时显示半选状态 |
| 选中计数 | 工具栏显示「已选 N」 |
| 清空选中 | 点击「清空」按钮取消所有选中 |
| 行点击行为 | 点击行（非复选框区域）打开详情面板；点击复选框仅切换选中状态 |

---

### 2.4 Trace 详情面板（侧边抽屉）

点击 Trace 行后，从右侧滑出详情面板，展示该 Trace 的完整信息。

#### 2.4.1 面板头部

| 元素 | 说明 |
|------|------|
| Trace 名称 | 大号标题 |
| Trace ID | 灰色小字，带复制按钮 |
| 环境徽章 | 环境标签 |
| 创建日期 | 格式化日期 |
| 刷新按钮 | 重新加载详情数据 |
| 关闭按钮 | 关闭抽屉 |

#### 2.4.2 指标条

在头部下方展示 4 个关键指标：

| 指标 | 数据源 | 格式 |
|------|--------|------|
| 端到端延迟 | `trace.latency` | 格式化毫秒数 |
| 首字响应 | `metadata.first_token_latency_ms` / `metadata.ttft` | 格式化毫秒数 |
| 思考模式 | 元数据推理 | 「深度思考」/「默认」 |
| 会话模式 | session_id 有无 | 「多轮会话」/「单轮」 |

#### 2.4.3 详情标签页

| 标签 | 编号 | 内容描述 |
|------|------|----------|
| **调用链** | F-2.4.1 | Observation 列表（GENERATION/SPAN 类型），每项显示名称、类型图标、层级、开始时间、延迟、成本 |
| **输入** | F-2.4.2 | 格式化的 JSON 代码块 |
| **输出** | F-2.4.3 | 格式化的 JSON 代码块 |
| **元数据** | F-2.4.4 | Key-Value 表格 + Langfuse 元数据 JSON |
| **用量** | F-2.4.5 | Token 用量分解（进度条 + 具体数值），含 Input Tokens / Output Tokens / Total Tokens / Total Cost |
| **评分** | F-2.4.6 | Score 卡片列表，按数值颜色编码（绿/黄/红），显示名称、数值、来源、备注 |
| **Raw** | F-2.4.7 | 原始完整 JSON 数据 |

#### 2.4.4 详情面板操作按钮

| 编号 | 操作 | 描述 |
|------|------|------|
| F-2.4.8 | 加入数据集 | 将当前 Trace 添加到 Langfuse Dataset（弹出编辑弹窗） |
| F-2.4.9 | 发起标注 | 为当前 Trace 创建人工标注任务（弹出配置弹窗） |
| F-2.4.10 | 导出 | 将当前 Trace 详情以 JSON 文件形式下载到本地 |

---

### 2.5 单个 Trace 加入数据集

| 编号 | F-2.5 |
|------|-------|
| 触发方式 | 详情面板点击「加入数据集」按钮 |
| 展示形式 | 模态弹窗 |

**弹窗内容**:

| 元素 | 说明 |
|------|------|
| 数据集选择 | 下拉选择已有数据集，或输入名称创建新数据集 |
| JSON 视图切换 | 切换「格式化」/「压缩」两种 JSON 显示模式 |
| input 编辑 | 可编辑文本框，预填充 Trace 的 input 数据（JSON 格式） |
| expected_output 编辑 | 可编辑文本框，预填充 Trace 的 output 数据（JSON 格式） |
| metadata 编辑 | 可编辑文本框，预填充 Trace 的 metadata 数据（JSON 格式） |
| 数据校验 | 提交前校验 JSON 格式合法性 |

**提交行为**: 调用后端 API 在 Langfuse 对应项目中创建 `dataset_item`，并将 `source_trace_id` 设为当前 Trace ID。

---

### 2.6 单个 Trace 发起标注

| 编号 | F-2.6 |
|------|-------|
| 触发方式 | 详情面板点击「发起标注」按钮 |
| 展示形式 | 模态弹窗 |

**弹窗内容**:

| 元素 | 说明 |
|------|------|
| 标注队列选择 | 下拉选择已有队列，或切换到「创建新队列」模式 |
| 队列名称 | （新建时）输入队列名称 |
| 队列描述 | （新建时）输入队列描述 |
| 评分维度 | （新建时）多选框，预设维度：质量(quality)、准确性(accuracy)、相关性(relevance)、风险(risk) |
| 分配人员 | （新建时）从预设人员列表中选择（六选一或多选） |

**提交行为**: 
- 使用已有队列：直接创建 `AnnotationQueueItem`，`object_type = "TRACE"`
- 创建新队列：先创建 `AnnotationQueue`，再创建 `AnnotationQueueItem`

---

### 2.7 批量操作

#### 2.7.1 批量加入数据集

| 编号 | F-2.7.1 |
|------|----------|
| 触发方式 | 选中多条 Trace → 工具栏「批量加入数据集」按钮 |
| 展示形式 | 模态弹窗 |

**弹窗内容**:

| 元素 | 说明 |
|------|------|
| 数据集选择 | 下拉选择已有数据集，或创建新数据集 |
| 进度展示 | 实时进度条，显示「已完成 N / 总数」 |
| 结果反馈 | 完成后显示成功/失败数量 |

#### 2.7.2 批量发起标注

| 编号 | F-2.7.2 |
|------|----------|
| 触发方式 | 选中多条 Trace → 工具栏「批量标注」按钮 |
| 展示形式 | 模态弹窗 |

**弹窗内容**:

| 元素 | 说明 |
|------|------|
| 标注队列选择 | 下拉选择已有队列，或创建新队列 |
| 队列配置 | （新建时）名称、描述、评分维度（质量/准确性/风险） |
| 无分配人员设置 | 批量标注不设置单个分配人员 |

**提交行为**: 逐条遍历选中的 Trace ID，为每条创建 `AnnotationQueueItem`。完成后汇总成功/失败数量。

---

### 2.8 生成 Trace 测试数据

| 编号 | F-2.8 |
|------|-------|
| 描述 | 在页面头部提供一个「生成 Trace」按钮，点击后在 Langfuse 中创建一条随机测试 Trace |
| 用途 | 用于开发/演示环境快速生成测试数据 |
| 行为 | 调用后端 API，在 Langfuse 中创建一条包含随机查询/响应/元数据的 Trace，成功后自动刷新列表 |

---

### 2.9 数据导出

| 编号 | F-2.9 |
|------|-------|
| 描述 | 在页面头部提供「下载 JSON」按钮 |
| 行为 | 将当前筛选后的完整 Trace 列表以 JSON 文件形式下载到本地 |
| 文件名 | 自动生成，含时间戳 |

---

### 2.10 数据刷新

| 编号 | F-2.10 |
|------|-------|
| 描述 | 页面头部「刷新」按钮 |
| 行为 | 重新加载 Trace 列表，保持当前筛选条件不变 |

---

### 2.11 通知提示

| 编号 | F-2.11 |
|------|-------|
| 描述 | 操作成功/失败后显示通知条 |
| 类型 | 成功（绿色）、失败（红色） |
| 自动消失 | 2600ms 后自动消失 |

---

## 3. 非功能需求

### 3.1 性能

| 编号 | 需求 |
|------|------|
| NF-3.1.1 | Trace 列表首次加载时间 < 2s（项目下 Trace 数 < 500 条时） |
| NF-3.1.2 | 搜索/筛选响应时间 < 300ms（前端本地过滤） |
| NF-3.1.3 | 详情面板打开时间 < 1s |
| NF-3.1.4 | 列表请求不展开 scores 字段以优化性能（列表查询为 50 条限制，详情查询才展开） |

### 3.2 兼容性

| 编号 | 需求 |
|------|------|
| NF-3.2.1 | 支持 Chrome、Edge、Safari 最新两个版本 |

### 3.3 数据一致性

| 编号 | 需求 |
|------|------|
| NF-3.3.1 | 日期时间统一以 zh-CN 格式展示 |
| NF-3.3.2 | 延迟数据自动检测单位（秒/毫秒）并转换：若 latency < 100 视为秒，自动 ×1000 转为毫秒显示 |
| NF-3.3.3 | Trace 数据来源于 Langfuse，后端仅做代理转发，不自行存储 |

---

## 4. 数据模型

### 4.1 Trace（来自 Langfuse API）

| 字段 | 类型 | 描述 |
|------|------|------|
| id | string | Trace 唯一标识 |
| name | string | Trace 名称 |
| project_id | string | 所属项目 ID |
| created_at | string (ISO 8601) | 创建时间 |
| updated_at | string (ISO 8601) | 更新时间 |
| timestamp | string (ISO 8601) | 时间戳 |
| environment | string | 环境标识（default/生产/预发） |
| session_id | string? | 会话 ID（多轮场景） |
| user_id | string? | 用户 ID |
| release | string? | 版本发布号 |
| version | string? | 版本号 |
| public | boolean | 是否公开 |
| bookmarked | boolean | 是否收藏 |
| tags | string[] | 标签列表 |
| input | any (JSON) | 输入数据 |
| output | any (JSON) | 输出数据 |
| metadata | object | 元数据（含 thinking_mode, first_token_latency_ms 等） |
| latency | number | 端到端延迟（秒） |
| total_cost | number | 总费用 |
| usage | object | Token 用量详情 |
| scores | Score[] | 评分列表 |
| observations | Observation[] | 调用链节点 |

### 4.2 TraceScore

| 字段 | 类型 | 描述 |
|------|------|------|
| id | string | 评分 ID |
| name | string | 评分名称 |
| value | number | 数值评分 |
| string_value | string? | 文本评分 |
| data_type | string | 数据类型（NUMERIC/CATEGORICAL/BOOLEAN） |
| source | string | 来源（manual/auto） |
| comment | string? | 备注 |
| created_at | string | 创建时间 |

### 4.3 TraceObservation

| 字段 | 类型 | 描述 |
|------|------|------|
| id | string | 节点 ID |
| name | string | 节点名称 |
| type | string | 类型（GENERATION/SPAN） |
| level | string | 层级 |
| status_message | string? | 状态信息 |
| start_time | string | 开始时间 |
| end_time | string | 结束时间 |
| latency | number | 延迟 |
| model | string? | 模型名称 |
| input | any | 输入 |
| output | any | 输出 |
| metadata | object | 元数据 |
| usage | object | Token 用量 |
| cost | number? | 费用 |

### 4.4 PipelineTask（后端模型）

用于将 Trace 与评测/标注流程关联：

| 字段 | 类型 | 描述 |
|------|------|------|
| id | string | 任务 ID |
| org_id | string | 组织 ID |
| langfuse_trace_id | string | 关联的 Langfuse Trace ID |
| langfuse_score | number? | Langfuse 评分 |
| openjudge_score | number? | OpenJudge 评分 |
| status | enum | 状态（pending_annotation/...） |
| annotated_score | number? | 人工标注评分 |
| trace_data | JSON | Trace 快照数据 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 4.5 PAEvalTrace（预留模型）

独立的 PA 评测 Trace 表 `_pa_eval_traces`，当前已定义但尚未接入 API：
- id, project_id, org_id, name, query, response, score, extra_data, created_at

---

## 5. API 接口

### 5.1 Trace 列表

```
GET /api/pipeline/traces?projectId={project_id}
```

**响应**: `TraceRow[]`（列表查询不展开 scores 和 observations，限制 50 条）

### 5.2 Trace 详情

```
GET /api/pipeline/traces/{trace_id}?projectId={project_id}
```

**响应**: `TraceDetail`（包含完整 scores、observations、usage 等）

### 5.3 生成测试 Trace

```
POST /api/pipeline/generate-trace?projectId={project_id}
```

**描述**: 在 Langfuse 中创建一条随机测试 Trace

### 5.4 创建数据集条目（来自 Trace）

```
POST /api/pipeline/traces/{trace_id}/dataset-items?projectId={project_id}
```

**请求体**:
```json
{
  "dataset_name": "my_dataset",
  "dataset_description": "optional",
  "create_dataset_if_missing": true,
  "input": {},
  "expected_output": {},
  "metadata": {}
}
```

### 5.5 批量创建数据集条目

```
POST /api/pipeline/traces/batch/dataset-items?projectId={project_id}
```

**请求体**:
```json
{
  "trace_ids": ["id1", "id2"],
  "dataset_name": "my_dataset",
  "dataset_description": "optional",
  "create_dataset_if_missing": true
}
```

### 5.6 创建标注任务（来自 Trace）

```
POST /api/pipeline/traces/{trace_id}/annotation-tasks?projectId={project_id}
```

**请求体**:
```json
{
  "name": "annotation task name",
  "description": "description",
  "assigned_to": "张三",
  "dimensions": [{"name": "quality", "data_type": "NUMERIC", "min_value": 0, "max_value": 10}]
}
```

### 5.7 评估 Trace

```
POST /api/pipeline/traces/{trace_id}/evaluate?projectId={project_id}
```

**描述**: 使用 OpenJudge 评估器对 Trace 进行自动评分

### 5.8 标注队列（V2 API）

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/v2/annotation-queues?projectId={id}` | 获取标注队列列表（分页） |
| GET | `/api/v2/annotation-queues/{queue_id}?projectId={id}` | 获取单个队列详情 |
| POST | `/api/v2/annotation-queues?projectId={id}` | 创建标注队列 |
| GET | `/api/v2/annotation-queues/{queue_id}/items?projectId={id}` | 获取队列中的标注项（含 Trace 数据） |
| POST | `/api/v2/annotation-queues/{queue_id}/items?projectId={id}` | 向队列添加标注项 |

### 5.9 数据集（V2 API）

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/v2/datasets?projectId={id}` | 获取数据集列表 |
| GET | `/api/v2/datasets/{id}/items?projectId={p}` | 获取数据集条目（含 source_trace_id） |

---

## 6. 用户交互流程

### 6.1 主流程：浏览和筛选 Trace

```
进入项目 → 自动加载 Trace 列表 → 
查看指标卡片 → 
使用搜索框/筛选器缩小范围 → 
点击行查看详情 → 
在详情面板切换标签页查看不同维度 →
关闭详情面板
```

### 6.2 子流程：Trace → 数据集

```
在列表选中 Trace 或在详情面板点击「加入数据集」→
弹出编辑弹窗 → 选择/创建数据集 → 
编辑 input/expected_output/metadata JSON → 
切换格式化/压缩视图检查数据 → 提交 →
Trace 数据写入 Langfuse Dataset（含 source_trace_id 关联）
```

### 6.3 子流程：Trace → 人工标注

```
在列表选中 Trace(s) 或在详情面板点击「发起标注」→
弹出配置弹窗 → 选择已有队列或创建新队列 →
（新建时）配置评分维度和分配人员 → 提交 →
创建 AnnotationQueueItem（object_type = "TRACE"）
```

### 6.4 子流程：批量操作

```
在列表勾选多条 Trace → 工具栏显示「已选 N」→
点击「批量标注」或「批量加入数据集」→
弹出对应配置弹窗 → 提交 → 
逐条处理，进度展示 → 完成后反馈成功/失败数
```

---

## 7. UI/UX 规格

### 7.1 布局

```
┌─────────────────────────────────────────────────────────┐
│  PageHeader: Trace 日志 [下载JSON] [刷新] [生成Trace]      │
├───────────┬─────────────────────────────────────────────┤
│ MetricCard│ MetricCard │ MetricCard │ MetricCard         │
├───────────┴─────────────────────────────────────────────┤
│ [🔍 搜索...] [环境 ▼] [高级筛选(N)] [已选 0] [批量标注] ... │
│ [芯片: 高延迟 ×] [芯片: 多轮会话 ×]                       │
├─────────────────────────────────────────────────────────┤
│ ☐ │ Trace        │ 环境  │ 思考模式 │ 会话模式 │ ...    │
│ ☐ │ trace-xxx    │ prod  │ 深度思考 │ 多轮会话 │ ...    │
│ ☐ │ trace-yyy    │ default│ 默认    │ 单轮     │ ...    │
├─────────────────────────────────────────────────────────┤
│                    ◀ 1 2 3 4 5 ▶                        │
└─────────────────────────────────────────────────────────┘
                          ↓ 点击行
┌──────────────────────┬──────────────────────────────────┐
│   Trace 列表         │  详情面板 (右侧滑出)               │
│   (自适应缩小)        │  ┌──────────────────────────┐    │
│                      │  │ 名称 | ID | 复制 | 关闭   │    │
│                      │  ├──────────────────────────┤    │
│                      │  │ ⏱️ 1.2s | 🚀 300ms | ... │    │
│                      │  ├──────────────────────────┤    │
│                      │  │ [调用链][输入][输出]...   │    │
│                      │  │                          │    │
│                      │  │ (标签页内容)              │    │
│                      │  │                          │    │
│                      │  ├──────────────────────────┤    │
│                      │  │ [加入数据集] [发起标注] [导出] │   │
│                      │  └──────────────────────────┘    │
└──────────────────────┴──────────────────────────────────┘
```

### 7.2 视觉规格

| 元素 | 规格 |
|------|------|
| 深度思考徽章 | 紫色背景（purple-100）+ 紫色文字 |
| 默认思考徽章 | 灰色背景 |
| 评分颜色编码 | 绿（≥7）、黄（4-7）、红（<4） |
| Observation 类型图标 | GENERATION → 🤖，SPAN → 📡 |
| 加载状态 | 旋转加载动画 |
| 空状态 | 表格显示「暂无数据」 |
| 复制按钮 | 点击后显示「已复制」提示 |

### 7.3 键盘和交互

| 操作 | 行为 |
|------|------|
| 点击行 | 打开详情面板 |
| 点击复选框 | 仅切换选中状态，不打开详情 |
| 点击表头复选框 | 全选/取消全选（支持半选状态） |
| 点击筛选芯片 × | 移除单个筛选条件 |
| 详情面板关闭 | 点击 × 按钮或点击遮罩层 |

---

## 8. 技术架构

### 8.1 数据流

```
Langfuse (ClickHouse/PostgreSQL)
        ↕ HTTP API (project-scoped API keys)
PA-Eval Backend (FastAPI)
        ↕ REST API (JSON)
PA-Eval Frontend (Next.js 14, "use client")
```

### 8.2 后端代理机制

- 后端不直接操作 Langfuse 数据库
- 通过 `langfuse_project_request()` 函数代理转发 Langfuse 公有 API
- 认证方式：使用 ProjectApiKeyManager 管理的项目级 API Key
- Trace 详情数据经过 `normalize_trace_detail()` / `normalize_score()` / `normalize_observation()` 函数标准化处理

### 8.3 前端状态管理

| 状态 | 管理方式 |
|------|----------|
| Trace 列表 | 组件内 useState |
| 选中状态 | Set<string> |
| 筛选条件 | useState |
| 分页 | useState（筛选变化时重置） |
| 详情面板 | useState（selectedTraceId） |
| 弹窗显隐 | useState |

### 8.4 关键依赖

| 层级 | 依赖 |
|------|------|
| 前端 | Next.js 14, React, Tailwind CSS |
| 后端 | FastAPI, SQLAlchemy, httpx (Langfuse API 代理) |
| 外部服务 | Langfuse (观测数据存储和 API) |

---

## 9. 版本历史

| 版本 | 日期 | 变更说明 |
|------|------|----------|
| v1.0 | 2026-07-01 | 初始版本（基于现有实现反向生成） |
