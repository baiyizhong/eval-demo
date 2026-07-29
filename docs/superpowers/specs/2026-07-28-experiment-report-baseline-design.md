# 试验报告基线设计

## 1. 目标与范围

在数据集详情的“试验报告”列表中增加报告基线能力，用一份已完成报告作为同场景、同服务系列其他版本报告的快捷对比基准。

本次继续保持现有场景试验的前端高保真 Mock 原型范围：

- 仅修改 `pa-eval-frontend/` 和 `dev:mock` 数据、接口与交互。
- 不修改 `pa-eval-backend/`、`langfuse/` 或 `dify/`。
- 不新增数据库表、Alembic 迁移或真实后端接口。
- 复用现有试验报告详情和对比分析页面。

## 2. 已确认的交互规则

报告列表移除原操作列中的“查看报告”图标按钮。报告名称继续作为进入报告详情的链接。

已完成报告的操作列按基线状态显示以下三种操作之一：

- `设为基线`：当前作用域不存在基线时，打开设置确认弹窗。
- `当前基线`：当前报告就是作用域基线时，以禁用态按钮展示。
- `对比基线`：当前作用域已有其他基线时，使用分段按钮展示；左侧直接将当前报告和基线报告带入现有对比分析页，右侧下拉菜单提供 `设为新基线`，用于打开替换确认弹窗。

三种操作的整体尺寸统一为 `94px × 30px`；操作列固定约 `118px` 并居中，避免各行因文案与状态不同产生宽度跳动。分段按钮的左右部分共同占用该固定尺寸，不额外撑宽表格。

运行中、评分中、排队中或失败报告不展示基线操作。

## 3. 基线唯一范围

基线在以下组合范围内唯一：

```text
projectId + datasetId + sceneId + serviceFamily
```

因此：

- 同一数据集、同一场景、同一服务系列只能存在一条当前基线。
- 同一服务系列的不同版本报告可与当前基线对比。
- 不同数据集、不同场景或不同服务系列的基线互不影响。
- 设置基线后，所有符合该作用域的已完成历史报告和未来报告立即显示“对比基线”。

## 4. 数据模型

报告是不可变的试验结果，基线是可替换的用户配置，两者使用独立 Mock 实体表达：

```ts
type ExperimentReportBaseline = {
  id: string
  projectId: string
  datasetId: string
  sceneId: string
  serviceFamily: string
  reportId: string
  createdAt: string
  updatedAt: string
}
```

Mock 数据库新增 `experimentReportBaselines` 集合。预置一条客服场景 `support-agent` 的基线记录，用于直接演示“当前基线”和“对比基线”。

设置新基线时，只更新或创建对应作用域的关联记录，不修改旧报告和新报告本身。

## 5. Mock API

新增接口：

```http
GET /api/projects/:projectId/datasets/:datasetId/experiment-report-baselines
PUT /api/projects/:projectId/experiment-report-baselines
```

前端 registry 使用不带 `/api` 的资源路径：

```text
GET /projects/:projectId/datasets/:datasetId/experiment-report-baselines
PUT /projects/:projectId/experiment-report-baselines
```

设置请求：

```json
{
  "reportId": "experiment_report_v23"
}
```

设置接口校验：

1. 报告存在并属于 URL 中的当前项目。
2. 报告状态必须为 `COMPLETED`。
3. 报告必须包含有效 `datasetId`、`sceneId` 和 `webhookSnapshot.serviceFamily`。
4. 同作用域已有基线时直接替换 `reportId` 并更新 `updatedAt`。
5. 不同作用域的基线记录不受影响。

接口响应继续使用项目统一 `{ code, message, data, txId }` 格式。

## 6. 设置与替换弹窗

新增模块私有 `ExperimentBaselineDialog`，使用现有 `FormDialog`。

无旧基线时：

- 标题：`设为基线`
- 描述：确认后，该报告将作为同一场景、同一服务系列报告的对比基准。
- 确认按钮：`确认设为基线`

已有旧基线时：

- 标题：`替换当前基线`
- 描述：新报告将成为当前基线，旧基线保留为普通历史报告。
- 同时展示原基线和新基线摘要。
- 确认按钮：`确认替换`
- 入口：匹配其他基线的报告在 `对比基线` 分段按钮右侧菜单中选择 `设为新基线`。

