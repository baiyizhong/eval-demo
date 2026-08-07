# 数据集目录 Tree 前端改造设计

## 背景

本次改造仅限前端，在 `npm run dev:mock` 模式下实现数据集目录树管理与数据集详情页左侧目录树筛选能力，不涉及后端开发。

涉及页面：

- 数据集列表页：`/projects/:projectId/evaluation/datasets`
- 数据集项目列表页：`/projects/:projectId/evaluation/datasets/:datasetId`
- 项目设置页：`/projects/:projectId/settings/general`
- 新增项目设置子页：`/projects/:projectId/settings/datasets`

## 目标

1. 在项目设置中新增“数据集设置”子页，用 tree 管理数据集目录。
2. 封装可复用 tree 组件，优先使用 `@headless-tree/core` 和 `@headless-tree/react`。
3. 在数据集项目列表页左侧增加可显示/隐藏的数据集 tree，右侧保留原数据项列表能力。
4. 通过 mock API 模拟目录 CRUD、排序、数据集归属和数据集节点操作，后续便于替换真实接口。

## 非目标

- 不开发后端接口。
- 不修改 Langfuse 或 Dify 参考代码。
- 不修改 Langfuse 既有表结构。
- 不在数据集项目列表页支持目录编辑、目录删除、目录拖拽。
- 不提供右键菜单。
- 不要求实现热键能力；`@headless-tree` 的键盘能力可保留为库层能力，但不作为本次验收重点。

## 技术选型

引入依赖：

- `@headless-tree/core`
- `@headless-tree/react`

采用 `@headless-tree` 作为树状态和结构管理内核，在项目内封装两层组件：

- `src/components/reui/tree.tsx`
  - 偏底层 tree UI primitive。
  - 对齐参考导入方式，导出 `Tree`、`TreeItem`、`TreeItemLabel`。
- `src/components/common/tree-view.tsx`
  - 通用组合组件。
  - 封装搜索、节点图标、hover actions、inline 编辑、右键菜单扩展点、可选拖拽。
  - 不包含任何数据集业务文案、权限 code、API 请求或路由跳转。

业务适配组件：

- `src/modules/app-evaluation/components/dataset-tree-panel.tsx`
  - 把目录节点和数据集节点映射到通用 tree。
  - 处理数据集新增、编辑、删除、选择等业务事件。
- `src/modules/project-settings/views/dataset-settings.tsx`
  - 项目设置中的数据集目录维护页。

## 通用 Tree 组件设计

推荐节点模型：

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

核心 props：

- `nodes`：受控节点数据。
- `searchable`：是否显示搜索框。
- `editable`：是否允许 inline 编辑。
- `draggable`：是否启用拖拽。
- `selectedId` / `onSelect`：受控选中状态。
- `selectableKinds`：控制哪些节点可触发选择。
- `canDrag(node)`：控制节点是否可拖拽。
- `canDrop(args)`：控制是否允许 drop。
- `renderActions(node)`：渲染 hover/focus 操作图标。
- `contextMenuItems(node)`：右键菜单扩展点，本次业务页不使用。
- `onCreate` / `onRename` / `onDelete` / `onMove`：变更回调。

交互规则：

- 目录折叠图标使用 `FolderIcon`，展开图标使用 `FolderOpenIcon`。
- 数据集节点图标使用 `FileIcon`。
- 查看态展示名称；hover/focus 时展示右侧图标。
- 编辑态使用输入框，`Enter` 保存，`Esc` 取消，失焦保存。
- 空名称不提交，保持编辑态并提示。
- 搜索按名称过滤，保留命中节点的祖先链。
- 搜索内容非空时禁用拖拽，清空搜索后恢复。
- 通用组件支持所有节点类型拖拽，实际是否允许由 `canDrag` / `canDrop` 控制。
- 删除确认放在业务层，通用组件只触发回调。

## 数据模型和 Mock API

新增目录类型：

```ts
type DatasetDirectoryRecord = {
  id: string
  projectId: string
  parentId: string | null
  name: string
  order: number
  createdAt: string
  updatedAt: string
}
```

扩展数据集类型：

```ts
type DatasetRecord = {
  directoryId?: string | null
}
```

目录与数据集关系：

- 一个数据集最多归属一个目录。
- `directoryId` 为空时属于“未分类”。
- “未分类”是前端虚拟分组，不作为真实目录保存。

新增 mock API：

- `GET /api/projects/:projectId/dataset-directories`
- `POST /api/projects/:projectId/dataset-directories`
- `PATCH /api/projects/:projectId/dataset-directories/:directoryId`
- `DELETE /api/projects/:projectId/dataset-directories/:directoryId`
- `PATCH /api/projects/:projectId/dataset-directories/order`

数据集 mock API 调整：

- 创建数据集支持 `directoryId`。
- 更新数据集支持 `directoryId`。
- 数据集列表返回 `directoryId`。
- 删除数据集保持现有行为：删除数据集及其数据项。

删除目录规则：

- 递归删除当前目录及所有子目录。
- 不删除目录下的数据集。
- 被删除目录及其后代目录下的数据集统一移动到“未分类”，即 `directoryId = null`。

## 项目设置：数据集设置页

新增路由：

- `/projects/:projectId/settings/datasets`

设置导航：

- 新增“数据集设置”菜单项。
- 可见权限建议复用 `project:dataset:view`。
- 编辑操作建议复用 `project:dataset:edit`。

页面结构：

