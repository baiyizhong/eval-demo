# 应用观测模块前端交互视觉设计

## 背景

本设计基于 `docs/prd/应用观测模块需求描述.md`，面向项目详情中的“应用观测”模块。模块第一版覆盖 Trace 看板、Trace 日志、Trace 详情抽屉、Trace 顶层字段编辑、批量导出和人工标注入口。

前端实现应遵循现有 `pa-eval-frontend` 规范：React、TypeScript、Vite、Tailwind CSS、Radix UI、shadcn/ui 风格组件、React Router、DataTable、Drawer 和 `LLMTraceChain`。

## 设计决策

采用“项目页内二级导航混合方案”：

- 在项目详情导航中新增“应用观测”菜单。
- 点击“应用观测”默认进入 `Trace 看板`。
- 页面内容区使用 `PageNav` 提供 `Trace 看板` 和 `Trace 日志` 两个二级页签。
- `Trace 看板` 负责健康度总览、趋势分析和下钻。
- `Trace 日志` 负责 Trace 明细、DataTable 筛选、分页、多选、批量操作和详情入口。
- Trace 详情和编辑均使用右侧 enhanced `Drawer`，不新增独立详情页。

不在页面级操作区放置“导出”按钮。导出和人工标注只在 Trace 日志表格多选后，通过 DataTable 批量操作区出现。

## 页面结构

### 路由与布局

模块建议挂载在 `SidebarLayout` 分支下，页面组件使用 `Page fixed fluid`：

- `/projects/:projectId/observability` 默认重定向或展示 Trace 看板。
- `/projects/:projectId/observability/traces/dashboard` 展示 Trace 看板。
- `/projects/:projectId/observability/traces/logs` 展示 Trace 日志。

如果现有项目详情路由已有固定结构，实际路径应贴合当前项目路由，但必须保持“应用观测 / Trace 看板 / Trace 日志”的信息层级。

### 页面顶部

页面内容顶部使用 `PageNav`：

- 左侧：二级页签 `Trace 看板`、`Trace 日志`。
- 右侧：仅放页面级全局操作，例如刷新。
- 看板筛选不放入日志页；日志筛选全部交给 DataTable。
- 页面级不展示导出、人工标注等依赖表格选中态的操作。

## Trace 看板

### 信息架构

看板默认展示当前项目最近 24 小时数据：

- 筛选：时间范围、环境多选。
- 指标卡：Trace 总量、成功量、失败量、失败率、平均延迟、P95 延迟。
- 图表：Trace 总量与失败量趋势、平均延迟与 P95 延迟趋势、环境分布。
- 排名：慢 Trace 排名。

### 视觉布局

桌面端建议布局：

- 第一行：时间范围、环境、刷新等看板局部筛选。
- 第二行：6 个 KPI 指标卡，使用 `ChartMetricCard` 或同风格 `Card` 组合。
- 第三行：左侧趋势图，右侧环境分布。
- 第四行：左侧延迟趋势，右侧慢 Trace 排名。

窄屏端：

- 指标卡从 6 列收敛为 2 列或 1 列。
- 图表和排行纵向堆叠。
- 控件保持 44px 以上可点击高度。

### 下钻交互

- 点击失败量或失败率，跳转到 Trace 日志，并带入状态为失败、当前时间范围、当前环境筛选。
- 点击慢 Trace 排名中的 Trace，优先打开 Trace 详情抽屉；也可通过 URL query 表达当前选中 Trace，刷新后恢复抽屉。
- 看板筛选变化后，指标、图表和慢 Trace 排名同步刷新。

### 状态处理

- 加载中使用 `Skeleton`。
- 无数据展示“当前筛选条件下暂无 Trace 数据”。
- 接口失败展示可重试错误态，不暴露内部异常。

## Trace 日志

### 核心原则

Trace 日志页不自建独立筛选 UI。时间筛选、普通筛选和高级筛选均复用 DataTable 默认交互：

