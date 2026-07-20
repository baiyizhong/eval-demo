# 批量标注源数据 ID 取消悬停展示设计

## 背景

批量标注工作台当前通过通用 `SummaryTableCell` 渲染源数据 ID、Input、Output 和 Metadata。`SummaryTableCell` 内部统一使用 `HoverPreviewCell`，因此源数据 ID 也会在鼠标悬停时打开完整内容展示框。

源数据 ID 本身是简短标识，不需要额外悬停展示框。

## 目标

- 源数据 ID 列只显示普通截断文本。
- 鼠标悬停源数据 ID 时不打开 HoverCard。
- Input、Output 和 Metadata 继续使用 `HoverPreviewCell` 展示完整内容。
- 不修改公共 `HoverPreviewCell` 的 API 或行为。

## 方案

在 `AnnotationItemTableRows` 的 `sourceDataId` 分支中，不再调用 `SummaryTableCell`，直接渲染 `TableCell` 和普通文本：

```tsx
<TableCell className='max-w-[220px]'>
  <span className='block truncate font-mono text-xs'>{item.objectId}</span>
</TableCell>
```

Input、Output、Metadata 仍通过 `SummaryTableCell` 调用 `HoverPreviewCell`，保持原交互。

## 测试

- 断言源数据 ID 分支直接渲染 `item.objectId`，不再调用 `SummaryTableCell`。
- 断言 `SummaryTableCell` 仍使用 `HoverPreviewCell`。
- 运行批量标注页面测试、TypeScript、ESLint 和生产构建。

## 非目标

- 不调整会话 ID 的点击行为。
- 不改变源数据 ID 的列宽、截断和表格行点击逻辑。
- 不修改其他页面的悬停预览交互。
