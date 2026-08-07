# TreeSelect 组件使用规范

## 适用任务

- 在表单、弹窗或筛选区域中从树结构数据里选择一个节点。
- 需要展示目录路径、搜索节点，并限制只能选择特定类型节点。

## 组件定位

`TreeSelect` 是基于 `Popover`、`ScrollArea` 和 `TreeView` 封装的树形单选选择器，放在 `src/components/common/tree-select.tsx`。

组件只负责打开下拉层、展示当前选中值、渲染树列表并在选择后关闭下拉层。它不负责字段标签、表单校验、接口请求、空值清除或多选。调用方必须通过 `value` 和 `onValueChange` 维护选中状态。

## 导入

```tsx
import { TreeSelect, type TreeSelectNode } from '@/components/common/tree-select'
```

`TreeSelectNode` 与 `TreeViewNode` 类型一致：

```ts
type TreeSelectNode = {
  id: string
  parentId: string | null
  name: string
  kind: 'folder' | 'item'
  order: number
  disabled?: boolean
}
```

## Props

```ts
type TreeSelectProps<TNode extends TreeSelectNode> = {
  nodes: TNode[]
  value?: string | null
  onValueChange: (node: TNode) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  selectableKinds?: TNode['kind'][]
  disabled?: boolean
  className?: string
  popoverClassName?: string
  getDisplayValue?: (node: TNode, path: TNode[]) => React.ReactNode
  renderIcon?: (node: TNode) => React.ReactNode
  renderNodeMeta?: (node: TNode) => React.ReactNode
}
```

字段说明：

- `nodes`：扁平树节点数组，结构规则同 `TreeView`。
- `value`：当前选中节点 id；未选择时传 `null` 或 `undefined`。
- `onValueChange`：选择可选节点后触发，并自动关闭 Popover。
- `placeholder`：未选择时按钮内展示文案，默认 `请选择`。
- `searchPlaceholder`：下拉树搜索框提示，默认 `搜索名称`。
- `emptyText`：无节点或搜索无结果时展示文案，默认 `暂无数据`。
- `selectableKinds`：限制可选节点类型，例如 `['item']`。传 `[]` 表示没有节点可选。
- `disabled`：禁用选择器按钮和下拉打开。
- `className`：追加到触发按钮，用于布局宽度等外部控制。
- `popoverClassName`：追加到下拉层，用于调整下拉宽度、高度等布局。
- `getDisplayValue`：自定义按钮内选中值展示，接收选中节点和从根到当前节点的路径。
- `renderIcon`：自定义树中节点图标；未返回内容时使用默认文件图标。
- `renderNodeMeta`：在节点右侧渲染补充信息，例如数量、状态或标签。

## 推荐用法

### 选择叶子节点

```tsx
const [targetDatasetId, setTargetDatasetId] = useState<string | null>(null)

<TreeSelect
  nodes={nodes}
  value={targetDatasetId}
  selectableKinds={['item']}
  placeholder='选择目标数据集'
  searchPlaceholder='搜索数据集或目录'
  emptyText='暂无可选数据集'
  onValueChange={(node) => setTargetDatasetId(node.id)}
/>
```

### 在弹窗表单中使用

```tsx
<FormDialog
  open={open}
  onOpenChange={setOpen}
  title='移动数据项'
  confirmText='移动'
  confirmProps={{ disabled: !targetDatasetId || isSubmitting }}
  onConfirm={() => {
    if (!targetDatasetId) return
    void moveItems(targetDatasetId)
  }}
>
  <TreeSelect
    nodes={nodes}
    value={targetDatasetId}
    selectableKinds={['item']}
    disabled={isSubmitting}
    placeholder='选择目标数据集'
    onValueChange={(node) => setTargetDatasetId(node.id)}
  />
</FormDialog>
```

### 自定义显示路径和节点图标

```tsx
<TreeSelect
  nodes={nodes}
  value={selectedId}
  selectableKinds={['item']}
  getDisplayValue={(_, path) => path.map((item) => item.name).join(' / ')}
  renderIcon={(node) =>
    node.kind === 'item' ? (
      <DatabaseIcon className='text-muted-foreground size-4 shrink-0' />
    ) : undefined
  }
  renderNodeMeta={(node) =>
    node.kind === 'item' ? (
      <span className='text-muted-foreground text-xs'>{node.sampleCount}</span>
    ) : null
  }
  onValueChange={(node) => setSelectedId(node.id)}
/>
```

## 交互规则

- 触发按钮使用 `role='combobox'`，点击后打开 Popover。
- 未选中时展示 `placeholder`，选中后默认展示节点路径，格式为 `父级 / 子级 / 当前节点`。
- 下拉层宽度默认跟随触发按钮宽度。
- 下拉树启用搜索，搜索规则继承 `TreeView`：只匹配 `name`，保留命中节点祖先并自动展开。
- 选择节点后如果节点 `disabled` 为 `true`，不会触发 `onValueChange`。
- 成功选择节点后调用 `onValueChange(node)` 并关闭 Popover。
- 当前选中节点右侧显示 `Check` 图标；`renderNodeMeta` 会与选中图标一起出现在节点右侧。

## 数据与状态边界

- `TreeSelect` 不提供清空按钮。需要清空时，在外层表单或字段操作中把受控值设置为 `null`。
- `TreeSelect` 不做必填校验。表单提交按钮禁用、错误提示和字段描述由调用方负责。
- 选择器内部根据 `nodes.find((node) => node.id === value)` 查找当前选中节点；因此 `value` 必须能在当前 `nodes` 中找到，否则展示 placeholder。
- `getDisplayValue` 可以返回 ReactNode，但调用方仍应保证内容在按钮内可截断，不要传入过宽的交互控件。

## 与 TreeView 的关系

- `TreeSelect` 内部固定使用 `TreeView` 的 `searchable` 模式。
- `TreeSelect` 会把 `selectableKinds`、`emptyText`、`searchPlaceholder`、`renderIcon` 和 `renderNodeMeta` 转换后传给 `TreeView`。
- `TreeSelect` 不暴露 `TreeView` 的编辑、创建、删除、拖拽、展开状态控制能力。需要完整树管理时直接使用 `TreeView`。

## 禁止事项

- 不要把 `TreeSelect` 当作多选组件使用。
- 不要在 `onValueChange` 中忽略被选节点，否则按钮展示会与业务状态不一致。
- 不要依赖 placeholder 作为唯一字段名称；表单场景应由外层字段结构提供 label。
- 不要在 `renderNodeMeta` 中放置会触发复杂交互的按钮；需要节点操作时直接使用 `TreeView`。
- 不要传嵌套 children 数据，节点结构必须与 `TreeViewNode` 保持一致。

## 检查清单

使用或修改 `TreeSelect` 时确认：

- `nodes` 是扁平树节点数组，`id` 与 `parentId` 关系稳定。
- `value` 使用节点 id，空值使用 `null` 或 `undefined`。
- `selectableKinds` 与业务目标一致，例如只允许选数据集时传 `['item']`。
- 表单必填、提交禁用、清空逻辑由调用方处理。
- 自定义图标、元信息不会破坏行高和按钮截断。
- 仅改说明文档时不需要运行前端构建；涉及代码变更时运行 `npm run typecheck`。