- `DataTable Toolbar`：承载关键字搜索和默认可见筛选。
- `DataTable Faceted Filters`：承载环境、状态、标签等快捷筛选。
- `DataTable / FilterPanel`：承载高级筛选。
- `DataTable BulkActions`：承载导出和人工标注入口。

### 表格列

默认列：

- 选择框
- Trace ID
- Session ID
- 环境
- 状态
- 延迟
- 创建时间

展示规则：

- Trace ID 可点击打开详情抽屉。
- Session ID 支持复制和省略展示。
- 状态使用 `Badge` 或语义化状态样式展示，并带文本，不只依赖颜色。
- 延迟按 ms/s 自适应格式化。
- 创建时间使用系统统一时间格式。

### 筛选交互

普通筛选默认可见：

- 时间范围，默认最近 24 小时。
- ID 搜索，支持 `traceId` 或 `sessionId`。

高级筛选默认收起，字段包括：

- 项目，默认当前项目；项目内页面可置灰。
- 环境，多选。
- 状态，多选：成功、失败、运行中、未知。
- 延迟区间，最小/最大耗时。
- Session ID。
- 用户标识。
- 业务标识。
- 标签。
- metadata key/value 动态条件。

metadata 条件规则：

- key 不能为空。
- value 可为空；为空表示筛选存在该 key 的 Trace。
- 多个 metadata 条件默认 AND。
- 前端只做输入约束和结构化参数提交，不拼接查询语句。

### URL 状态

筛选、分页、排序和选中详情应支持 URL query 表达：

- 刷新页面后恢复筛选和分页。
- 从看板下钻到日志时，通过 query 带入时间、环境、状态、traceId 等条件。
- 列表刷新后保留当前筛选条件和分页状态。

### 批量操作

未选择 Trace 时，不展示页面级导出或人工标注入口。

选中一条或多条 Trace 后，DataTable 批量操作区展示：

- 导出 JSON。
- 创建人工标注。

导出规则：

- 只导出当前选中的 Trace。
- 首版优先 JSON。
- 文件名包含项目 ID、导出时间和 Trace 数量。
- 导出失败时展示业务错误信息。

人工标注规则：

- 点击后创建或跳转人工标注入口，并携带所选 Trace ID 列表。
- 后端必须重新校验 Trace ID 列表；前端不只依赖当前页数据。
- 成功后清晰展示所选 Trace 数量。

## Trace 详情抽屉

### 打开方式

- 点击 Trace 日志行。
- 点击 Trace ID。
- 点击 Trace 看板慢 Trace 排名项。

### 查看态布局

使用 enhanced `Drawer`：

- 抽屉头部：traceId、状态、环境、创建时间、复制 Trace ID、编辑、关闭。
- 概览信息：sessionId、延迟、更新时间等。
- 主体区域：桌面两列，窄屏纵向堆叠。
- 左侧：`LLMTraceChain` 调用链。
- 右侧：Input、Output、Metadata。

调用链要求：

- 复用 `LLMTraceChain`。
- 支持搜索、展开折叠、元信息展示。
- 节点类型优先映射为 `ingress`、`agent`、`run`、`response`、`tool`、`retrieval`、`prompt`、`guard`、`eval` 等。
- 调用链为空时显示空状态，不影响其他字段查看。

Input、Output、Metadata：

- 查看态只读。
- 支持复制。
- Metadata 使用格式化 JSON 展示。

### 编辑态

点击“编辑”后，抽屉进入编辑态。

可编辑字段仅限：

- `input`
- `output`
- `metadata`

不可编辑：

- Trace ID。
- 项目 ID。
- 创建时间。
- 调用链节点。
- 其他系统字段。

编辑控件：

- `input` 使用多行文本输入。
- `output` 使用多行文本输入。
- `metadata` 使用 `JsonEditor` 或结构化 JSON 编辑区。

保存规则：

