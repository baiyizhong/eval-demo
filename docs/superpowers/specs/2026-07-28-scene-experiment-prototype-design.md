# 基于数据集的场景试验高保真原型设计

## 1. 目标与范围

本次仅在 `pa-eval-frontend` 中实现可点击、可演示的高保真原型，通过 `npm run dev:mock` 提供内存态 Mock API，不实现后端服务、数据库结构、真实 Webhook 调用或真实 Langfuse 写入。

原型目标是组合现有数据集、评估器和评分能力，形成以下闭环：

1. 项目级配置可复用场景，场景仅包含 Webhook 服务与默认运行参数。
2. 在指定数据集内选择场景并发起试验。
3. 按所选 Webhook 服务分别生成服务级试验报告。
4. 使用所选评估器生成评分结果。
5. 在数据集内查看报告，并执行聚合报告或版本对比分析。

不改变现有数据集、数据项、评估器、评分指标、自动评测和评测报告的业务逻辑。`langfuse/` 与 `dify/` 目录不做任何修改。

## 2. 信息架构与模块边界

采用按领域拆分方案。

### 2.1 场景管理

场景是项目级可复用执行模板，作为侧边栏一级菜单，位于“应用评测”之后。

- 场景列表：`/projects/:projectId/scenes`
- 场景详情：`/projects/:projectId/scenes/:sceneId`
- 新增和编辑：增强型三步抽屉

场景管理使用独立前端模块，避免把项目级资源塞入现有 `app-evaluation` 模块。

### 2.2 数据集试验

场景试验和试验报告属于数据集上的执行与结果，因此接入现有数据集详情页面：

- “数据项”Tab 保持现有能力。
- 新增“试验报告”Tab。
- 右上角在“新增数据项”旁新增“场景试验”按钮。
- 场景试验使用增强型五步抽屉。
- 聚合报告与对比分析使用独立页面。

建议分析页路由：

- `/projects/:projectId/evaluation/datasets/:datasetId/experiments/aggregate`
- `/projects/:projectId/evaluation/datasets/:datasetId/experiments/compare`

服务级报告详情建议路由：

- `/projects/:projectId/evaluation/datasets/:datasetId/experiment-reports/:reportId`

## 3. Webhook 标准契约

Webhook 服务采用固定标准契约，不引入请求编排、模板脚本或响应解析表达式。

### 3.1 配置项

- 服务名称
- 服务描述
- URL
- 请求方式，固定为 `POST`
- 鉴权方式：无鉴权、Bearer Token、API Key
- 请求头
- 凭证字段仅显示掩码，Mock 数据不包含真实密钥

### 3.2 请求结构

每个数据项按统一结构发送：

```json
{
  "itemId": "dataset-item-id",
  "input": {},
  "expectedOutput": {},
  "metadata": {}
}
```

### 3.3 响应结构

```json
{
  "output": {},
  "metadata": {}
}
```

## 4. 场景管理设计

## 4.1 场景列表

列表使用现有 `Page`、`PageAction`、`DataTable` 和确认反馈模式。

展示字段：

- 场景名称，可点击进入独立详情页
- 描述
- 可用状态
- Webhook 服务数量
- 运行参数摘要
- 更新时间
- 行操作

功能：

- 按场景名称模糊搜索
- 按状态筛选
- 新增场景
- 查看场景
- 编辑场景
- 设置可用或停用
- 删除场景

停用场景不能用于发起新试验，但历史报告不受影响。删除前使用统一确认弹窗，明确历史试验读取快照，不会随场景删除而丢失。

## 4.2 场景详情

详情使用独立页面，不使用只读步骤抽屉。页面包含：

- 基础信息：名称、描述、状态、创建时间、更新时间
- Webhook 服务列表：名称、URL、鉴权方式、请求方式、描述
- 默认运行参数
- 右上角“编辑场景”和启停操作

默认运行参数共四项：

- 并发数，建议范围 `1-50`
- 超时时间，建议范围 `1-600` 秒
- 重试次数，建议范围 `0-10`
- 默认执行轮次，默认 `1` 轮，建议范围 `1-20`

## 4.3 新增与编辑抽屉

使用增强型、可调整宽度的 `Drawer` 和现有 `Stepper`。

第一步“基础信息”：

- 场景名称
- 场景描述

第二步“Webhook 服务”：

- 添加、编辑、删除一个或多个 Webhook 服务
- 左侧服务列表，右侧编辑表单
- 至少保留一个服务

第三步“运行参数”：

- 并发数
- 超时时间
- 重试次数
- 默认执行轮次

步骤向后跳转前校验当前及中间步骤；向前返回允许直接切换。

## 5. 数据集场景试验向导

场景试验按钮仅新增在数据集详情，不改变现有数据项逻辑。抽屉为五步流程。

## 5.1 第一步：选择场景

输入：

- 试验名称
- 试验描述
- 场景，单选

