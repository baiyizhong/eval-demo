# Trace 批量操作成功 Alert 设计

## 背景

Trace 日志页 `/projects/:projectId/observability/traces/logs` 已支持勾选 Trace 后执行“加入数据集”和“人工标注”，两类弹窗均支持选择已有资源或新建资源。

原实现仅在操作成功后展示顶部中央、持续约 1.8 秒的 `toast.success`。toast 消失后用户无法继续查看结果，也不能从页面提示直接进入刚操作的数据集或人工标注任务。

本设计在成功时只展示 Trace 日志页右上区域的持久绿色 Alert，不再展示成功 toast。Alert 与视口边缘保留间距，由用户手动关闭，并提供目标详情页链接；异常继续使用 toast。

## 目标

- 覆盖“加入已有数据集”“新建数据集并加入”“加入已有人工标注任务”“新建人工标注任务并加入”四种成功结果。
- 每次成功后只在 Trace 日志页视口右上区域固定展示持久绿色 `Alert`，不紧贴页面边缘。
- 加入数据集和人工标注成功时不调用 `toast.success`；异常继续调用 `toast.error`。
- Alert 右上角提供可访问的关闭按钮，只有用户关闭、点击链接离开页面或新的成功结果替换时才消失。
- Alert 正文包含站内链接，可直接进入本次操作对应的数据集或人工标注任务详情页。
- 保留成功、失败、跳过数量，避免跳转能力降低结果信息完整性。
- 不影响导出成功、请求失败及其他页面的 toast 或 Alert。

## 当前实现调研

### 入口与成功处理

四条成功链路集中在：

```text
pa-eval-frontend/src/modules/app-observability/components/trace-log-bulk-actions.tsx
```

- 加入已有人工标注任务：`handleCreateAnnotationTask`
- 新建人工标注任务并加入：`handleCreateAnnotationQueueAndTask`
- 加入已有或新建数据集：`handleAddToDataset`

改造前的成功分支均直接调用 `toast.success(string)`，没有可持久查看的页面状态。

### 已有返回数据

现有接口结果已经包含目标资源 ID，无需后端改造：

```ts
type TraceDatasetAddResult = {
  datasetId: string
  successCount: number
  failureCount: number
  // ...
}

type TraceAnnotationTaskResult = {
  queueId: string
  createdCount: number
  skippedCount: number
  // ...
}
```

批量和异步任务完成后的聚合结果也返回相同字段，前端可以统一使用最终结果中的 ID 构造链接。

### 目标路由

- 数据集详情：`/projects/:projectId/evaluation/datasets/:datasetId`
- 人工标注任务详情：`/projects/:projectId/evaluation/annotation-queues/:queueId`

两个目标页面分别受 `project:dataset:view` 和 `project:annotation:view` 路由权限保护。

### 现有反馈组件

项目使用 `sonner@2.0.7`。根布局当前配置为：

```tsx
<Toaster duration={1800} visibleToasts={1} />
```

底层 `Toaster` 默认位置为 `top-center`，且 `richColors` 已开启；成功态背景已经绑定 `--success` 主题变量。本需求保留该行为，无需修改全局 `Toaster`。

项目已有 shadcn `Alert`、`AlertTitle` 和 `AlertDescription`，但当前仅提供 `default` 和 `destructive` 两种 variant。为避免业务页面用 `className` 覆写组件核心颜色，本需求应为底层 `Alert` 增加基于现有 `--success` token 的 `success` variant。

## 交互设计

### 成功与异常反馈规则

业务操作成功返回后，将本次操作结果写入 Trace 日志页状态，在视口右上区域固定渲染 `Alert variant='success'`，用于持久反馈和后续跳转，不再额外调用 `toast.success`。接口异常继续使用现有 `toast.error`。

Alert 展示规则：

- 不设置计时器，不自动消失。
- 右上角使用图标按钮关闭，关闭后清空页面状态。
- 同一时间只展示一条；再次操作成功时用最新结果替换旧 Alert。
- 清理表格勾选状态不会清除 Alert。
- 页面卸载后自然清除，不使用 localStorage、sessionStorage 或全局 store 跨页面保留。
- 接口失败时只展示现有 `toast.error`，不创建或覆盖成功 Alert；页面上已有的成功 Alert 保持不变，直到用户关闭或后续成功结果替换。

### 四种结果文案

