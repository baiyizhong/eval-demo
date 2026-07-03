# 自动评测与评测报告模块前端交互设计

日期：2026-07-03

## 背景

本设计基于 `docs/prd/自动评测模块需求_updated.md` 和 `docs/prd/评测报告模块需求描述.md`，面向 `pa-eval-frontend` 中“应用评测 / 自动评测”和“应用评测 / 评测报告”子页面。本期只考虑前端 UI mock 开发，不接入真实后端接口，不修改 `pa-eval-backend/`、`langfuse/` 或数据库结构。

自动评测模块用于在项目内创建、查看、管理和重新运行自动评测任务。评测报告模块用于承载自动评测任务和人工评测任务完成后的报告列表、报告详情、导出、重新生成和数据回流操作。

两者都是“应用评测”的子页面。自动评测任务详情不直接展示完整报告正文，只展示最新报告摘要、生成状态和“查看报告”入口；点击后跳转到评测报告详情页。

## 目标

- 在“应用评测”下新增“自动评测”二级导航入口。
- 提供自动评测任务列表，支持状态统计、名称搜索、状态筛选、刷新、删除和重新跑。
- 点击任务名称、列表行或“查看详情”进入自动评测任务详情页。
- 详情页展示任务配置、运行记录、结果摘要和最新报告入口，不承载完整报告正文。
- 任务运行完成且报告状态为 `READY` 后，允许从任务详情跳转到报告详情页。
- 在“应用评测”下新增“评测报告”子页面，支持报告列表和报告详情 UI mock。
- 报告详情展示摘要、指标、分布、badcase、全量评测数据、回流操作和回流历史。
- 新建自动评测任务使用三步独立页面：基础信息、选择评估器、选择评测数据与运行配置。
- 所有数据、状态变化、成功失败反馈均由前端 mock 实现，不依赖真实后端。

## 非目标

- 不接入真实 Langfuse Evaluators、Evaluation Rules、Job Executions、Scores 或 Datasets API。
- 不新增或修改 Plus 层后端接口。
- 不新增数据库表、Alembic 迁移或 Langfuse 表结构调整。
- 不实现真实任务调度、真实评分执行、真实 badcase 收集。
- 不实现评估器新建、编辑、调试。
- 报告导出、重新生成和回流仅做前端 mock 交互，不接真实接口。
- 不实现报告版本对比、多人批注。
- 不实现真实权限控制，只保留前端权限位和禁用态占位。

## 方案比较

### 方案 A：复用 `app-evaluation` 模块，新增自动评测和评测报告子页面

在现有 `src/modules/app-evaluation` 内扩展类型、mock 数据、mock API、组件和 view。自动评测与评测报告路由都挂在 `projects/:projectId/evaluation` 子路由下，导航复用并扩展 `EvaluationPageNav`。

优点：

- 与现有“数据集”“人工评测”保持同一业务模块、同一页面容器和同一导航语义。
- 自动评测详情和报告详情通过报告 ID 关联，职责清晰，避免把报告能力塞进任务详情页。
- 可直接复用 `Page fixed fluid`、`EvaluationPageNav`、`DataTable`、`PageAction`、`confirm`、`toast`、`Loading` 等现有模式。
- mock API/data 的组织方式与人工评测、数据集一致，后续接真实接口时边界清晰。

代价：

- `app-evaluation` 模块文件数量继续增加，需要通过 views、components、data、api 分层控制复杂度。

### 方案 B：新建 `auto-evaluation` 和 `evaluation-report` 独立模块

新建 `src/modules/auto-evaluation` 和 `src/modules/evaluation-report`，仅把路由挂到应用评测路径下。

优点：

- 自动评测和报告文件天然隔离。

代价：

- 业务上仍属于“应用评测”，跨模块维护导航、路径、报告来源类型和共享 mock 数据会变复杂。
- 与现有数据集、人工评测的模块组织不一致。

### 方案 C：自动评测详情内嵌完整报告

自动评测详情页直接内嵌完整评测报告正文。

优点：

- 从任务进入报告路径短。

代价：

- 与“评测报告”作为应用评测子页面的需求冲突。
- 人工评测报告也需要同一套报告详情、回流和导出能力，内嵌在自动评测详情会导致能力重复。

## 推荐方案

采用方案 A。自动评测使用独立新建页面；评测报告作为“应用评测”的独立子页面；自动评测详情通过报告摘要卡跳转到报告详情。

页面层级：

```text
/projects/:projectId/evaluation/auto-evaluations
/projects/:projectId/evaluation/auto-evaluations/new
/projects/:projectId/evaluation/auto-evaluations/:taskId
/projects/:projectId/evaluation/reports
/projects/:projectId/evaluation/reports/:reportId
```