场景列表仅展示“可用”且配置完整的场景。选择后带出只读摘要，包括描述、Webhook 数量和默认运行参数。

如果没有可用场景，展示空状态和“前往场景管理”按钮。

## 5.2 第二步：选择 Webhook 服务

- 展示场景下所有 Webhook 服务
- 支持多选
- 支持查看服务详情
- 默认不选择，要求用户明确勾选
- 至少选择一个服务

选择多个服务时，每个服务执行一次完整试验，并分别生成一份服务级报告。报告名称为：

```text
试验名称 - Webhook 服务名称
```

同一次提交创建一个 `ExperimentGroup`，各服务级报告共享相同 `experimentGroupId`。

## 5.3 第三步：选择评估器

- 调用现有评估器列表接口查询用户可访问的评估器
- 仅展示 `projectId` 严格等于当前项目 ID 的评估器
- 不展示 `projectId: null` 的全局评估器，也不展示其他项目的评估器
- 支持多选和详情查看
- 默认不选择
- 至少选择一个评估器

评分结果包含所有评估器的输出变量。重名变量在界面显示为：

```text
评估器名称 · 输出变量
```

内部唯一键使用 `evaluatorId + variableName`，避免重名覆盖。

## 5.4 第四步：确认运行参数

带出场景默认参数，并允许仅对本次试验覆盖：

- 并发数
- 超时时间
- 重试次数
- 执行轮次

轮次作用于每个“有效数据项 × Webhook 服务”组合。并发数控制本次试验的全局同时执行调用数量。

## 5.5 第五步：汇总并执行

汇总展示：

- 试验名称和描述
- 选择的场景
- Webhook 服务及最终报告名称
- 评估器和评分变量
- 运行参数
- 有效数据项数量
- 预计调用量

预计调用量计算：

```text
有效数据项数量 × Webhook 服务数量 × 执行轮次
```

提交成功后关闭抽屉并切换到“试验报告”Tab，新报告显示为排队中。

返回第一步切换场景时：

- 保留试验名称和描述
- 清空已选 Webhook 与评估器
- 重新带出新场景默认运行参数

评估器候选列表属于当前项目，不随场景变化。清空已选评估器是为了让用户对新的本次试验配置重新确认。

## 6. 多轮执行与评分聚合

单份服务级报告包含该服务对当前数据集所有有效数据项、所有执行轮次的结果。

报告展示：

- 实际执行轮次
- 每轮评分均值
- 多轮标准差或波动信息
- 最终聚合分

原型中最终聚合分使用各有效轮次结果的均值。调用最终失败的数据项不参与有效样本均值，并进入“失败调用”区域。

## 7. 试验报告 Tab

报告列表属于当前数据集，仅查询基于该数据集运行的试验结果。

展示字段：

- 选择框
- 服务级试验报告名称
- 所属试验组
- Webhook 服务名称
- 运行状态与进度
- 执行轮次
- 评分结果
- 完成时间
- 操作

功能：

- 按试验名称或服务名称模糊搜索
- 已完成报告可多选
- 多选后显示“聚合报告”和“对比分析”按钮
- 点击报告名称进入服务级报告详情

服务级报告详情展示总览、score 维度、样本结果、多轮分布和失败调用。

运行状态：

- `QUEUED`：排队中
- `RUNNING`：运行中，展示进度
- `SCORING`：评分生成中
- `COMPLETED`：已完成，可分析
- `FAILED`：失败，可查看原因

## 8. 聚合报告

聚合报告用于同一次试验中不同 Webhook 服务的结果聚合。

选择规则：

- 至少选择两份已完成报告
- 报告必须拥有相同 `experimentGroupId`

独立页面展示：

- 试验组摘要
- 各服务综合评分
- 各 score 维度分布
- 差异样本数量
- 多轮稳定性
- 智能聚合结论

原型中的“智能聚合结论”由 Mock API 根据预置评分和差异样本生成固定但可信的文本，不调用真实大模型。

## 9. 对比分析

对比分析用于同一服务系列不同版本的报告横向比较。

选择规则：

- 至少选择两份已完成报告
- 报告属于同一场景
- Webhook 服务标识为同一服务系列的不同版本

独立页面按 score 维度横向展示选中报告。高亮规则为：同一评分维度相对最佳值的差异超过 `0.03`。

对于重名评分变量，表格同时展示评估器名称和输出变量名。

如果选择不符合聚合或对比规则，保留当前选择，并说明具体不匹配报告与选择规则，不静默清空选择。

## 10. Mock 数据模型

### 10.1 Scene

- `id`
- `projectId`
- `name`
- `description`
- `enabled`
- `webhookServiceIds`
- `runParameters`
- `createdAt`
- `updatedAt`

### 10.2 WebhookService

- `id`
- `sceneId`
- `name`
- `description`
- `url`
- `method: POST`
- `authType`
- `maskedCredential`
- `headers`

