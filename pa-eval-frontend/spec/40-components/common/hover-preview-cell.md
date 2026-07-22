# HoverPreviewCell 组件使用规范

## 适用任务

- 在表格、列表或紧凑信息区展示长文本、JSON、Markdown 片段、Trace payload、评分摘要等需要“短文本截断 + 悬浮查看完整内容”的场景。

## 组件定位

`HoverPreviewCell` 是项目通用的长内容预览单元格组件，放在 `src/components/common`。它基于 shadcn/ui 的 `HoverCard`，统一处理：

- 表格单元格内的单行截断展示。
- hover 后展示可滚动的完整内容。
- 单元格按钮点击时阻止事件冒泡，避免误触发行点击、选中或展开行为。
- 空值兜底展示。

`HoverPreviewCell` 不负责业务格式化、接口请求、权限判断、复制、编辑或跳转。调用方应先把业务数据转换为要展示的字符串，再传入组件。

## 导入

```tsx
import { HoverPreviewCell } from '@/components/common/hover-preview-cell'
```

## Props 契约

```tsx
type HoverPreviewCellProps = {
  label: string
  value?: string | null
  detailValue?: string | null
  emptyValue?: string
  triggerClassName?: string
  contentClassName?: string
  preClassName?: string
}
```

规则：

- `label` 用于悬浮内容标题，应传入当前列或字段名，例如 `Input`、`Output`、`评分摘要`。
- `value` 是单元格内展示的短文本。组件会执行 `trim()`，空字符串、`null`、`undefined` 均显示 `emptyValue`。
- `detailValue` 是 hover 后展示的完整文本。未传或为空时使用 `value` 的展示结果。
- `emptyValue` 默认是 `-`。只有当前业务场景已有不同空值语义时才覆盖。
- `triggerClassName` 用于约束单元格宽度、字体或局部排版，例如 `max-w-[260px] font-mono`。
- `contentClassName` 用于调整悬浮层宽度和视口约束，例如 `w-[560px] max-w-[calc(100vw-2rem)]`。
- `preClassName` 用于调整完整内容区的字体、滚动高度或换行方式，不用于写业务颜色。

## 推荐用法

普通长文本列：

```tsx
<HoverPreviewCell
  label='Output'
  value={row.original.output}
  triggerClassName='max-w-[260px] font-mono'
/>
```

短文本和完整内容不同的 JSON 列：

```tsx
<HoverPreviewCell
  label='Metadata'
  value={JSON.stringify(row.original.metadata)}
  detailValue={JSON.stringify(row.original.metadata, null, 2)}
  triggerClassName='max-w-[260px] font-mono'
  contentClassName='w-[560px] max-w-[calc(100vw-2rem)]'
/>
```

空值需要在外层提前判断的场景：

```tsx
const text = formatTracePayloadPreview(row.original.input)

return text === '-' ? (
  <span className='text-muted-foreground'>-</span>
) : (
  <HoverPreviewCell
    label='Input'
    value={text}
    detailValue={formatTracePayloadDetail(row.original.input)}
    triggerClassName='max-w-[260px] font-mono'
  />
)
```

## 数据格式化规则

- JSON、数组、对象等结构化数据应在调用方格式化，不在组件内部判断数据类型。
- 单元格 `value` 可以是压缩字符串，`detailValue` 推荐使用格式化后的多行字符串。
- 需要兼容非 JSON 字符串时，格式化 helper 应捕获 `JSON.parse` 异常并回退原文本。
- 长 ID、payload、评分摘要等技术内容优先使用 `font-mono`。
- 不要把 `unknown`、对象或数组直接传给组件；组件只接收字符串或空值。

## 样式规则

- 默认触发器样式为 `block w-full truncate text-left text-xs`，适合表格单元格单行展示。
- 默认触发器使用 `text-muted-foreground`，hover 时切到 `text-foreground`。
- 默认悬浮层宽度为 `w-[520px]`，内容区最大高度为 `max-h-80` 并可滚动。
- 悬浮内容使用 `pre` 和 `whitespace-pre-wrap`，保留换行并允许长文本换行。
- 表格列应通过 `meta.className` 或 `triggerClassName` 设置明确的最小/最大宽度，避免列宽抖动。
- 小屏或较窄容器内使用时，应通过 `contentClassName='max-w-[calc(100vw-2rem)]'` 避免悬浮层超出视口。

## 交互边界

- 组件内部点击 trigger 会 `stopPropagation()`，适合嵌入有行点击、行选择、展开行的表格。
- 如果单元格本身需要点击打开详情、复制或跳转，不要把该行为塞进 `HoverPreviewCell`；应创建业务私有组件，或组合 `Button`、`CopyableText`、`HoverCard` 实现明确交互。
- hover 预览只用于辅助查看，不作为必须点击才能访问的核心操作入口。
- 需要编辑大段 JSON、Markdown 或文本时，使用 `MixEditor`，不要用 hover 预览承载编辑能力。

## 禁止事项

- 不要在业务列里重复手写同样的 `HoverCard`、`HoverCardTrigger`、`HoverCardContent` 预览结构。
- 不要在 `HoverPreviewCell` 中新增业务字段名、模块枚举、API 请求或权限逻辑。
- 不要用 `contentClassName`、`preClassName` 写硬编码颜色；优先使用语义 token。
- 不要在悬浮层中放复杂表单、批量操作按钮或异步加载列表。
- 不要依赖悬浮层展示敏感密钥、Token 或内部口令。

## 检查清单

使用或修改 `HoverPreviewCell` 时确认：

- `label` 是可读的字段名，不为空。
- `value` 和 `detailValue` 已在调用方完成业务格式化。
- 空值展示符合当前页面语义。
- 表格列宽、触发器截断和悬浮层视口约束清晰。
- 行点击、行选择、展开行等表格交互不会被误触发。
- 修改组件默认结构、延迟、样式或事件处理时，更新 `src/tests/common/hover-preview-cell-source.test.ts`。
- 文档或代码改动后按影响范围运行 `npm run typecheck`，必要时补充 `npm run lint`。
