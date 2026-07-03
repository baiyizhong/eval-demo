# 人工评测模块前端交互设计

日期：2026-07-03

## 背景

本设计基于 `docs/prd/人工标注模块需求描述.md`，面向 `pa-eval-frontend` 中“应用评测 / 人工评测”子页面。本期只考虑前端 mock 设计实现，不接入真实后端，不修改 `pa-eval-backend/`、`langfuse/` 或任何数据库结构。

人工评测模块用于管理人工标注任务、处理任务下的标注队列数据、对单条 trace、observation 或 session 完成人工评分，并支持将标注数据沉淀到数据集。设计需参考现有“应用评测 / 数据集”页面，优先复用项目既有页面容器、导航、表格、表单、弹窗和反馈组件。

## 目标

- 在“应用评测”下新增“人工评测”子页面。
- 提供人工评测任务列表，支持新建、编辑、删除和进入处理。
- 任务详情页展示标注任务数据列表，支持搜索、筛选、分页、列显隐、批量选择、导出全部、导出选中和删除选中。
- 点击数据项进入独立标注详情页，支持返回任务队列。
- 标注详情页采用一屏双栏布局：左侧展示源对象信息和上下文，右侧展示人工标注表单。
- 标注详情页支持上一条、下一条、保存、保存并下一条、加入数据集。
- 下一条和保存并下一条支持跨分页连续推进，直到当前结果集末尾。
- 加入数据集使用独立弹窗交互。
- 全部能力以 mock 数据闭环演示，不引入真实后端逻辑。

## 非目标

- 不实现审核人、审核通过、审核驳回、返工、多级审核流。
- 不接入真实 Langfuse API 或 Plus 层 API。
- 不实现真实权限校验，只保留前端权限位和交互占位。
- 不修改 Langfuse 原生表结构。
- 不新增数据库迁移。
- 不实现复杂绩效统计、SLA、质检抽检。
- 不在本期实现从观测 Trace 真实创建标注队列的后端链路。

## 推荐方案

采用“任务列表 + 任务队列详情 + 独立标注详情页”方案。

页面层级：

- `/projects/:projectId/evaluation/annotation-queues`：人工评测任务列表。
- `/projects/:projectId/evaluation/annotation-queues/:queueId`：任务队列详情。
- `/projects/:projectId/evaluation/annotation-queues/:queueId/items/:itemId/annotate`：单条标注详情页。

该方案将标注操作从抽屉改为独立页面，适合展示 trace、observation、session 的上下文，也更适合连续标注。任务列表和任务详情仍保留 DataTable 工作台形态，保证搜索、筛选、分页、批量操作和表格底部对齐能复用现有能力。

## 信息架构

“应用评测”模块内二级导航调整为：

- 数据集：现有页面。
- 人工评测：新增页面。

人工评测内部包含三层：

1. 任务列表：管理 annotation queue 级别任务。
2. 任务队列详情：管理 annotation queue item 列表。
3. 标注详情：处理单条 item 的源对象查看、人工评分和数据集沉淀。

## 路由与导航

### 路由

在现有 `projects/:projectId/evaluation` 子路由下新增：

```text
annotation-queues
annotation-queues/:queueId
annotation-queues/:queueId/items/:itemId/annotate
```

`AppEvaluationIndexRedirect` 可继续默认跳转到数据集页，人工评测通过二级导航进入。若后续产品希望人工评测成为默认页，再调整 redirect。

### 页面容器

全部页面位于 `SidebarLayout` 下，使用现有页面容器：

- 列表页：`Page fixed fluid` + `EvaluationPageNav` + `DataTable`。
- 队列详情页：`Page fixed fluid` + `PageAction` + 指标区 + `DataTable`。
- 标注详情页：`Page fixed fluid` + `PageAction` + 一屏双栏工作台。

### 二级导航

扩展 `EvaluationPageNav`：

- `数据集`：`/projects/:projectId/evaluation/datasets`
- `人工评测`：`/projects/:projectId/evaluation/annotation-queues`

导航 active 判断使用路径前缀，进入详情页和标注详情页时保持“人工评测”高亮。

## 任务列表页

### 页面目标