实现位置：

```text
pa-eval-frontend/src/modules/app-evaluation/
  api/
    mock-auto-evaluation-api.ts
    mock-evaluation-report-api.ts
  components/
    auto-evaluation-columns.tsx
    auto-evaluation-row-actions.tsx
    auto-evaluation-status-badge.tsx
    auto-evaluation-summary-cards.tsx
    auto-evaluation-run-records.tsx
    auto-evaluation-report-card.tsx
    auto-evaluation-task-form.tsx
    evaluation-report-columns.tsx
    evaluation-report-status-badge.tsx
    evaluation-report-summary.tsx
    evaluation-report-flowback-dialog.tsx
  data/
    mock-auto-evaluations.ts
    mock-evaluation-reports.ts
  views/
    auto-evaluations.tsx
    auto-evaluation-new.tsx
    auto-evaluation-detail.tsx
    evaluation-reports.tsx
    evaluation-report-detail.tsx
  types.ts
```

只新增当前模块私有文件；不新增全局组件，除非实现过程中发现已有多个模块稳定复用的能力。

## 信息架构

“应用评测”二级导航调整为：

- 数据集：现有页面。
- 人工评测：现有页面。
- 自动评测：新增页面，负责任务管理、任务详情和重新运行。
- 评测报告：新增页面，负责报告列表、报告详情、导出、重新生成和数据回流。

自动评测内部包含三层：

1. 任务列表：管理自动评测任务、查看运行状态、执行删除和重新跑。
2. 新建任务：三步流程创建自动评测任务，可创建并运行或仅创建。
3. 任务详情：展示配置、运行记录、状态概览和最新报告入口。

评测报告内部包含两层：

1. 报告列表：展示自动评测和人工评测生成的报告，支持筛选、搜索、导出、重新生成和回流入口。
2. 报告详情：展示报告正文、badcase 明细、全量评测数据、回流操作区和回流历史。

`EvaluationPageNav` 增加“自动评测”和“评测报告”链接。active 判断分别使用 `/auto-evaluations` 和 `/reports` 路径前缀，进入自动评测详情时保持“自动评测”高亮，进入报告详情时保持“评测报告”高亮。

## 路由与导航

### 路由接入

在 `src/routes/index.tsx` 的 `projects/:projectId/evaluation` children 下新增：

```tsx
{ path: 'auto-evaluations', element: <ProjectAutoEvaluations /> }
{ path: 'auto-evaluations/new', element: <ProjectAutoEvaluationNew /> }
{ path: 'auto-evaluations/:taskId', element: <ProjectAutoEvaluationDetail /> }
{ path: 'reports', element: <ProjectEvaluationReports /> }
{ path: 'reports/:reportId', element: <ProjectEvaluationReportDetail /> }
```

`AppEvaluationIndexRedirect` 继续默认跳转到 `datasets`。自动评测和评测报告通过二级导航进入，不改变现有默认页行为。

### 页面容器

全部页面位于 `SidebarLayout` 下：

- 列表页：`Page fixed fluid` + `EvaluationPageNav` + 状态统计 + `DataTable`。
- 新建页：`Page fixed fluid` + `PageAction` 返回区 + Stepper + 三步表单主体 + 固定底部操作区。
- 自动评测详情页：`Page fixed fluid` + `PageAction` 返回区 + 概览 + 配置 + 运行记录 + 最新报告卡片。
- 报告列表页：`Page fixed fluid` + `EvaluationPageNav` + `DataTable`。
- 报告详情页：`Page fixed fluid` + `PageAction` 返回区 + 摘要 + 报告内容 Tabs + 回流弹窗。

## 数据模型

在 `src/modules/app-evaluation/types.ts` 中补充自动评测和评测报告相关类型。

核心类型：

```ts
type AutoEvaluationTaskStatus =
  | 'DRAFT'
  | 'READY'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'

type AutoEvaluationTaskRecord = {
  id: string
  projectId: string
  name: string
  description: string
  scoreName: string
  status: AutoEvaluationTaskStatus
  evaluator: AutoEvaluationEvaluatorSummary
  dataSource: AutoEvaluationDataSourceSummary
  sampleRate: number
  executionStats: AutoEvaluationExecutionStats
  badcaseCount: number
  createdBy: string
  createdAt: string
  lastRunAt: string
  updatedAt: string
  latestReport?: AutoEvaluationLatestReportSummary
}
```

补充类型：