### 10.3 ExperimentGroup

- `id`
- `projectId`
- `datasetId`
- `name`
- `description`
- `sceneSnapshot`
- `evaluatorSnapshots`
- `runParameters`
- `createdAt`

### 10.4 ExperimentReport

- `id`
- `experimentGroupId`
- `projectId`
- `datasetId`
- `webhookSnapshot`
- `status`
- `progress`
- `scoreResults`
- `roundResults`
- `itemResults`
- `failureReason`
- `createdAt`
- `completedAt`

试验提交时保存场景、Webhook、评估器和运行参数快照。后续编辑、停用或删除场景不会改变历史报告。

## 11. Mock API

所有响应遵循项目统一格式：

```json
{
  "code": 0,
  "message": "success",
  "data": {},
  "txId": "mock-tx-id"
}
```

分页列表 `data` 使用 `{ total, datas }`。

新增 Mock API：

- `GET /api/projects/:projectId/scenes`
- `POST /api/projects/:projectId/scenes`
- `GET /api/projects/:projectId/scenes/:sceneId`
- `PATCH /api/projects/:projectId/scenes/:sceneId`
- `DELETE /api/projects/:projectId/scenes/:sceneId`
- `POST /api/projects/:projectId/datasets/:datasetId/experiments`
- `GET /api/projects/:projectId/datasets/:datasetId/experiment-reports`
- `GET /api/projects/:projectId/experiment-reports/:reportId`
- `POST /api/projects/:projectId/experiment-reports/aggregate`
- `POST /api/projects/:projectId/experiment-reports/compare`

试验评估器查询复用现有 `GET /api/evaluators`。前端根据当前路由的 `projectId` 精确过滤；Mock 试验提交接口再次校验全部所选评估器均属于 URL 中的当前项目。数据集与数据项查询复用现有 dataset Mock API。

试验提交时，Mock API 对评估器执行以下校验：

- 至少选择一个评估器
- 每个评估器 ID 都真实存在
- 每个评估器的 `projectId` 都严格等于当前项目 ID
- 全局评估器和其他项目评估器均视为不可用

## 12. Mock 状态推进

前端轮询报告列表时，Mock API 根据创建时间或轮询次数推进状态：

```text
QUEUED -> RUNNING -> SCORING -> COMPLETED
                           \-> FAILED
```

建议演示节奏：

- 创建后立即为 `QUEUED`
- 约 1 秒进入 `RUNNING`
- 轮询时进度递增
- 约 6-10 秒进入 `COMPLETED` 或 `FAILED`

同一试验组中的服务级报告独立推进状态，一个服务失败不影响其他服务完成。预置 Mock 数据同时覆盖已完成、运行中和失败报告。

## 13. 异常与空状态

- 无可用场景：显示空状态和“前往场景管理”。
- 场景缺少有效 Webhook 服务：不允许发起试验。
- 当前项目无评估器：展示空状态，不能进入后续步骤。
- 提交了全局或其他项目评估器：Mock API 拒绝创建试验。
- 部分服务失败：各报告独立展示状态。
- 数据项调用失败：完成重试后记录失败原因，不参与有效评分均值。
- 分析选择不匹配：说明原因并保留选择。
- 删除场景：历史报告读取快照，不产生断链。
- 报告仍在运行：不可选用于聚合或对比。

## 14. 原型验收范围

必须可演示：

1. 场景列表、搜索、新增、查看、编辑、启停和删除。
2. 三步场景抽屉及所有步骤校验。
3. 数据集内五步场景试验向导。
4. 多服务报告拆分、评分变量消歧和调用量计算。
5. 排队、运行、评分、完成和失败状态。
6. 试验报告列表、服务级详情、聚合报告和对比分析。
7. 桌面与移动视口无文本或控件重叠。
8. `npm run typecheck`、`npm run lint` 和 `npm run build` 通过。

明确不在范围：

- 真实 Webhook 网络调用
- 真实密钥加密存储
- 后端任务队列与生产级并发调度
- 数据库表与 Alembic 迁移
- 真实 Langfuse API 写入
- 真实大模型智能聚合
- 后端新增权限码

## 15. 设计一致性检查

- 场景是项目级资源，试验和报告是数据集级资源，边界一致。
- 场景只定义服务调用方式和默认运行参数，评估器属于单次试验配置，二者没有持久化绑定关系。
- 多服务通过 `ExperimentGroup` 聚合，多版本通过场景和服务系列约束对比。
- 场景删除不影响历史报告，符合快照原则。
- 默认执行轮次已贯穿场景详情、场景表单、试验向导、报告列表和报告详情。
- 所有 Mock API 使用项目统一响应和分页格式。
- 现有数据集与评估器接口仅被复用；当前项目评估器由前端精确过滤，并由 Mock 提交接口再次校验。
- 文档无待定项、占位符或与已确认设计冲突的描述。