任务列表页用于展示人工评测任务，管理任务基础信息、评分指标和处理人，并进入任务队列处理。

### 布局

页面结构沿用数据集列表页：

- 顶部：`EvaluationPageNav`。
- 右侧操作：`新建人工评测任务`。
- 主体：`DataTable` 表格卡片区域。

表格外层使用固定高度布局，确保分页位于表格底部。页面不额外自建滚动容器，滚动行为交给 `Page fixed` 和 `DataTable`。

### 表格能力

任务列表必须复用 `DataTable` 能力：

- 服务端分页 mock。
- 关键字搜索：按任务名称、描述搜索。
- 筛选：处理人、是否包含待处理数据。
- 列显隐。
- 空状态、加载态、错误态。

默认列：

- Name：任务名称，可点击进入任务详情。
- Description：任务描述。
- Completed Items：已完成数量。
- Pending Items：待处理数量。
- Score Configs：评分指标名称和类型。
- Assignees：处理人。
- Created：创建时间。
- Process：进入队列处理。
- Actions：编辑、配置处理人、删除。

### 新建与编辑

使用右侧 `Drawer` + `BaseForm`：

- 任务名称：必填。
- 任务描述：选填。
- 评分指标：必选一个或多个 mock score configs。
- 处理人：可选多个项目用户。

保存成功后：

- 新建：关闭抽屉，刷新任务列表，提示“人工评测任务已创建”。
- 编辑：关闭抽屉，刷新任务列表，提示“人工评测任务已更新”。

### 删除

使用 `confirm()` 二次确认，不使用浏览器原生确认框。

删除文案需要说明：

- 删除任务会移除 mock 任务和队列数据。
- 不代表删除源 trace、observation、session。
- 不代表删除历史 scores 或 dataset items。

## 任务队列详情页

### 页面目标

任务队列详情页用于查看任务下的标注数据，进行搜索、筛选、导出、删除，并进入单条标注详情页。

### 顶部区域

使用 `PageAction`：

- 左侧返回按钮：返回人工评测任务列表。
- 中间展示任务名称、任务状态摘要和评分指标标签。
- 右侧操作：导出全部。

`导出选中` 和 `删除选中` 固定放入 `DataTable` 的 `bulkActions`，只在表格有选中行时出现。页面顶部不重复展示选中态操作，避免重复维护选中状态。

### 指标区

任务详情顶部展示 4 个轻量指标：

- 总数据量。
- 待处理数量。
- 已完成数量。
- 完成率。

指标使用现有 `Card` 组合，保持与数据集详情指标卡一致。

### 表格能力

队列数据列表必须复用 `DataTable`：

- 关键字搜索：支持 item id、source id、源对象摘要内容。
- Faceted filter：状态、对象类型、处理人。
- URL 状态：分页、搜索、筛选和排序写入 URL query。
- 列显隐。
- 多选。
- 批量导出选中。
- 批量删除选中。
- 分页固定在表格底部。
- 表格主体在可用区域内滚动，避免页面底部分页随内容漂移。

默认列：

- 选择框。
- Id：队列数据 ID，点击进入标注详情。
- Type：`TRACE`、`OBSERVATION`、`SESSION`。
- Source：源对象入口或源对象类型说明。
- Source ID：源对象 ID。
- Status：`PENDING`、`COMPLETED`。
- Completed At：完成时间。
- Completed by：完成人。
- Actions：标注、查看/编辑、删除。

### 导出

导出全部：

- 导出当前任务下符合当前搜索和筛选条件的全部数据。
- 不受当前页限制。
- mock 阶段生成 JSON 文件。

导出选中：

- 只导出当前选中的表格行。
- 文件名包含 queueId、导出数量和时间戳。

导出内容建议包含：

- queue 基础信息。
- item 基础字段。
- source 摘要。
- 已有人工评分。
- 数据集沉淀状态。

### 删除选中

删除前使用 `confirm()`：

- 删除范围仅为 mock 队列数据。
- 不删除源对象。
- 不删除已保存评分。
- 不删除已加入的数据集项。

删除成功后刷新当前表格。若当前页被删空，DataTable 按现有分页逻辑回退或展示空状态。

## 标注详情页

### 页面目标