| 操作 | Alert 标题 | Alert 描述 | 链接文案 |
| --- | --- | --- | --- |
| 加入已有数据集 | 已成功加入数据集 | 成功加入 {successCount} 条 Trace；存在失败时追加“失败 {failureCount} 条” | 查看数据集 |
| 新建数据集并加入 | 已成功创建数据集 | 已加入 {successCount} 条 Trace；存在失败时追加“失败 {failureCount} 条” | 查看数据集 |
| 加入已有人工标注任务 | 已成功加入人工标注任务 | 新增 {createdCount} 条，跳过 {skippedCount} 条 | 查看人工标注任务 |
| 新建人工标注任务并加入 | 已成功创建人工标注任务 | 新增 {createdCount} 条，跳过 {skippedCount} 条 | 查看人工标注任务 |

toast 沿用当前数量文案。Alert 的数量摘要与链接放在同一 `AlertDescription` 内；链接使用下划线和继承色，同时保留清晰的键盘焦点样式，不能只依赖颜色表达可点击状态。

### 跳转行为

- 使用 React Router `Link` 做站内跳转，不直接操作 `window.location`，从而继续兼容 `VITE_APP_BASE_PATH`。
- 动态路径段使用 `encodeURIComponent` 处理。
- 点击 Alert 链接时先清空 Alert 状态，再由 Router 完成页面跳转。
- 数据集链接使用最终结果的 `result.datasetId`。
- 人工标注链接使用最终结果的 `result.queueId`；新建任务场景不依赖前一步创建接口的局部变量。
- 如果当前用户缺少对应详情页的 view 权限，则仍展示成功结果，但不渲染详情链接，避免用户点击后进入 403 页面。

### 状态语义

- `failureCount > 0`：操作至少成功写入一条时展示绿色 Alert，并在正文明确失败数量。
- `createdCount = 0 && skippedCount > 0`：表示请求处理成功但所选 Trace 均已存在，Alert 标题改为“人工标注任务处理完成”，避免误报新增成功；仍允许进入目标任务查看。
- 数据集接口若返回 `successCount = 0` 且存在失败，应按失败结果处理，不展示成功 toast，也不新增绿色 Alert。若现有 API 已对全量失败抛错，则沿用当前错误分支。
- 错误提示继续使用现有 `toast.error`，文案和全局行为不在本次范围内。

## 前端实现设计

### 页面状态与数据流

Alert 需要在表格勾选状态被清空后继续显示，因此不能把 Alert 状态放在可能随批量操作栏卸载的 `TraceLogBulkActions` 内。状态提升到 `TraceLogs` 页面：

```ts
type TraceOperationSuccessNotice = {
  resourceType: 'dataset' | 'annotation'
  title: string
  summary: string
  linkLabel: string
  to?: string
}
```

数据流：

1. `TraceLogs` 保存 `successNotice`，并向 `TraceLogBulkActions` 传入 `onOperationSuccess`。
2. 批量操作成功后直接通过回调提交 Alert 数据，不调用成功 toast。
3. 页面收到新结果后替换旧结果，随后批量操作组件可以安全清空选择和进度状态。
4. Alert 关闭按钮执行 `setSuccessNotice(null)`。

### 持久成功 Alert

新增模块私有 `TraceOperationSuccessAlert`，负责组合现有 UI 组件，不引入全局状态：

```tsx
<Alert variant='success'>
  <CircleCheck />
  <AlertTitle>{notice.title}</AlertTitle>
  <AlertDescription>
    <span>{notice.summary}</span>
    <Link to={notice.to}>{notice.linkLabel}</Link>
  </AlertDescription>
  <Button
    type='button'
    variant='ghost'
    size='icon'
    aria-label='关闭成功提示'
    onClick={onClose}
  >
    <X />
  </Button>
</Alert>
```

Alert 使用固定定位，不占用页面文档流。建议定位容器：

```tsx
<div className='fixed inset-x-4 top-20 z-40 sm:right-6 sm:left-auto sm:w-full sm:max-w-md'>
  <TraceOperationSuccessAlert ... />
</div>
```

- 桌面端距离视口顶部约 `5rem`、右侧约 `1.5rem`，避免紧贴浏览器边缘，也避开页面顶部导航。
- 窄屏端左右各保留 `1rem`，Alert 使用剩余可用宽度，不产生横向溢出。
- 使用 `z-40` 使 Alert 高于普通页面内容，但低于项目现有 `z-50` Dialog、Drawer 等模态覆盖层。
- Alert 使用 `shadow-lg` 提升悬浮层与页面内容之间的层次区分。
- 固定 Alert 可能覆盖少量页面内容，但不会改变导航、筛选区或表格的原有布局；用户可随时手动关闭。

为 `src/components/ui/alert.tsx` 增加通用 `success` variant，使用不透明的 `bg-success` 背景和 `text-success-foreground` 前景色；描述、链接和关闭按钮沿用 success foreground 体系。关闭按钮 hover 时保持透明背景和原前景色，不产生视觉变化，但保留键盘焦点环。业务组件只负责布局，不使用硬编码颜色或 `className` 改写 Alert 核心视觉。无需修改 `src/components/ui/sonner.tsx` 或主题 token。

