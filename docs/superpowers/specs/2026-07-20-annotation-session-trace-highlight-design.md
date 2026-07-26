# 人工标注会话 Trace 自动定位与高亮设计

## 背景

人工标注队列列表和批量标注工作台点击会话 ID 时，目前只把 `sessionId` 传给 `SessionTraceDialog`。弹窗不知道用户是从哪一条 Trace 打开的，因此无法高亮原始 Trace；当会话包含多页数据时，也无法直接定位到目标 Trace 所在页。

## 目标

- 两个人工标注入口同时传递原始 `sessionId` 和 `traceId`。
- 会话弹窗保持现有创建时间升序，不改变任何排序规则。
- 弹窗首次打开时自动定位到目标 Trace 所在分页。
- 目标 Trace 行使用语义化主题样式高亮，并自动滚动到可视区域中部。
- 用户手动翻页时按正常分页工作，不被再次强制跳回目标页。
- 找不到目标 Trace 时仍正常显示会话第一页，不阻塞使用。

## 数据流

1. 人工标注列表或批量工作台点击会话 ID。
2. 页面保存 `{ sessionId, traceId }` 作为当前会话选择。
3. `SessionTraceDialog` 首次请求携带 `sessionId`、`anchorTraceId`、`page=1` 和当前 `pageSize`。
4. 后端在保持原升序条件下计算目标 Trace 前面的记录数，得到 `anchorPage`。
5. 后端返回目标页数据，并在响应中返回实际 `page`。
6. 前端同步分页状态，在匹配 `traceId` 的 `TableRow` 上添加高亮样式并滚动到可视区域。
7. 后续上一页、下一页请求不再携带 `anchorTraceId`。

## 后端设计

`GET /api/projects/{projectId}/traces` 新增可选查询参数：

```text
anchorTraceId
```

仅当同时存在 `sessionId` 和 `anchorTraceId` 时执行定位：

- 使用与列表完全相同的过滤条件和升序规则。
- 找到目标 Trace 的 `createdAt` 和 `traceId`。
- 统计排序在目标 Trace 之前的记录数。
- `anchorPage = floor(previousCount / pageSize) + 1`。
- 使用 `anchorPage` 计算 offset，不改变 `ORDER BY createdAt ASC, traceId ASC`。
- 响应增加实际 `page` 字段。

目标不存在或不属于当前过滤结果时使用请求中的原页码，不返回错误。

## 前端设计

### 入口状态

人工标注详情页和批量标注工作台将原来的单字符串状态替换为：

```ts
type SelectedSessionTrace = {
  sessionId: string
  traceId: string
}
```

点击会话 ID 时传入 `item.source.sessionId` 和 `item.source.traceId`。如果源数据缺少 Trace ID，则传空字符串，弹窗只按原逻辑展示会话第一页。

### 弹窗定位

`SessionTraceDialog` 新增 `highlightTraceId` 属性。分页状态以 `null` 表示首次锚点请求，弹窗直接使用响应中的实际 `page` 作为当前页展示；用户手动翻页后写入明确页码，后续请求不再携带锚点。该模型不需要在 effect 中同步分页状态。

父页面使用 `sessionId + traceId` 作为弹窗 key，保证在同一会话点击不同 Trace 时重新执行定位。

### 行高亮

目标行使用：

```tsx
className={cn(isHighlighted && 'bg-accent/60 hover:bg-accent/60')}
aria-current={isHighlighted ? 'true' : undefined}
```

渲染完成后调用目标行的 `scrollIntoView({ block: 'center' })`。不新增徽标、不改变列内容、不调整数组顺序。

## 测试范围

### 后端

- 锚点位于第一页时返回 `page=1`。
- 锚点位于后续页时返回正确页码和原升序数据。
- 锚点不存在时保持请求页码。
- 未传 `anchorTraceId` 时维持现有分页行为。

### 前端

- 两个入口都传递 `sessionId + traceId`。
- 首次查询包含 `anchorTraceId`，后续翻页不包含。
- 弹窗使用响应实际页码同步分页。
- 目标行包含语义化高亮、`aria-current` 和滚动定位。
- 现有会话升序说明与分页按钮保持不变。

## 非目标

- 不改变 Trace 查询排序。
- 不把目标 Trace 移动到列表顶部。
- 不修改会话内 Trace 数据内容。
- 不改变非人工标注页面的 Trace 列表行为。
