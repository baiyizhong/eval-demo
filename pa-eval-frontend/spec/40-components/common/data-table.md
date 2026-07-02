# DataTable 组件使用规范

## 适用任务

- 处理与本文标题相关的开发、重构或评审任务。

## 相关源码

- 以本文后续“适用范围”“项目事实”“组件定位”“文件职责”列出的路径为准。

## 必读前置

- `spec/README.md`

## 核心规则

- 先阅读本文后续的目标、必须遵守、规则和使用约定，再修改代码。

## 推荐示例

- 优先采用本文后续推荐用法和模板示例。

## 禁止事项

- 以本文后续“禁止事项”“约束”“大模型修改约束”为准。

## 检查清单

- 按本文后续检查清单和 `spec/README.md` 验证命令完成自检。

## 组件定位

`DataTable` 是项目内通用的表格组件。它负责统一列表页中的表格骨架、服务端分页、URL 状态同步、顶部工具栏、高级筛选、列显隐、加载态、错误态、空状态和批量操作入口。

`DataTable` 不负责业务语义。列定义、筛选配置、接口调用、行操作、批量操作、弹窗内容、权限规则和数据转换都由业务模块通过 props 注入。

默认后端分页响应结构为：

```ts
type DataTableListResponse<TData> = {
  total: number
  datas: TData[]
}
```

如果接口返回结构不一致，通过 `request.selectRows` 和 `request.selectTotal` 适配，不要在 `DataTable` 内写业务兼容逻辑。

## 导入

```tsx
import {
  DataTable,
  DataTableProvider,
  useDataTableContext,
  type DataTableListResponse,
  type DataTableQueryState,
} from '@/components/common/data-table'
```

## 页面布局

列表页外层默认使用 `Page`。页面内容使用纵向布局，顶部放 `PageAction` 或 `PageNav`，主体表格放入独立 `section`。

只需要返回按钮、中间条件插槽和右侧操作按钮时，使用 `PageAction`：

```tsx
export function ModuleListPage() {
  return (
    <Page>
      <div className='flex flex-col gap-4'>
        <PageAction
          showBackButton
          buttonGroups={{
            buttons: [],
          }}
        >
          <div className='flex flex-wrap items-center gap-2'>
            {/* page-level controls */}
          </div>
        </PageAction>

        <section className='min-w-0 rounded-lg border bg-card p-4 text-card-foreground'>
          <DataTable<RowRecord, DataTableListResponse<RowRecord>>
            columns={columns}
            request={request}
          />
        </section>
      </div>
    </Page>
  )
}
```

需要二级导航时，使用 `PageNav`：

```tsx
export function ModuleListPage() {
  return (
    <Page>
      <div className='flex flex-col gap-4'>
        <PageNav
          topNav={{
            variant: 'underline',
            links: [],
          }}
          buttonGroups={{
            buttons: [],
          }}
        />

        <section className='min-w-0 rounded-lg border bg-card p-4 text-card-foreground'>
          <DataTable<RowRecord, DataTableListResponse<RowRecord>>
            columns={columns}
            request={request}
          />
        </section>
      </div>
    </Page>
  )
}
```

规则：

- `Page` 只包页面，不包模块私有 Provider。
- `PageAction` / `PageNav` 是页面内容的一部分，放在表格 `section` 之前。
- `DataTable` 外层 `section` 使用 `min-w-0 rounded-lg border bg-card p-4 text-card-foreground`，保持列表页视觉一致。
- 不要在页面中重复实现表格外层 flex 布局、分页、筛选面板折叠按钮或表格空状态。

## 文件组织

`DataTable` 属于 `src/components/common/data-table`，业务模块只保留与当前列表相关的配置和操作。

推荐结构：

```txt
src/modules/<module-name>/
  index.tsx
  components/
    columns.tsx
    row-actions.tsx
    bulk-actions.tsx
    dialogs/
      confirm-dialog.tsx
  data/
    schema.ts
    options.tsx
  api/
    index.ts
```

职责划分：

- `index.tsx`：组合 `Page`、`PageAction` / `PageNav`、`DataTableProvider`、`DataTable`，定义页面级配置。
- `components/columns.tsx`：定义 `ColumnDef<TData>[]`，只处理列展示、排序入口、行操作入口。
- `components/row-actions.tsx`：定义单行操作菜单，可读取 `useDataTableContext()`。
- `components/bulk-actions.tsx`：定义批量操作按钮，接收 TanStack Table 实例。
- `components/dialogs/*`：定义行操作或批量操作需要的弹窗、抽屉。
- `data/schema.ts`：定义行数据类型、操作类型等模块私有类型。
- `data/options.tsx`：定义筛选选项、列标签等静态配置。
- `api/index.ts`：定义模块接口 alias。