弹窗展示：

- 报告名称
- 场景名称
- 调用服务名称、服务系列和版本
- 状态、执行轮次、完成时间
- 评分结果

弹窗只负责展示与触发 `onConfirm`，API 请求由列表容器管理。

## 7. 前端数据流

`DatasetExperimentReports` 同时查询报告列表和当前数据集的基线列表，并管理待设置基线的报告状态。

确认设置基线时：

1. 调用 `PUT` Mock API。
2. 请求期间禁用确认按钮并显示提交中文案。
3. 成功后关闭弹窗。
4. Toast 提示“基线设置成功”或“基线替换成功”。
5. 使报告和基线相关 React Query 缓存失效。
6. 表格根据最新关系重新渲染操作状态。

失败时弹窗保持打开，恢复确认按钮，并通过 Toast 展示可读错误消息。

## 8. 对比基线

点击“对比基线”后跳转到现有对比页面：

```text
/projects/{projectId}/evaluation/datasets/{datasetId}/experiments/compare
  ?reportIds={baselineReportId},{currentReportId}
```

继续复用：

- `compareExperimentReports`
- 同场景、同服务系列校验
- Score 横向矩阵
- `0.03` 差异高亮
- 对比结论

不新增基线专属分析页。

当用户希望把当前报告替换为新基线时，点击同一分段按钮右侧的下拉箭头并选择 `设为新基线`。该操作只打开替换弹窗，不触发对比跳转。

## 9. 组件边界

### `DatasetExperimentReports`

- 查询报告和基线。
- 管理弹窗状态和当前报告。
- 执行设置/替换 Mutation。
- 处理 Toast、缓存刷新和对比跳转。

### `experiment-report-columns`

- 接收基线列表和行操作回调。
- 渲染统一尺寸的三种基线操作，其中 `对比基线` 使用带替换入口的分段按钮。
- 移除原查看图标按钮。
- 不直接执行 API 请求。

### `ExperimentBaselineDialog`

- 展示当前报告和可选的原基线报告摘要。
- 根据是否替换切换标题、说明和确认文案。
- 不读取路由、React Query 或 API。

### `experiment-rules`

新增纯函数：

- 构造基线作用域键。
- 查找报告匹配的基线。
- 判断报告是否为当前基线。
- 保留并复用现有报告对比校验函数。

## 10. 异常处理

- 非完成报告不提供设置入口。
- 报告不存在或状态已变化时，Mock API 返回业务错误，前端提示后刷新查询。
- 基线关联的报告不存在时，该关联不产生“对比基线”按钮；刷新数据后可重新设置。
- 当前报告就是基线时不允许重复设置，只显示禁用的“当前基线”。
- 对比页面继续承担最终的报告有效性校验。

## 11. 测试与验收

测试覆盖：

- 基线作用域键由数据集、场景和服务系列组成。
- 同作用域设置新基线会替换旧关联。
- 不同作用域互不影响。
- 非 `COMPLETED` 报告不能设为基线。
- 基线行显示“当前基线”。
- 同作用域其他已完成报告显示“对比基线”。
- “对比基线”右侧菜单显示“设为新基线”，并可打开替换弹窗。
- 无匹配基线的已完成报告显示“设为基线”。
- 原查看图标按钮被移除。
- 对比跳转携带基线和当前报告两个 ID。
- 三种操作整体使用统一尺寸，分段按钮不会改变操作列宽度。

验证命令：

```bash
node --test src/tests/scene-experiments/*.test.ts
npm run typecheck
npm run lint
npm run build
```

最终使用 `npm run dev:mock` 在桌面与移动视口验证列表、弹窗、替换流程和对比页面。

## 12. 一致性检查

- 文案统一为“设为基线 / 当前基线 / 对比基线 / 设为新基线”。
- 基线唯一范围与现有对比条件一致。
- 替换旧基线不删除或修改历史报告。
- 历史和未来符合条件的报告均立即生效。
- 仅实现前端 Mock，不涉及真实后端和数据库。
- 文档无待定项或占位符。