- `AutoEvaluationEvaluatorRecord`：评估器列表和变量信息。
- `AutoEvaluationDatasetOption`：新建流程中的数据集选项。
- `AutoEvaluationTraceFilterInput`：Trace 过滤条件。
- `AutoEvaluationRunRecord`：运行记录。
- `AutoEvaluationLatestReportSummary`：自动评测任务详情中的最新报告摘要。
- `EvaluationReportRecord`：报告列表记录，覆盖自动评测和人工评测来源。
- `EvaluationReportDetailRecord`：报告详情结构化内容。
- `EvaluationReportFlowbackRecord`：报告回流历史。
- `AutoEvaluationTaskFormInput`：新建任务表单输入。

状态文案集中维护：

```ts
autoEvaluationStatusLabels
autoEvaluationStatusBadgeVariants
autoEvaluationDataSourceLabels
autoEvaluationEvaluatorTypeLabels
evaluationReportSourceTypeLabels
evaluationReportStatusLabels
```

## Mock 数据与数据流

### 文件组织

```text
data/mock-auto-evaluations.ts
data/mock-evaluation-reports.ts
api/mock-auto-evaluation-api.ts
api/mock-evaluation-report-api.ts
```

`data` 只存静态 mock 种子数据，不放业务逻辑。自动评测任务查询、创建、删除、重新跑、刷新状态流转统一放到 `api/mock-auto-evaluation-api.ts`。报告列表、报告详情、导出、重新生成和回流 mock 统一放到 `api/mock-evaluation-report-api.ts`。

### Mock API

建议提供以下函数：

- `listProjectAutoEvaluationTasksMock(projectId, query, statusFilter)`：分页、搜索、状态筛选。
- `getProjectAutoEvaluationTaskMock(projectId, taskId)`：详情。
- `getProjectAutoEvaluationTaskSummaryMock(projectId)`：列表顶部统计。
- `listProjectAutoEvaluationRunsMock(projectId, taskId)`：运行记录。
- `getProjectAutoEvaluationLatestReportMock(projectId, taskId)`：任务最新报告摘要，仅用于任务详情入口。
- `listProjectAutoEvaluationEvaluatorsMock(projectId, keyword)`：评估器选择。
- `listProjectAutoEvaluationDatasetsMock(projectId, keyword)`：数据集选择。
- `estimateProjectAutoEvaluationTraceCountMock(projectId, input)`：Trace 命中预估。
- `createProjectAutoEvaluationTaskMock(projectId, input, mode)`：创建任务。
- `deleteProjectAutoEvaluationTaskMock(projectId, taskId)`：删除任务。
- `rerunProjectAutoEvaluationTaskMock(projectId, taskId)`：重新跑。
- `refreshProjectAutoEvaluationTaskMock(projectId, taskId)`：刷新单任务状态。
- `refreshProjectAutoEvaluationTasksMock(projectId)`：刷新列表状态。

报告 mock API：

- `listProjectEvaluationReportsMock(projectId, query)`：报告列表，支持分页、搜索、来源类型、状态、生成时间、是否存在 badcase 筛选。
- `getProjectEvaluationReportMock(projectId, reportId)`：报告详情。
- `regenerateProjectEvaluationReportMock(projectId, reportId)`：重新生成报告，mock 状态从 `GENERATING` 流转到 `READY` 或 `FAILED`。
- `exportProjectEvaluationReportMock(projectId, reportId, format)`：导出报告 mock，优先生成 Markdown。
- `listProjectEvaluationReportBadcasesMock(projectId, reportId, query)`：badcase 明细表。
- `listProjectEvaluationReportItemsMock(projectId, reportId, query)`：全量评测数据表。
- `previewProjectEvaluationReportFlowbackMock(projectId, reportId, input)`：回流预览。
- `createProjectEvaluationReportFlowbackMock(projectId, reportId, input)`：执行回流。
- `listProjectEvaluationReportFlowbacksMock(projectId, reportId)`：回流历史。

### 状态流转

重新跑或创建并运行后：

1. 任务状态立即置为 `RUNNING`。
2. 新增一条 `RUNNING` 运行记录。
3. 任务详情的最新报告卡片切换为“运行中，暂不可查看最新报告”。
4. 通过刷新按钮或 mock 定时器推进状态。
5. mock 可按固定规则进入 `COMPLETED` 或 `FAILED`，用于覆盖成功和失败状态。
6. 任务进入 `COMPLETED` 后，mock 自动创建或更新一条 `sourceType = AUTO_EVAL` 的报告摘要；报告状态可先为 `GENERATING`，刷新后进入 `READY`。

为避免页面自动跳动，本期推荐以“刷新按钮推进状态”为主，必要时在详情页使用短定时器模拟一次进度变化。

## 列表页设计

### 页面目标

列表页是自动评测任务工作台，用于快速判断当前项目下任务运行状态，并执行高频管理操作。

### 布局

页面结构：