### 成功分支调整

1. `handleAddToDataset` 使用 `result.datasetId` 生成数据集详情链接，并根据 `values.mode` 选择“加入”或“创建”文案。
2. `handleCreateAnnotationTask` 使用 `result.queueId` 生成已有任务详情链接。
3. `handleCreateAnnotationQueueAndTask` 使用最终 `result.queueId` 生成新任务详情链接。
4. 三个处理函数不再调用 `toast.success`，只调用 `onOperationSuccess` 更新页面 Alert。
5. 三个处理函数继续在 Alert 创建后清空选择和重置进度状态。

### 关联缺陷处理

当前 `handleCreateAnnotationTask` 捕获异常后只显示错误 toast，没有继续抛出。`TraceAnnotationDialog` 因而会把失败误判为提交完成并关闭弹窗；新建人工标注和数据集分支则会正确抛出。

实现本需求时应在该错误分支补充 `throw error`，使四种模式保持一致：失败时保留弹窗和用户输入，不展示成功 toast，也不创建成功 Alert。

## 视觉与可访问性

- Alert 的绿色来自既有 `--success` token，不新增硬编码色值。
- Alert 使用 `CircleCheck` 图标并保留标题文本，不能只依赖图标或颜色传递成功状态。
- Alert 关闭按钮必须具备 `aria-label='关闭成功提示'`。
- 链接文本必须描述目标资源，不使用含义模糊的“点击这里”。
- 成功结果和跳转链接由 Alert 承载；异常信息由 toast 承载。
- Alert 使用 fixed 定位，但与顶部、右侧保持间距，且层级低于 Dialog/Drawer。
- 窄屏下 Alert 左右保留安全间距，关闭按钮和链接保持可点击、可聚焦。

## 影响文件

预计修改：

```text
pa-eval-frontend/src/components/ui/alert.tsx
pa-eval-frontend/src/modules/app-observability/views/trace-logs.tsx
pa-eval-frontend/src/modules/app-observability/components/trace-log-bulk-actions.tsx
pa-eval-frontend/src/modules/app-observability/components/trace-operation-success-alert.tsx
pa-eval-frontend/src/tests/app-observability/trace-log-bulk-success-feedback.test.tsx
```

无需修改：

- `pa-eval-backend/`
- `src/components/ui/sonner.tsx`
- `src/components/layout/root-layout.tsx`
- 数据集与人工标注接口契约

## 测试范围

### 自动测试

- 加入已有数据集成功：不调用 `toast.success`，使用返回的 `datasetId` 显示“查看数据集”Alert 链接和正确详情路径。
- 新建数据集成功：Alert 标题区分“创建”，链接使用新资源 ID。
- 加入已有人工标注任务成功：Alert 使用返回的 `queueId` 和“加入”文案。
- 新建人工标注任务成功：Alert 使用最终结果 `queueId` 和“创建”文案。
- 四种成功结果均只触发 Alert，不调用成功 toast。
- 接口异常继续调用 `toast.error`。
- Alert 使用 `success` variant，固定在视口右上区域且没有自动关闭逻辑。
- Alert 关闭按钮具有正确 aria-label，点击后清除状态。
- 清空表格选择后 Alert 仍然存在，新成功结果会替换旧 Alert。
- 数据集部分失败和人工标注跳过数量正确显示。
- 人工标注全部跳过时使用“处理完成”文案。
- 缺少目标详情 view 权限时不渲染链接。
- 已有人工标注提交失败时异常继续向上抛出，弹窗不会被当作成功关闭。

### 手工验收

1. 进入 `/projects/proj_a/observability/traces/logs` 并勾选一条或多条 Trace。
2. 分别执行四种已有/新建操作。
3. 确认成功时没有出现 `toast.success`。
4. 确认视口右上区域出现绿色 Alert，与顶部和右侧保留间距，且结果数量正确。
5. 点击 Alert 右上角关闭按钮，确认 Alert 立即消失。
6. 再次操作并点击 Alert 中的链接，确认进入对应资源详情页。
7. 模拟部分失败、全部跳过和接口失败，确认状态文案及弹窗保留行为符合设计。
8. 使用键盘聚焦链接与关闭按钮，确认焦点可见且可操作。

## 非目标

- 不重设计“加入数据集”或“发起人工标注”弹窗。
- 不改变批量选择、跨页全选、异步任务轮询和 Query 缓存策略。
- 不修改全站 toast 的位置、时长或关闭方式。
- 不为其他页面批量增加持久成功 Alert。
- 不新增后端接口、数据库表或字段。