不要把业务列、业务筛选项、业务弹窗或权限规则放进 `src/components/common/data-table`。

## 基础用法

```tsx
type RowRecord = {
  id: string
  name: string
  state: string
}

const columns: ColumnDef<RowRecord>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='名称' />
    ),
  },
]

function buildQuery(state: DataTableQueryState) {
  return {
    page: state.page,
    pageSize: state.pageSize,
    keyword: state.keyword,
    ...state.filters,
  }
}

export function ModuleListPage() {
  const $api = useAPI()

  return (
    <DataTable<RowRecord, DataTableListResponse<RowRecord>>
      columns={columns}
      request={{
        queryKey: (state) => ['module-records', state],
        queryFn: (state) =>
          $api.listRecords<DataTableListResponse<RowRecord>>({
            query: buildQuery(state),
          }),
      }}
    />
  )
}
```

规则：

- `queryFn` 由业务传入，`DataTable` 不直接读取 API alias。
- `queryKey` 必须包含 `DataTableQueryState`，保证分页、筛选、排序变化时重新请求。
- 请求参数转换放在模块内的 helper 中，避免页面 JSX 变厚。
- 后端字段名与 URL 字段名不一致时，在 `queryFn` 中转换。

## DataTableProvider

`DataTableProvider` 是独立公共上下文，可单独引用。它用于保存列表操作相关的通用状态：

```ts
type DataTableContextValue<TData, TAction extends string, TContext> = {
  open: TAction | null
  setOpen: (open: TAction | null) => void
  currentRow: TData | null
  setCurrentRow: React.Dispatch<React.SetStateAction<TData | null>>
  context: TContext
}
```

外部手动包裹：

```tsx
<DataTableProvider<RowRecord, RowAction, RowContext>
  context={{
    permissions: {
      update: true,
      delete: true,
    },
  }}
>
  <DataTable<RowRecord, DataTableListResponse<RowRecord>, RowAction>
    columns={columns}
    request={request}
  />
</DataTableProvider>
```

由 `DataTable` 自动创建：

```tsx
<DataTable<RowRecord, DataTableListResponse<RowRecord>, RowAction, RowContext>
  provider={{
    enabled: true,
    context: {
      permissions: {
        update: true,
        delete: true,
      },
    },
  }}
  columns={columns}
  request={request}
/>
```

规则：

- 页面需要多个列表共享同一操作上下文时，手动使用 `DataTableProvider`。
- 单个列表只需要行操作上下文时，可使用 `provider.enabled` 自动创建。
- 如果外层已经存在 `DataTableProvider`，`DataTable` 不会重复创建。
- `context` 只承载扩展数据，不在 Provider 内实现具体业务判断。
- `TAction` 使用模块私有联合类型，例如 `'create' | 'update' | 'delete'`。公共组件不定义业务 action。

行操作读取上下文：

```tsx
function RowActions<TData>({ row }: { row: Row<TData> }) {
  const { setOpen, setCurrentRow, context } = useDataTableContext<
    RowRecord,
    RowAction,
    RowContext
  >()

  return (
    <Button
      type='button'
      disabled={!context.permissions.update}
      onClick={() => {
        setCurrentRow(row.original as RowRecord)
        setOpen('update')
      }}
    >
      更新
    </Button>
  )
}
```

## 高级筛选

`filterPanel` 用于接入左侧高级筛选面板。字段结构沿用 `FilterPanel` 的 `FilterGroup[]`。

```tsx
<DataTable<RowRecord, DataTableListResponse<RowRecord>>
  columns={columns}
  request={request}
  filterPanel={{
    groups: filterGroups,
    advanceFilterCollapsed: true,
  }}
  urlState={{
    filters: [
      { fieldId: 'state', type: 'array' },
      { fieldId: 'name', type: 'string' },
    ],
  }}
/>
```

规则：

- `advanceFilterCollapsed` 控制高级筛选默认是否收起，默认 `true`。
- 传 `advanceFilterCollapsed: false` 时，高级筛选默认展开。
- `filterPanel.collapsed` 用于外部受控折叠，只有确实需要外部控制时使用。
- `filterPanel.groups[].fields[].id` 应与 `urlState.filters[].fieldId` 对齐。
- 筛选项只描述 UI 和字段，不在筛选配置中写请求逻辑。
- `FilterPanel` 的面板内搜索只用于查找筛选项，不参与接口请求。

## URL 状态

`DataTable` 以 URL query 作为分页、关键词、筛选和排序的单一来源。

默认参数：

```ts
{
  pageKey: 'page',
  pageSizeKey: 'pageSize',
  globalFilterKey: 'filter',
  sortKey: 'sort',
  defaultPageSize: 10,
}
```

配置示例：