- 使用现有 `ProjectSettings` 父页面和 `ContentSection`。
- 标题：`数据集设置`。
- 内容：顶部搜索框和“新建目录”按钮，下方展示目录 tree。

行为：

- 只展示目录类型节点。
- 支持多个根目录。
- 顶部“新建目录”：
  - 未选中目录时，在根级末尾创建目录。
  - 已选中目录时，在选中目录子级末尾创建目录，并展开父目录。
  - 新节点创建后进入编辑态。
- 目录 hover 操作：
  - 新增：在当前目录下创建子目录并进入编辑态。
  - 编辑：进入名称编辑态。
  - 删除：弹确认，确认后递归删除目录并把数据集移到“未分类”。
- 拖拽：
  - 支持根目录排序、同级排序、移动到其它目录下。
  - 搜索状态下禁用拖拽。
  - drop 后调用 mock API 保存排序。

## 数据集项目列表页

目标页面：

- `/projects/:projectId/evaluation/datasets/:datasetId`

页面结构：

- 左侧新增 `DatasetTreePanel`，宽度固定约 `280px`，内部可滚动。
- 右侧保留原来的数据集详情、指标、数据项表格、新建数据项抽屉等能力。
- 列表上左侧增加“显示/隐藏”按钮，用于控制左侧 tree 显示状态。

Tree 行为：

- 不支持拖拽。
- 不支持目录编辑。
- 不支持目录删除。
- 不提供右键菜单。
- 目录节点点击只展开或折叠，不请求右侧数据。
- 数据集节点点击后，右侧原地请求并展示该数据集的数据项。
- 当前选中的数据集节点高亮。
- “未分类”作为虚拟分组展示无目录数据集。

初始化规则：

- 如果 URL 中的 `datasetId` 有效，选中该数据集。
- 如果 URL 中的 `datasetId` 无效或没有选中项，默认选中第一个目录下的第一个数据集。
- 如果目录下没有数据集，则选中全局第一个数据集。
- 如果没有任何数据集，右侧仍渲染现有表格区域并展示空列表。

URL 规则：

- 选中不同数据集时，默认同步 URL 到 `/projects/:projectId/evaluation/datasets/:datasetId`。
- 页面组件体验保持原地切换，右侧通过新的 `datasetId` 重新请求数据。
- 同步 URL 用于刷新、复制链接和浏览器返回。

hover 图标：

- 目录节点：显示新增图标，用于在该目录下新建数据集。
- 数据集节点：显示编辑、删除图标。
- “未分类”下的数据集同样支持编辑和删除。

新建数据集：

- 点击目录新增图标打开现有 `DatasetFormDrawer`。
- 提交时创建数据集，并带上当前目录的 `directoryId`。
- 从“未分类”新增时 `directoryId = null`。
- 创建成功后刷新 tree 和数据集相关 query。
- 创建成功后默认选中新建的数据集，并在右侧原地请求数据项列表。

编辑数据集：

- 点击数据集节点编辑图标打开现有 `DatasetFormDrawer`。
- 保存后刷新 tree、数据集详情和列表 query。

删除数据集：

- 点击数据集节点删除图标弹确认。
- 确认后复用现有删除数据集逻辑。
- 如果删除的是当前选中数据集，则自动选中下一个可用数据集。
- 如果没有任何可用数据集，右侧展示空列表。

## 数据流

目录 query：

- `['project-dataset-directories', $api, projectId]`

数据集 query：

- 现有数据集列表 query 保持。
- `DatasetTreePanel` 可使用完整数据集列表查询，按 tree 渲染需要拉取较大的 `pageSize`。

详情页 query：

- 选中数据集变化后，现有 `project-dataset`、`project-dataset-metrics`、`project-dataset-items`、`project-dataset-item-status-counts` 按新的 `datasetId` 请求。

invalidate 规则：

- 目录新增、编辑、删除、排序后刷新 `project-dataset-directories`。
- 数据集新增、编辑、删除后刷新 `project-datasets` 和 tree 使用的数据集 query。
- 当前数据集变化或被编辑/删除后刷新相关 detail/items/metrics/status-counts query。

## 错误处理

- API 异常使用 `toast.error` 展示用户可理解的错误文案。
- 删除目录、删除数据集使用现有确认组件或 `@/lib/confirm`，不使用 `window.confirm`。
- 空目录名不提交，提示后保持编辑态。
- 无权限时隐藏编辑、新增、删除等操作。
- 数据集为空时，右侧仍展示表格空状态，不跳转到错误页。

## 测试和验收

建议补充测试：

- 通用 tree 搜索时保留祖先链。
- 搜索内容非空时拖拽禁用。
- 数据集设置页新增、重命名、删除目录行为。
- 删除目录后数据集移动到未分类。
- 数据集项目列表初始化默认选中第一个可用数据集。
- 点击数据集节点后右侧使用新 `datasetId` 请求数据项。
- 未分类数据集支持编辑和删除。
- 删除当前选中数据集后自动选中下一个可用数据集或显示空列表。
- 设置导航包含“数据集设置”。

验证命令：

```bash
npm run typecheck
npm run lint
npm run build
```

## 已确认决策

本设计已明确以下决策：

- 采用 `@headless-tree/core` 和 `@headless-tree/react`。
- mock API 模拟真实接口形态。
- 目录删除不删除数据集，只移动到未分类。
- 数据集项目列表页不提供右键菜单。
- 数据集项目列表页不支持删除目录。
- 未分类下的数据集支持编辑和删除。
- 无选中数据集或无数据项时，右侧展示空列表。