- 保存前校验 metadata 必须是合法 JSON object，不允许数组或原始值。
- 保存中禁用保存按钮并显示加载态。
- 保存成功后回到查看态，并刷新详情和列表必要字段。
- 保存失败时保留用户输入，并在字段附近展示错误。
- 取消时若存在未保存修改，使用确认弹窗提示是否放弃修改。

## 组件与模块边界

建议新增模块：

```txt
pa-eval-frontend/src/modules/app-observability/
  api/
    index.ts
  components/
    observability-page-nav.tsx
    trace-dashboard-filters.tsx
    trace-metric-grid.tsx
    trace-trend-chart.tsx
    trace-latency-chart.tsx
    trace-environment-chart.tsx
    slow-trace-ranking.tsx
    trace-log-columns.tsx
    trace-log-bulk-actions.tsx
    trace-detail-drawer.tsx
    trace-edit-form.tsx
  hooks/
    use-trace-log-query-state.ts
  types.ts
  views/
    trace-dashboard.tsx
    trace-logs.tsx
  index.tsx
```

实际实现时不需要为了模板完整性创建空目录；只创建必要文件。

复用组件：

- 页面容器：`Page`、`PageNav`。
- 表格：`DataTable`、`DataTableProvider`、DataTable bulk actions。
- 筛选：DataTable 默认 toolbar、faceted filters、`FilterPanel`。
- 抽屉：`Drawer`。
- 详情：`BaseDetail` 或模块私有详情区块。
- JSON：`JsonEditor`。
- 调用链：`LLMTraceChain`。
- 图表：Recharts 与项目现有 chart card 组件。
- 图标：`lucide-react`。

不要修改 `langfuse/` 目录，不修改 Langfuse 原生表结构，不在前端硬编码 API host、密钥或数据库连接。

## API 接入

模块 API alias 建议：

- `getTraceMetrics`: `GET /projects/:projectId/trace-metrics`
- `listProjectTraces`: `GET /projects/:projectId/traces`
- `getProjectTrace`: `GET /projects/:projectId/traces/:traceId`
- `patchProjectTrace`: `PATCH /projects/:projectId/traces/:traceId`
- `exportProjectTraces`: `POST /projects/:projectId/traces/export`
- `createAnnotationTask`: `POST /projects/:projectId/annotation-tasks`

接口调用必须通过 `useAPI()` 和全局 API registry。列表响应适配统一分页结构：

```ts
{
  total: number
  datas: TraceLogRow[]
}
```

## 错误与空状态

统一处理：

- Trace 不存在：抽屉展示“Trace 不存在或已不可用”。
- 筛选参数非法：定位到对应筛选项。
- metadata JSON 非法：前端阻断保存，提示“请输入合法 JSON 对象”。
- 导出数量为空：正常情况下按钮不会出现；若异常触发，提示选择 Trace。
- Langfuse 查询失败：展示可重试错误，不暴露内部细节。
- 保存冲突：提示刷新后重试。

## 可访问性与视觉规范

- 所有按钮和图标按钮必须有可访问名称。
- 点击目标不小于 44px。
- 状态不能只依赖颜色表达，必须有文本或图标辅助。
- 表格长文本支持省略、复制和 tooltip 或等价完整查看能力。
- 使用语义 token，如 `bg-card`、`text-muted-foreground`、`border-border`。
- 不使用硬编码色值、渐变装饰或独立于项目主题的视觉语言。
- 页面信息密度应贴合中后台运维场景：清晰、克制、便于扫描。

## 验证建议

实现完成后至少运行：

```bash
npm run typecheck
npm run lint
```

涉及构建或图表/路由接入时补充：

```bash
npm run build
```

核心交互需要覆盖：

- 看板筛选刷新。
- 看板下钻日志。
- 日志 DataTable 筛选、分页、URL 恢复。
- 多选后显示批量操作。
- 打开 Trace 详情抽屉。
- 编辑 metadata 非法时阻断保存。
- 取消未保存修改时弹出确认。