标注详情页用于对单条队列数据完成源对象查看、评分填写、备注填写和加入数据集。页面是独立路由，不使用抽屉。

### 一屏布局原则

标注详情页应尽量一屏展示，避免页面整体出现滚动条。

布局策略：

- 页面使用 `Page fixed fluid`。
- 顶部使用 `PageAction` 或同等页面操作区，固定高度。
- 主体使用左右双栏，占满剩余高度。
- 左侧信息区和右侧表单区各自内部处理溢出。
- 长文本、JSON、调用上下文只在局部区域滚动。
- 底部关键操作固定在右侧表单区底部。

桌面端建议比例：

- 左侧信息区：约 55% - 60%。
- 右侧标注表单区：约 40% - 45%，最小宽度不低于 360px。

窄屏端：

- 可纵向堆叠。
- 操作按钮保持可见。
- 允许页面滚动，不强行压缩到不可用高度。

### 顶部操作区

顶部展示：

- 返回队列。
- 当前 item id。
- 对象类型。
- 状态。
- 当前进度，例如 `第 37 / 128 条`。
- 当前结果集摘要，例如 `PENDING + TRACE`。
- 上一条。
- 下一条。

返回队列时，保留任务队列页原有搜索、筛选、排序和分页 URL 状态。

### 左侧信息区

左侧展示源对象信息，默认包含：

1. 源对象摘要，默认展开。
   - Source ID。
   - 对象类型。
   - 创建时间。
   - 用户、session 或 trace 关联信息。
   - latency、cost、environment 等摘要字段。

2. 上下文详情，默认展开但限制高度。
   - Input。
   - Output。
   - Metadata。
   - Observation 或 Session 相关上下文。

3. 历史人工评分，默认折叠。
   - 已保存 score。
   - 标注人。
   - 完成时间。
   - 评分备注。

源对象摘要、上下文详情、历史人工评分均使用折叠组件。涉及 JSON 字段时优先复用 `json-editor` 的只读展示能力；涉及长文本时优先复用 `markdown-editor` 或项目已有长文本展示能力。

### 右侧标注表单区

右侧展示本任务绑定的 score configs，对不同类型采用不同控件：

- `NUMERIC`：数值输入，若有 min/max 则展示范围提示，可使用输入框或滑块。
- `CATEGORICAL`：单选分类。
- `BOOLEAN`：布尔选择。
- `TEXT`：文本输入。

每个评分指标支持独立备注，备注写入 mock score 的 `comment` 字段。

表单底部固定操作：

- 加入数据集。
- 保存。
- 保存并下一条。

如果评分指标过多，右侧表单区内部滚动，底部操作栏保持可见。

### 连续标注规则

上一条、下一条和保存并下一条基于“当前结果集”推进。

当前结果集定义：

- 从任务队列详情页进入标注详情时，继承当时的搜索、筛选和排序条件。
- 当前结果集不限制在当前页，可以跨分页。
- 进入标注详情页后，上一条/下一条按该结果集顺序移动。

下一条规则：

1. 如果下一条在当前已加载数据中，直接进入下一条。
2. 如果下一条需要后续页数据，mock API 自动加载后续页并进入下一条。
3. 如果已经到达当前结果集末尾，提示“当前结果集已完成”，不自动跳回列表。

保存并下一条规则：

1. 先校验并保存当前评分。
2. 保存成功后将当前 item 状态更新为 `COMPLETED`。
3. 自动进入下一条。
4. 如果当前 item 是结果集最后一条，保存成功后提示“当前结果集已完成，请返回队列选择新的筛选条件或任务”。

上一条规则：

- 可跨分页回退到结果集上一条。
- 如果已经是第一条，按钮置灰或点击提示“已经是第一条”。

### 状态变更

保存评分后：

- mock score 写入当前 item。
- item 状态更新为 `COMPLETED`。
- 写入 `completedAt` 和 `completedBy`。
- 任务详情页指标和列表数据刷新。

重新编辑已完成 item：

- 保存后仍保持 `COMPLETED`。
- 更新评分值和备注。
- 更新 `updatedAt`。

## 加入数据集弹窗

### 入口

标注详情页右侧表单底部点击“加入数据集”打开 Dialog。

