# TreeView 组件使用规范

## 适用任务

- 展示目录、数据集、分类等树形列表。
- 需要在树节点中支持搜索、选择、展开收起、内联重命名、创建入口或拖拽移动。

## 组件定位

`TreeView` 是项目内通用的受控树组件，放在 `src/components/common/tree-view.tsx`。它基于 `@headless-tree/core`、`@headless-tree/react` 和项目内 `Tree` UI primitive 实现。

组件只负责树结构展示和本地交互事件派发，不负责接口请求、权限判断、确认弹窗、成功提示、业务数据转换或持久化。调用方需要把业务数据转换为扁平节点数组，并处理 `onSelect`、`onCreate`、`onRename`、`onMove` 等回调。

## 导入

```tsx
import {
  TreeView,
  type TreeViewMoveInput,
  type TreeViewNode,
} from '@/components/common/tree-view'
```

## 节点数据结构

```ts
type TreeViewNode = {
  id: string
  parentId: string | null
  name: string
  kind: 'folder' | 'item'
  order: number
  disabled?: boolean
}
```

字段说明：

- `id`：节点唯一标识。不要使用与内部根节点冲突的 `root`。
- `parentId`：父节点 id，根层节点传 `null`。
- `name`：节点展示名称，也是搜索匹配字段。
- `kind`：`folder` 表示目录节点，`item` 表示叶子或业务实体节点。
- `order`：同级排序字段。当前实现会先按 `name` 的中文 locale 排序，再用 `order` 兜底。
- `disabled`：禁用节点选择和拖拽，并降低视觉权重。

调用方可以在泛型节点中附加业务字段：

```tsx
type DatasetTreeNode = TreeViewNode & {
  datasetId?: string
  directoryId?: string
}
```

## Props

```ts
type TreeViewMoveInput = {
  id: string
  parentId: string | null
  order: number
}

type TreeViewProps<TNode extends TreeViewNode> = {
  nodes: TNode[]
  title?: React.ReactNode
  selectedId?: string | null
  expandedIds?: string[]
  searchable?: boolean
  editable?: boolean
  draggable?: boolean
  allowDeselect?: boolean
  searchPlaceholder?: string
  clearable?: boolean
  createLabel?: string
  createIconOnly?: boolean
  emptyText?: string
  selectableKinds?: TNode['kind'][]
  editingId?: string | null
  onEditingIdChange?: (id: string | null) => void
  onSelect?: (node: TNode) => void
  onDeselect?: () => void
  onExpandedIdsChange?: (ids: string[]) => void
  onCreate?: (parentId: string | null) => void
  onRename?: (node: TNode, name: string) => Promise<void> | void
  onDelete?: (node: TNode) => void
  onMove?: (moves: TreeViewMoveInput[]) => Promise<void> | void
  canDrag?: (node: TNode) => boolean
  canDrop?: (args: {
    node: TNode
    targetNode: TNode
    parentId: string | null
  }) => boolean
  renderItemIcon?: (node: TNode) => React.ReactNode
  renderActions?: (node: TNode) => React.ReactNode
}
```

规则：

- `nodes` 必须是扁平数组，不要传嵌套 children。父节点必须能通过 `parentId` 在同一数组中找到。
- `selectedId`、`expandedIds`、`editingId` 都由调用方维护；组件不会自行持久化这些业务状态。
- `searchable` 为 `true` 时显示搜索框。搜索只匹配 `name`，并保留命中节点的祖先链路。
- `editable` 为 `true` 且 `editingId` 等于当前节点 id 时进入内联编辑。
- `draggable` 为 `true` 时启用原生 HTML 拖拽；搜索状态下会自动禁用拖拽。
- `selectableKinds` 用于限制可选节点类型。传 `['item']` 表示只允许选择实体节点；传 `[]` 表示所有节点都不可选。
- `createLabel` 存在时显示创建按钮；点击时调用 `onCreate(selectedId ?? null)`。
- `onDelete` 当前不会由组件自动触发。删除入口应通过 `renderActions` 自行渲染，并在调用方接入 `confirm` 与接口。
- `renderItemIcon` 只替换 `item` 节点图标；`folder` 节点使用内置文件夹展开/收起图标。
- `renderActions` 渲染在节点行右侧，默认仅在 hover 或 focus-within 时显示。按钮点击时应 `event.stopPropagation()`，避免触发节点选择。

## 推荐用法

### 只读可选树