1. `EvaluationPageNav`：右侧按钮“新建自动评测”。
2. 标题和说明可放在页面主体顶部，文案保持简洁。
3. 状态统计区：一行轻量统计卡或 segmented summary。
4. 表格区：`DataTable` 承载搜索、状态筛选、列显隐、分页、空态和加载态。

外层使用：

```tsx
<Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
```

主体区使用 `flex min-h-0 flex-1 flex-col gap-4`，表格 section 使用现有列表页规范的 `rounded-lg border bg-card p-4 text-card-foreground`。

### 状态统计

统计项：

- 全部。
- 运行中。
- 已完成。
- 失败。
- 未运行。
- Badcase。

交互：

- 点击统计项写入页面状态并驱动表格 queryKey。
- 再次点击当前统计项取消状态过滤。
- 搜索词和状态过滤组合生效。
- Badcase 统计只作为总览，不建议作为默认过滤；如实现过滤，则筛选 `badcaseCount > 0` 的已完成任务。

### 表格能力

表格复用 `DataTable<AutoEvaluationTaskRecord>`：

- URL 状态：`page`、`pageSize`、`keyword`、`status`。
- 搜索 placeholder：`搜索任务名称`。
- toolbar filters：状态筛选。
- loading 文案：`加载自动评测任务中...`。
- 空态：
  - 无任务：`暂无自动评测任务`，提供“新建自动评测”按钮。
  - 搜索无结果：`未找到匹配的自动评测任务`。

默认列：

- 任务名称：主文本点击进入详情，副文本展示描述摘要。
- 状态：`AutoEvaluationStatusBadge`。
- 评估器：名称、类型、版本。
- 数据来源：数据集或 Trace 过滤，展示样本量。
- 采样率：百分比。
- 执行结果：成功、失败、待执行数量。
- Badcase：数量。
- 最近运行：未运行展示 `-`。
- 创建人。
- 操作：查看详情、重新跑、删除。

行交互：

- 任务名称为可聚焦链接。
- 整行可点击进入详情；操作列点击需要阻止行跳转。
- 列最小宽度建议 `1280`，保持信息密度可读。

### 刷新

刷新入口放在 `EvaluationPageNav` 右侧按钮组或表格工具栏附近，使用 `RefreshCw` 图标。

规则：

- 点击后表格进入短暂 loading。
- 调用 `refreshProjectAutoEvaluationTasksMock` 推进运行中任务展示状态。
- 成功 toast：`自动评测任务已刷新`。
- 失败 toast：`刷新失败，请稍后重试`，保留当前数据。

### 删除

删除使用 `confirm`，不使用浏览器原生确认框。

规则：

- `RUNNING` 状态禁用删除，点击时 toast warning：`任务运行中，暂不支持删除`。
- 确认文案说明只删除前端 mock 任务，不删除真实 trace、score 或 dataset 数据。
- 删除成功后 invalidate 列表 query，并提示：`自动评测任务已删除`。
- 删除当前页最后一条后，依赖 `DataTable` 重新请求；如当前页无数据，业务层回退到上一页。

### 重新跑

重新跑入口在列表行操作和详情页操作区。

规则：

- `RUNNING` 禁用。
- 其他状态可重新跑。
- 操作前 confirm，说明运行期间暂不可查看最新报告。
- 确认后状态置为 `RUNNING`，新增运行记录，最新报告卡片切换为“运行中，暂不可查看最新报告”。
- 成功 toast：`自动评测任务已开始运行`。

## 新建任务页设计

### 页面目标

通过三步流程创建 mock 自动评测任务。创建完成后可回到列表，也可进入详情页。

### 页面骨架

顶部使用 `PageAction`：

- 返回按钮：返回列表。
- 中间：标题“新建自动评测”和当前步骤摘要。
- 右侧不放主要提交按钮，提交按钮固定在底部操作区。

主体：

- Stepper 展示三步：基础信息、选择评估器、数据与运行配置。
- 当前步骤内容使用模块私有组件拆分。
- 底部固定操作区：
  - 第一步：取消、下一步。
  - 第二步：上一步、下一步。
  - 第三步：上一步、仅创建、创建并运行。

离开确认：

- 若表单已修改，点击取消或返回时使用 `confirm`。
- 确认文案：`当前自动评测任务尚未保存，离开后已填写内容将丢失。`

### Step 1：基础信息

字段：

- 任务名称：必填，Input。
- 任务描述：选填，Textarea。
- Score Name：必填，Input。

校验：

- 任务名称不能为空。
- Score Name 不能为空。
- Score Name 只允许英文、数字、下划线和短横线。
- 任务名称不能与当前 mock 任务完全同名。

### Step 2：选择评估器

页面分为左右两区：