### 弹窗字段

- 目标数据集：必填，当前项目已有数据集。
- input：默认从源对象上下文提取，可编辑。
- expected_output：默认从源对象输出或人工标注结果提取，可编辑。
- metadata：默认带入标注来源信息，可编辑。

metadata 默认包含：

```json
{
  "source": "manual_annotation",
  "annotationQueueId": "queue_xxx",
  "annotationQueueItemId": "item_xxx",
  "annotatorUserId": "user_xxx",
  "scoreIds": ["score_xxx"]
}
```

### 交互规则

- 确认加入后写入 mock dataset item。
- 成功后关闭 Dialog，停留在当前标注详情页。
- 同一 item 重复加入同一数据集时，弹窗内提示“该标注数据已加入过当前数据集，可继续创建新数据项”。
- 用户确认后仍允许继续创建 mock 数据项。

## Mock 数据设计

建议在 `src/modules/app-evaluation/data/` 下新增静态 mock 数据：

- score configs。
- 项目用户。
- annotation queues。
- annotation queue assignments。
- annotation queue items。
- source trace / observation / session 摘要。
- scores。

`data/` 目录只存静态展示数据，不存业务逻辑。mock 操作逻辑放在 `api/` 目录。

建议新增 mock API：

- `listProjectAnnotationQueuesMock`
- `createProjectAnnotationQueueMock`
- `updateProjectAnnotationQueueMock`
- `deleteProjectAnnotationQueueMock`
- `listProjectAnnotationQueueItemsMock`
- `getProjectAnnotationQueueMock`
- `getProjectAnnotationQueueItemMock`
- `getProjectAnnotationNavigationMock`
- `saveProjectAnnotationScoresMock`
- `deleteProjectAnnotationQueueItemsMock`
- `exportProjectAnnotationQueueMock`
- `exportProjectAnnotationQueueItemsMock`
- `addProjectAnnotationItemToDatasetMock`

分页响应保持：

```ts
type DataTableListResponse<T> = {
  total: number
  datas: T[]
}
```

## 类型设计

建议在 `src/modules/app-evaluation/types.ts` 扩展或拆分为模块内类型文件。

核心类型：

- `AnnotationQueueRecord`
- `AnnotationQueueItemRecord`
- `AnnotationObjectType = 'TRACE' | 'OBSERVATION' | 'SESSION'`
- `AnnotationItemStatus = 'PENDING' | 'COMPLETED'`
- `ScoreConfigRecord`
- `ScoreDataType = 'NUMERIC' | 'CATEGORICAL' | 'BOOLEAN' | 'TEXT'`
- `AnnotationScoreRecord`
- `AnnotationQueueFormInput`
- `AnnotationScoreFormInput`
- `AddToDatasetFormInput`

如果 `types.ts` 文件膨胀明显，可拆分为：

```text
src/modules/app-evaluation/types/
  dataset.ts
  annotation.ts
```

拆分时需要避免引入全局 barrel；从明确文件导入。

## 组件拆分建议

建议在 `src/modules/app-evaluation/` 下新增：

```text
views/
  annotation-queues.tsx
  annotation-queue-detail.tsx
  annotation-item-annotate.tsx
components/
  annotation-queue-columns.tsx
  annotation-queue-row-actions.tsx
  annotation-queue-form-drawer.tsx
  annotation-queue-item-columns.tsx
  annotation-queue-item-bulk-actions.tsx
  annotation-status-badge.tsx
  annotation-object-type-badge.tsx
  annotation-source-panel.tsx
  annotation-score-form.tsx
  annotation-dataset-dialog.tsx
api/
  mock-annotation-api.ts
data/
  mock-annotations.ts
```

职责说明：

- `annotation-queues.tsx`：任务列表页面组合。
- `annotation-queue-detail.tsx`：任务队列详情页面组合。
- `annotation-item-annotate.tsx`：独立标注详情页组合。
- `annotation-source-panel.tsx`：左侧源对象摘要、上下文和历史评分。
- `annotation-score-form.tsx`：右侧评分指标表单。
- `annotation-dataset-dialog.tsx`：加入数据集弹窗。
- `mock-annotation-api.ts`：所有 mock 查询和写入逻辑。
- `mock-annotations.ts`：静态 mock 数据。