```tsx
const [selectedId, setSelectedId] = useState<string | null>(null)
const [expandedIds, setExpandedIds] = useState<string[]>([])

<TreeView
  title='数据集列表'
  nodes={nodes}
  selectedId={selectedId}
  expandedIds={expandedIds}
  onExpandedIdsChange={setExpandedIds}
  searchable
  selectableKinds={['item']}
  emptyText='暂无数据集'
  onSelect={(node) => setSelectedId(node.id)}
/>
```

### 目录管理树

```tsx
const [editingId, setEditingId] = useState<string | null>(null)
const [expandedIds, setExpandedIds] = useState<string[]>([])

<TreeView
  nodes={directoryNodes}
  selectedId={selectedDirectoryId}
  expandedIds={expandedIds}
  editingId={editingId}
  onEditingIdChange={setEditingId}
  onExpandedIdsChange={setExpandedIds}
  searchable
  editable={canEdit}
  draggable={canEdit}
  createLabel={canEdit ? '新建目录' : undefined}
  createIconOnly
  selectableKinds={[]}
  onCreate={(parentId) => {
    if (!canEdit) return
    void createDirectory(parentId)
  }}
  onRename={async (node, name) => {
    if (!canEdit) return
    await renameDirectory({ id: node.id, name })
  }}
  onMove={async (moves) => {
    if (!canEdit) return
    await updateDirectoryOrder(moves)
  }}
  renderActions={(node) =>
    canEdit ? (
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='size-7'
        aria-label='重命名目录'
        title='重命名目录'
        onClick={(event) => {
          event.stopPropagation()
          setEditingId(node.id)
        }}
      >
        <Edit2 className='size-4' />
      </Button>
    ) : null
  }
/>
```

### 限制拖拽范围

```tsx
<TreeView
  nodes={nodes}
  draggable={canEdit}
  canDrag={(node) => node.kind === 'item'}
  canDrop={({ node, targetNode, parentId }) => {
    if (node.kind !== 'item') return false
    if (targetNode.kind !== 'folder') return false
    return parentId !== node.parentId
  }}
  onMove={async ([move]) => {
    if (!move) return
    await moveDataset({
      datasetId: move.id,
      directoryId: move.parentId,
    })
  }}
/>
```

## 交互规则

- 点击可选节点会触发 `onSelect(node)`。
- `allowDeselect` 为 `true` 且点击当前选中节点时，触发 `onDeselect()`。
- 不可选的 folder 节点被点击时，如果有子节点，则切换展开状态；没有子节点则无动作。
- 点击行首折叠图标只切换展开状态，不触发选择。
- 搜索时自动展开命中节点的祖先目录；清空搜索后恢复调用方传入的 `expandedIds`。
- 重命名时，空名称会通过 `toast.error('名称不能为空')` 拦截，不调用 `onRename`。
- 重命名提交发生在输入框 blur 或 Enter；Escape 只取消编辑。
- 拖拽到 folder 时，移动到该目录末尾；拖拽到 item 时，移动到该 item 所在父级并使用目标 item 的 `order`。

## 数据与状态边界

- API 数据转换应放在页面、业务组件或 `lib` adapter 中，不要把后端字段直接泄漏为组件约束。
- 创建、重命名、移动、删除操作完成后，调用方负责刷新查询缓存、同步 `expandedIds`、清理 `editingId` 并展示业务提示。
- 权限判断应在调用方完成，例如未授权时不传 `editable`、`draggable`、`createLabel` 或操作按钮。
- 删除节点必须由调用方使用 `@/lib/confirm` 或等价项目确认组件处理，不要在 `TreeView` 内使用浏览器原生确认。

## 禁止事项

- 不要传嵌套树数据或依赖组件解析 `children` 字段。
- 不要在节点 id 中使用 `root`。
- 不要把业务接口请求、权限、React Query cache 更新写入 `TreeView`。
- 不要在搜索状态下假定拖拽可用。
- 不要在 `renderActions` 的按钮点击里遗漏 `event.stopPropagation()`。
- 不要通过 `className` 或自定义图标覆盖内部语义颜色体系；需要新能力时先评估是否扩展组件 props。

## 检查清单

使用或修改 `TreeView` 时确认：

- `nodes` 是扁平数组，`id` 稳定且全局唯一。
- `parentId` 引用存在，根层节点使用 `null`。
- 选择、展开、编辑状态由调用方受控。
- `selectableKinds` 与业务选择规则一致。
- 拖拽时同时设置 `draggable`、`onMove`，必要时补充 `canDrag`、`canDrop`。
- 操作按钮已阻止事件冒泡。
- 仅改说明文档时不需要运行前端构建；涉及代码变更时运行 `npm run typecheck`。