- 左侧：评估器列表，支持名称搜索，单选。
- 右侧：选中评估器摘要和变量映射。

评估器展示字段：

- 名称。
- 类型：`LLM-as-Judge` 或 `Code`。
- 版本。
- 变量列表。
- 更新时间。

变量映射：

- 若评估器包含变量，展示变量映射表单。
- 选项固定为 `trace.input`、`trace.output`、`dataset.input`、`dataset.expectedOutput`。
- 必填变量未映射时不能进入下一步。

### Step 3：数据与运行配置

分三块：数据来源、运行配置、Badcase 配置。

#### 数据来源

使用 Tabs 或 RadioGroup 切换：

- 已有数据集。
- Trace 过滤。

已有数据集：

- 展示 mock 数据集列表。
- 支持数据集名称搜索。
- 单选数据集。
- 展示数据集名称、描述、样本数量、更新时间。
- 选中后展示 `预计评测样本 N 条`。

Trace 过滤：

- 时间范围必填。
- 环境多选。
- Trace Name、User ID、Session ID、Tags 可选。
- 提供“预估数量”按钮。
- 命中数量为 0 时禁止创建，并提示调整过滤条件。

#### 运行配置

字段：

- 采样率：Slider + Input，范围 1%-100%，默认 100%。
- 运行方式：最终提交按钮决定，不额外维护重复字段。

页面展示：

- `预计运行数量 = 预计样本数 * 采样率`，向上取整。

#### Badcase 配置

字段：

- Badcase 收集：Switch，默认关闭。
- 判断分数：开启后必填，默认 Score Name。
- 操作符：开启后必填，小于、小于等于、大于、大于等于、等于。
- 阈值：开启后必填，Number Input。

开启后展示示例：

```text
score <= 0.6 将被标识为 Badcase
```

### 创建完成

`仅创建`：

- 创建任务状态为 `READY`。
- toast：`自动评测任务已创建`。
- 默认跳转到列表页，并保留列表默认状态。

`创建并运行`：

- 创建任务状态为 `RUNNING`。
- 新增运行记录。
- toast：`自动评测任务已创建并开始运行`。
- 推荐跳转到详情页，让用户看到运行状态和报告门槛。

## 自动评测任务详情页设计

### 页面目标

自动评测任务详情页承载任务配置、运行状态、运行记录和最新报告入口。它不展示完整报告正文；报告正文、badcase 明细、全量评测数据和回流操作统一在评测报告详情页展示。

### 页面骨架

顶部使用 `PageAction`：

- 返回按钮：返回列表。
- 中间：任务名称、状态 Badge、描述摘要。
- 右侧按钮：刷新、重新跑、删除。

主体分区：

1. 概览区：样本量、成功数、失败数、badcase 数、最近运行时间。
2. 配置区：基础信息、评估器、变量映射、数据来源、采样率、badcase 规则。
3. 运行记录区：最近运行记录表或列表。
4. 最新报告卡片：按任务状态和报告状态展示入口、摘要或不可查看原因。

### 返回状态保留

列表页搜索、分页、状态筛选通过 URL query 保存。详情返回优先使用 `navigate(-1)`；若无历史来源，则跳转到 `/projects/:projectId/evaluation/auto-evaluations`。

### 操作

刷新：

- 调用 `refreshProjectAutoEvaluationTaskMock`。
- 运行中任务可推进进度。
- 成功 toast：`自动评测任务已刷新`。

重新跑：

- 与列表规则一致。
- 成功后详情页立即切换为 `RUNNING`。
- 最新报告卡片展示运行中提示，不展示“查看报告”主入口。

删除：

- 使用 `confirm`。
- `RUNNING` 禁用。
- 删除成功后返回列表，toast：`自动评测任务已删除`。

### 最新报告卡片展示规则

| 任务状态 / 报告状态 | 任务详情展示 |
| --- | --- |
| 任务 `COMPLETED` 且报告 `READY` | 展示报告标题、生成时间、样本量、badcase 数、核心结论和“查看报告”按钮 |
| 任务 `COMPLETED` 且报告 `GENERATING` | 展示“报告生成中”，提供刷新按钮，不允许跳转查看正文 |
| 任务 `COMPLETED` 且报告 `FAILED` | 展示失败原因摘要和“重新生成报告”入口 |
| 任务 `RUNNING` | `任务正在运行，完成后可生成并查看评测报告。` |
| 任务 `FAILED` | `最近一次运行失败，暂无法生成评测报告。可重新运行任务后再查看。` |
| 任务 `DRAFT` | `任务尚未运行，运行完成后将生成评测报告。` |
| 任务 `READY` | `任务待运行，运行完成后将生成评测报告。` |
| 任务 `CANCELLED` | `任务已取消，可在报告列表查看历史已生成报告。` |