```tsx
urlState={{
  pageKey: 'page',
  pageSizeKey: 'pageSize',
  globalFilterKey: 'filter',
  sortKey: 'sort',
  defaultPageSize: 20,
  filters: [
    { fieldId: 'state', queryKey: 'state', columnId: 'state', type: 'array' },
    { fieldId: 'name', queryKey: 'name', columnId: 'name', type: 'string' },
  ],
}}
```

字段说明：

- `fieldId`：筛选字段 id，必须对应 `FilterPanel` 字段。
- `queryKey`：URL 参数名，未传时使用 `fieldId`。
- `columnId`：TanStack Table 列 id，未传时使用 `fieldId`。
- `type: 'array'`：多值筛选，会在 URL 中重复写入同名参数。
- `type: 'string'`：单值筛选，会在 URL 中写入一个字符串参数。

规则：

- 修改关键词、筛选或排序时，自动回到第一页。
- 修改页码或每页条数时，只更新分页参数。
- 不要在页面内再维护一份分页或筛选 state。
- 不要在 `queryFn` 内读取 `useSearchParams()`，应使用传入的 `DataTableQueryState`。

## Toolbar

`toolbar` 配置表格顶部工具栏。

```tsx
toolbar={{
  searchPlaceholder: '搜索...',
  filters: [
    {
      columnId: 'state',
      title: '状态',
      options: stateOptions,
    },
  ],
  columnLabels: {
    name: '名称',
    state: '状态',
  },
}}
```

规则：

- `searchPlaceholder` 只影响顶部关键词输入框。
- `filters` 是顶部快捷筛选，适合放少量高频筛选项。
- 顶部快捷筛选和左侧高级筛选必须绑定同一组 URL 字段。
- `columnLabels` 用于列显隐菜单，不要在公共组件中硬编码列名。
- 顶部重置按钮会清空关键词和 `urlState.filters` 中声明的筛选参数。

## 批量操作

批量操作通过 render prop 注入：

```tsx
<DataTable<RowRecord, DataTableListResponse<RowRecord>>
  columns={columns}
  request={request}
  bulkActions={(table) => <BulkActions table={table} />}
/>
```

规则：

- 批量操作组件放在模块 `components/bulk-actions.tsx`。
- 批量操作读取 `table.getFilteredSelectedRowModel().rows`。
- 批量操作完成后由业务自行清空选择、关闭弹窗、刷新 query 或提示结果。
- 公共 `DataTable` 不内置任何删除、导出、状态变更等业务操作。

## 列定义

列定义必须留在业务模块内。

```tsx
export const columns: ColumnDef<RowRecord>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='名称' />
    ),
  },
]
```

规则：

- 列展示、徽标、长文本、行操作菜单都在列定义或模块私有组件中实现。
- 需要排序的列使用 `DataTableColumnHeader`。
- 需要行选择时，在列定义中加入选择列，并保持 `enableHiding: false`。
- 列宽、表头和单元格 class 使用 `ColumnMeta` 的 `className`、`thClassName`、`tdClassName`。

## 响应适配

默认读取：

```ts
response.datas
response.total
```

非默认结构使用：

```tsx
request={{
  queryKey: (state) => ['records', state],
  queryFn: (state) => fetchRecords(state),
  selectRows: (response) => response.items,
  selectTotal: (response) => response.count,
}}
```

规则：

- 响应结构适配只写在调用处。
- 不要为了单个接口修改 `DataTable` 默认解析逻辑。
- `selectRows` 必须返回当前页数据。
- `selectTotal` 必须返回全量匹配条数，不是当前页条数。

## 禁止事项

- 不要在 `src/components/common/data-table` 中引入模块私有类型、接口、枚举或权限码。
- 不要在 `DataTable` 内直接调用具体 API alias。
- 不要在页面里重复维护分页、筛选、排序 state。
- 不要让左侧高级筛选和顶部快捷筛选绑定两套字段。
- 不要把业务弹窗、行操作菜单或批量操作按钮上提到公共组件。
- 不要在 `columnLabels` 或通用组件中写具体业务列名默认值。
- 不要用本地假分页替代服务端分页接口；需要临时数据时，也应保持 `{ total, datas }` 响应形态。

## 检查清单

新增列表页时确认：

- 页面外层使用 `Page`。
- 表格主体在独立 `section` 中。
- 需要页面操作区时使用 `PageAction` 或 `PageNav`。
- 列定义、筛选配置、行操作和批量操作都在模块目录内。
- `queryFn` 只依赖 `DataTableQueryState` 生成请求参数。
- URL 参数名在 `urlState` 中显式配置。
- 高级筛选默认收起，除非明确传 `advanceFilterCollapsed: false`。
- `DataTableProvider` 只承载通用操作上下文和扩展数据。
- `npm run typecheck` 通过。