## UI 与交互约束

- 使用 `Page`、`PageNav`、`PageAction`、`DataTable`、`Drawer`、`Dialog`、`Card`、`Badge` 等现有组件。
- 不手写表格、分页、筛选面板、列显隐或批量选择逻辑。
- 新建和编辑任务使用抽屉，不使用页面跳转。
- 单条标注使用独立页面，不使用抽屉。
- 加入数据集使用 Dialog，不嵌在标注表单主体中。
- 列表页和详情页的表格底部分页必须稳定贴底。
- 页面固定高度时，内部区域必须设置 `min-h-0`，避免滚动穿透和分页被挤出可视区。
- 不使用 `window.alert`、`window.confirm`，统一使用 `toast` 和 `confirm()`。
- 图标优先使用 `lucide-react`。
- 不硬编码 API host、密钥或真实 token。

## URL 状态

任务队列详情页需要将以下状态同步到 URL：

- page。
- pageSize。
- keyword。
- status。
- objectType。
- annotator。
- sort。

标注详情页从 URL 或 navigation state 中继承当前结果集条件。为了刷新后仍能恢复连续标注上下文，推荐将必要条件保留在 query 中，而不是只依赖内存 state。

示例：

```text
/projects/project_customer_agent/evaluation/annotation-queues/queue_001/items/item_1024/annotate?keyword=refund&status=PENDING&type=TRACE&pageSize=10&sort=createdAt.desc
```

## 加载、空状态和错误状态

任务列表：

- 加载：`Loading`，文案“加载人工评测任务中...”。
- 空状态：提示“当前项目下暂无人工评测任务”，提供新建入口。
- 搜索空：提示“当前筛选条件下暂无人工评测任务”。

任务队列详情：

- 加载：`Loading`，文案“加载标注任务数据中...”。
- 空状态：提示“当前任务下暂无标注数据”。
- 搜索空：提示“当前筛选条件下暂无标注数据”。

标注详情：

- 加载：`Loading`，文案“加载标注详情中...”。
- 源对象缺失：保留评分区域，左侧提示“源对象不存在或已不可用”。
- item 不存在：展示错误态并提供返回队列按钮。
- 保存失败：toast 展示可理解错误，不关闭页面，不清空用户输入。

## 验收标准

- 应用评测下出现“人工评测”子页面，且进入详情页和标注详情页时导航高亮正确。
- 可以通过 mock 创建、编辑、删除人工评测任务。
- 任务列表字段包含 Name、Description、Completed Items、Pending Items、Score Configs、Created、Process、Actions。
- 任务详情页可以查看标注数据列表，并支持搜索、筛选、分页、列显隐、多选。
- 任务详情页支持导出全部、导出选中和删除选中。
- 点击数据项进入独立标注详情页，页面支持返回队列。
- 标注详情页采用左信息、右表单的一屏双栏布局，桌面端页面整体尽量不出现滚动条。
- 源对象摘要、上下文详情、历史人工评分支持折叠。
- 可按 score configs 渲染不同评分控件，并为每个指标填写备注。
- 保存评分后 item 状态变为 `COMPLETED`，记录完成时间和完成人。
- 上一条、下一条和保存并下一条可跨分页在当前结果集中连续推进。
- 到达结果集末尾时给出明确提示，不自动跳回列表。
- 加入数据集通过 Dialog 完成，成功后停留在当前标注详情页。
- 页面中不出现审核人、审核状态、审核通过、审核驳回等审核流概念。
- 不修改后端、不修改 `langfuse/`、不新增数据库迁移。

## 后续实现建议

实现顺序建议：

1. 扩展 `EvaluationPageNav` 和路由。
2. 增加 annotation mock 类型、静态数据和 mock API。
3. 实现任务列表页与任务表单抽屉。
4. 实现任务队列详情页、表格列、批量操作和导出。
5. 实现独立标注详情页的一屏双栏布局。
6. 实现评分表单、连续标注导航和保存逻辑。
7. 实现加入数据集 Dialog，并复用现有 dataset mock 能力。
8. 增加必要的类型测试或 mock API 测试。