“查看报告”按钮跳转：

```text
/projects/:projectId/evaluation/reports/:reportId
```

如果同一任务有多个报告版本，任务详情默认展示最新一版，次要入口可跳转到报告列表并带上 `sourceTaskId` query。

## 评测报告页面设计

### 报告列表页

报告列表页是“应用评测 / 评测报告”的工作台，展示自动评测和人工评测产生的报告。

页面结构：

1. `EvaluationPageNav`：高亮“评测报告”。
2. 标题区：标题“评测报告”，右侧可放刷新按钮。
3. 表格区：`DataTable<EvaluationReportRecord>`。

表格能力：

- URL 状态：`page`、`pageSize`、`keyword`、`sourceType`、`status`、`hasBadcase`、`generatedAtRange`。
- 搜索 placeholder：`搜索报告或来源任务`。
- toolbar filters：来源类型、报告状态、是否存在 badcase。
- 空态：`暂无评测报告`；筛选无结果：`未找到匹配的评测报告`。

默认列：

- 报告标题：点击进入报告详情。
- 来源类型：自动评测或人工评测。
- 来源任务：任务名称和 ID。
- 报告状态：`GENERATING`、`READY`、`FAILED`。
- 样本数。
- Badcase 数。
- 已回流数。
- 生成时间。
- 操作：查看、导出、重新生成、回流数据。

操作规则：

- 查看：仅 `READY` 状态进入详情；`GENERATING` 展示生成中提示；`FAILED` 展示失败原因。
- 导出：`READY` 状态可用，mock 生成 Markdown 文件。
- 重新生成：二次确认后状态切换为 `GENERATING`，刷新后进入 `READY` 或 `FAILED`。
- 回流数据：可从列表操作进入报告详情并定位到回流区域，避免在列表承载复杂表单。

### 报告详情页

报告详情页展示完整报告内容和回流能力。

顶部使用 `PageAction`：

- 返回按钮：返回报告列表；如果从自动评测详情进入，浏览器历史返回可回到任务详情。
- 中间：报告标题、来源类型、报告状态、生成时间。
- 右侧按钮：导出、重新生成、回流 badcase、回流评测数据。

主体使用 Tabs：

- 概览：报告摘要、任务配置、数据来源、指标定义、总体结果。
- 分析：分组分析、分布分析、风险与限制、改进建议、复现信息。
- Badcase：badcase 明细表，支持勾选、单条回流和批量回流。
- 评测数据：全量评测数据表，支持筛选后回流或勾选回流。
- 回流历史：展示回流批次、目标数据集、数量、状态和失败明细。

报告内容模块：

- 报告摘要：任务名称、生成时间、样本量、核心结论。
- 任务配置：自动评测评估器、采样率、过滤条件，或人工评测评分指标和处理人。
- 数据来源：来源数据集、Trace 过滤条件、样本量、时间范围、环境。
- 指标定义：score name、指标类型、阈值和 badcase 规则。
- 总体结果：样本数、成功数、失败数、平均分、通过率。
- 分组分析：按环境、trace name、数据集、评估器或标注人聚合。
- 分数分布：简易柱状展示或进度条列表。
- Badcase 分析：数量、占比、主要原因、代表样本。
- 代表样本：高分样本、低分样本、边界样本、失败样本。
- 风险与限制：样本覆盖不足、指标限制、评估器误判风险。
- 改进建议：mock 生成的建议文本。
- 复现信息：任务 ID、报告 ID、筛选条件、生成配置。

本期不引入复杂图表，优先使用 `Card`、`Badge`、`DataTable` 或轻量进度条组合。

### Badcase 回流

入口：

- 报告详情顶部“回流 badcase”。
- Badcase tab 顶部批量回流。
- Badcase 明细表单条行操作。

弹窗流程：

1. 选择回流范围：全部 badcase、当前筛选结果、手动勾选。
2. 选择目标数据集：已有数据集或新建数据集。
3. 新建数据集时默认名称：
   - 自动评测：`badcase-自动评测-{任务名称}-{YYYYMMDD}`。
   - 人工评测：`badcase-人工标注-{任务名称}-{YYYYMMDD}`。
4. 选择去重策略：跳过重复或创建新版本。
5. 预览：展示匹配数量、重复数量、预计写入数量。
6. 确认执行：展示成功数、失败数和失败明细。

### 评测数据回流

入口：

- 报告详情顶部“回流评测数据”。
- 评测数据 tab 顶部批量回流。
- 全量评测数据表单条行操作。

范围：

- 全部评测数据。
- 当前筛选结果。
- 仅 badcase。
- 手动勾选。

目标数据集支持选择已有数据集或新建数据集。新建数据集默认名称：

- 自动评测：`评测数据-自动评测-{任务名称}-{YYYYMMDD}`。
- 人工评测：`评测数据-人工标注-{任务名称}-{YYYYMMDD}`。

mock 执行后新增一条回流历史，并更新报告列表和详情中的“已回流数”。

## 组件拆分

### 自动评测列表相关

- `auto-evaluation-columns.tsx`：表格列定义。
- `auto-evaluation-row-actions.tsx`：查看详情、重新跑、删除。
- `auto-evaluation-status-badge.tsx`：状态 Badge。
- `auto-evaluation-summary-cards.tsx`：顶部统计项。

### 新建相关

- `auto-evaluation-task-form.tsx`：三步表单容器。
- `auto-evaluation-basic-step.tsx`：基础信息。
- `auto-evaluation-evaluator-step.tsx`：评估器选择和变量映射。
- `auto-evaluation-run-config-step.tsx`：数据来源、运行配置、badcase 配置。

如果实现时单文件接近 1000 行，继续拆分为更小的 step 私有组件和 hooks。

### 详情相关

- `auto-evaluation-detail-summary.tsx`：概览指标。
- `auto-evaluation-config-section.tsx`：配置区。
- `auto-evaluation-run-records.tsx`：运行记录。
- `auto-evaluation-report-card.tsx`：最新报告摘要、状态和跳转入口。

### 评测报告相关

- `evaluation-report-columns.tsx`：报告列表列定义。
- `evaluation-report-row-actions.tsx`：查看、导出、重新生成、回流入口。
- `evaluation-report-status-badge.tsx`：报告状态 Badge。
- `evaluation-report-source-badge.tsx`：自动评测/人工评测来源 Badge。
- `evaluation-report-summary.tsx`：报告摘要和核心指标。
- `evaluation-report-analysis.tsx`：分组分析、分布、风险和建议。
- `evaluation-report-badcase-table.tsx`：badcase 明细表。
- `evaluation-report-item-table.tsx`：全量评测数据表。
- `evaluation-report-flowback-dialog.tsx`：回流 badcase / 评测数据复用弹窗。
- `evaluation-report-flowback-history.tsx`：回流历史。

## 状态管理

本期不新增全局 Zustand store。

页面状态分层：

- URL query：自动评测列表分页、搜索词、状态筛选；报告列表分页、搜索词、来源类型、报告状态和 badcase 筛选。
- React Query：mock API 查询、刷新和失效。
- 页面本地 state：新建流程步骤、表单草稿、评估器搜索、数据集搜索、trace 预估结果、报告详情 active tab、回流弹窗草稿、回流预览结果。

重新跑、删除、创建、报告重新生成和回流后通过 `queryClient.invalidateQueries` 刷新相关 query。自动评测任务完成后需要同步刷新任务详情的最新报告摘要和报告列表。

## 表单与校验

优先使用现有表单模式和 shadcn/Radix 控件：

- Input、Textarea、Select、RadioGroup、Switch、Tabs、Slider、Badge、Button。
- 表单校验放在 step 提交前，错误展示在字段附近。
- 高影响离开、删除、重新跑使用 `confirm`。
- 报告重新生成、报告导出、回流执行使用 `toast` 和 `confirm` 组合反馈。
- 成功、失败、禁用态提醒使用 `toast`。

校验规则：

- 必填字段为空时阻止进入下一步。
- Score Name 格式不合法时阻止进入下一步。
- 评估器未选择时阻止进入下一步。
- 评估器变量未映射完整时阻止进入下一步。
- 数据来源未选或 trace 命中为 0 时阻止创建。
- 采样率必须在 1 到 100。
- Badcase 开启后，判断分数、操作符、阈值必填，阈值必须是数字。

## 空、加载与异常状态

### 自动评测列表页

- 首次加载：`Loading` 或表格 skeleton。
- 无任务：展示 `暂无自动评测任务` 和“新建自动评测”入口。
- 搜索无结果：展示 `未找到匹配的自动评测任务`。
- 刷新失败：toast error，保留当前数据。
- 删除失败：toast error，保留当前数据。

### 新建页

- 评估器为空：展示空态，禁止进入下一步。
- 数据集为空：数据集 tab 展示空态，可切换 Trace 过滤。
- Trace 命中为 0：禁止创建。
- 未保存离开：confirm。
- 创建失败：停留当前步骤并 toast error。

### 详情页

- 任务不存在：展示业务空态或 Not Found，提供返回列表。
- 运行中：概览展示进度，最新报告卡片提示完成后生成报告。
- 失败：展示失败原因和重新跑入口。
- 已完成且报告 `READY`：展示最新报告摘要和“查看报告”按钮。
- 已完成但报告 `GENERATING`：展示报告生成中。
- 已完成但报告 `FAILED`：展示失败原因和重新生成入口。

### 报告列表页

- 首次加载：`Loading` 或表格 skeleton。
- 无报告：展示 `暂无评测报告`。
- 搜索无结果：展示 `未找到匹配的评测报告`。
- 报告生成中：列表状态 Badge 展示 `GENERATING`，查看按钮禁用或提示生成中。
- 报告生成失败：列表状态 Badge 展示 `FAILED`，提供重新生成入口。

### 报告详情页

- 报告不存在：展示业务空态，提供返回报告列表。
- 报告生成中：展示生成中状态，不展示正文 Tabs。
- 报告生成失败：展示错误摘要和重新生成入口。
- 无 badcase：Badcase tab 展示空态，回流 badcase 按钮禁用。
- 回流预览为空：阻止执行并提示。
- 回流部分失败：保留成功结果，失败明细写入回流历史并展示 toast warning。

## 权限与安全占位

本期不接真实权限，但组件设计保留权限判断入口：

- `canCreateAutoEvaluation`
- `canDeleteAutoEvaluation`
- `canRerunAutoEvaluation`
- `canViewAutoEvaluationReport`
- `canExportEvaluationReport`
- `canRegenerateEvaluationReport`
- `canFlowbackEvaluationReport`
- `canCreateDatasetFromReport`

默认 mock 权限均为 `true`。按钮禁用原因使用 tooltip 或 toast 表达，不隐藏核心入口，便于验收。

不在代码中写入后端 host、密钥、token 或真实内部地址。

## 验收标准

- “应用评测”二级导航出现“自动评测”入口。
- “应用评测”二级导航出现“评测报告”入口。
- `/projects/:projectId/evaluation/auto-evaluations` 可展示 mock 任务列表。
- `/projects/:projectId/evaluation/reports` 可展示自动评测和人工评测 mock 报告列表。
- 列表顶部展示全部、运行中、已完成、失败、未运行、Badcase 统计。
- 点击统计项可筛选列表，再次点击可取消筛选。
- 名称搜索可生效并支持清空。
- 刷新列表有 loading 和 toast 反馈。
- 非运行中任务可删除，删除前有二次确认。
- 运行中任务不可删除，并有明确提示。
- 列表和详情页都支持重新跑。
- 重新跑后任务变为 `RUNNING`，任务详情的最新报告入口不可查看。
- 点击任务名称或行可进入详情页。
- 自动评测详情页不展示完整报告正文，只展示最新报告摘要、生成状态和“查看报告”入口。
- 任务完成且报告 `READY` 时，点击“查看报告”跳转到 `/projects/:projectId/evaluation/reports/:reportId`。
- 报告详情页展示摘要、指标、分布、badcase、全量评测数据、风险限制、改进建议和复现信息。
- 报告详情支持导出 Markdown mock。
- 报告详情支持重新生成报告 mock。
- 报告 badcase 区域支持选择已有数据集或新建数据集后回流。
- 报告全量评测数据支持回流到指定数据集。
- 回流操作有预览、确认、成功失败统计和失败明细。
- 新建自动评测任务为三步流程。
- 新建支持“创建并运行”和“仅创建”。
- 新建成功后列表出现新任务。
- 所有交互只使用前端 mock 数据。
- 不修改 `pa-eval-backend/`、`langfuse/` 或数据库结构。

## 实施顺序建议

1. 扩展类型、mock 数据和 mock API。
2. 扩展 `EvaluationPageNav` 和自动评测、评测报告路由。
3. 实现自动评测任务列表页、统计区、表格列、行操作。
4. 实现自动评测任务详情页和最新报告卡片。
5. 实现评测报告列表页和报告详情页。
6. 实现报告导出、重新生成、badcase 回流、评测数据回流 mock。
7. 实现新建三步页面和表单校验。
8. 补齐空、加载、失败、删除、重新跑、报告生成、回流异常等交互状态。
9. 运行 `npm run typecheck`、`npm run lint`，必要时运行 `npm run build`。

## 自检结论

- 范围聚焦在 `pa-eval-frontend` UI mock，不包含后端、数据库或 Langfuse 修改。
- 路由、页面容器和组件组织与现有 `app-evaluation` 模块一致。
- 新建流程采用 PRD 推荐的独立页面，避免抽屉承载过多配置。
- 自动评测任务详情和评测报告详情职责拆分清晰，报告正文只在报告详情页展示。
- 数据流使用 mock API 封装，静态数据和业务操作分离。
- 报告查看门槛、删除限制、重新跑状态流转、报告生成和回流状态均有明确规则。
