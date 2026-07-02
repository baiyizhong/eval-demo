# AppList 组件使用规范

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

## 组件职责

`AppList` 是应用集成列表的业务组件，文件位于 `src/components/business/app-list.tsx`。

它负责渲染应用筛选工具栏、分隔线和应用卡片列表，并内置以下交互：

- 按应用名称搜索。
- 按归档状态筛选。
- 按应用名称升序或降序排序。
- 将搜索、筛选和排序状态同步到 URL query。
- 渲染新增、进入、编辑、删除、设置、标签、创建时间和卡片点击入口。
- 点击新增按钮时打开 `FormDialog`，用于承载少量新增项目输入内容。

`AppList` 不负责请求应用数据，不内置页面跳转、编辑、删除、设置或新增提交逻辑。业务行为由调用方通过回调和弹窗内容注入接管。

## 导入方式

```tsx
import { AppList } from '@/components/business/app-list'
import type { AppCardListItem } from '@/components/business/app-card-list'
```

## 类型说明

`AppList` 的列表项类型复用 `AppCardListItem`：

```ts
type AppCardTag = {
  label: ReactNode
  variant?: ComponentProps<typeof Badge>['variant']
  className?: string
}

type AppCardListItem = {
  name: string
  status: 'archived' | 'active'
  desc: string
  tags?: AppCardTag[]
  createdAt?: ReactNode
}

type AppListAddFormValues = {
  name: string
  status: 'active' | 'archived'
  desc: string
}
```

调用方可以在数据对象上携带额外字段，例如 `id`、`logo`、`provider`。当前 `AppList` 和 `AppCardList` 会消费 `name`、`status`、`desc`、`tags` 和 `createdAt`。

## Props 契约

```ts
type AppListProps = {
  apps: AppCardListItem[]
  onActionClick?: (
    app: AppCardListItem,
    event: MouseEvent<HTMLButtonElement>
  ) => void
  onEditClick?: (
    app: AppCardListItem,
    event: MouseEvent<HTMLButtonElement>
  ) => void
  onDeleteClick?: (
    app: AppCardListItem,
    event: MouseEvent<HTMLButtonElement>
  ) => void
  onSettingsClick?: (
    app: AppCardListItem,
    event: MouseEvent<HTMLButtonElement>
  ) => void
  getTags?: (app: AppCardListItem) => AppCardTag[]
  getCreatedAt?: (app: AppCardListItem) => ReactNode
  onCardClick?: (
    app: AppCardListItem,
    event: MouseEvent<HTMLLIElement>
  ) => void
  onAddClick?: (event: MouseEvent<HTMLButtonElement>) => void
  onAddSubmit?: (
    values: AppListAddFormValues
  ) => void | Promise<void>
  addDialogTitle?: ReactNode
  addDialogDescription?: ReactNode
  addDialogContent?:
    | ReactNode
    | ((context: { close: () => void }) => ReactNode)
  addDialogProps?: Omit<
    FormDialogProps,
    "open" | "onOpenChange" | "title" | "description" | "children"
  >
}
```

关键规则：

- `apps` 必须由调用方传入，组件内部不会请求接口或读取模块 store。
- `onActionClick` 对应卡片右侧的 `立刻进入` 按钮。
- `onEditClick` 对应卡片标题右侧编辑图标按钮。
- `onDeleteClick` 对应卡片标题右侧删除图标按钮。
- `onSettingsClick` 对应卡片标题右侧设置图标按钮。
- `getTags` 用于配置卡片左下角标签；未传时默认使用应用归档状态标签。
- `getCreatedAt` 用于配置卡片创建时间展示；未传时读取 `app.createdAt`。
- `onCardClick` 对应整张卡片点击。
- `onAddClick` 对应工具栏右侧 `新增项目` 按钮。默认会继续打开 `FormDialog`；如果调用方在回调中调用 `event.preventDefault()`，组件不会打开默认弹窗。
- `onAddSubmit` 对应默认新增项目表单提交。组件会在 schema 校验通过后传出 `{ name, status, desc }`，等待回调完成后关闭弹窗。
- `addDialogTitle` 用于配置新增弹窗标题，默认 `新增项目`。
- `addDialogDescription` 用于配置新增弹窗说明。
- `addDialogContent` 用于覆盖默认新增表单；传函数时会收到 `{ close }`，可在提交成功后关闭弹窗。
- `addDialogProps` 透传给 `FormDialog`，常用于配置 `confirmText`、`confirmProps`、`size`、`contentProps` 等，不允许覆盖 `open`、`onOpenChange`、`title`、`description` 和 `children`。未覆盖 `addDialogContent` 时，确认按钮默认绑定内置表单提交。
- 卡片内按钮点击会调用 `event.stopPropagation()`，不会触发 `onCardClick`。

## URL Query 约定

`AppList` 使用 `react-router` 的 `useSearchParams` 读写查询参数。

| 参数 | 可选值 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `filter` | 任意字符串 | 空字符串 | 按 `app.name` 进行大小写不敏感搜索 |
| `status` | `archived`、`active` | `all` | 按归档状态筛选；选择全部时会删除该参数 |
| `sort` | `asc`、`desc` | `asc` | 按 `app.name.localeCompare` 排序 |

示例 URL：

```txt
/apps?filter=git&status=active&sort=desc
```

注意：

- `filter` 为空时会从 URL 中删除。
- `status=all` 不写入 URL。
- `sort` 每次切换都会写入 URL。
- 组件初次渲染时会用 URL query 初始化内部状态。

## 推荐用法

```tsx
import { AppList } from '@/components/business/app-list'
import { Main } from '@/components/layout/main'
import type { AppCardListItem } from '@/components/business/app-card-list'

const apps: AppCardListItem[] = [
  {
    name: 'GitHub',
    status: 'active',
    desc: '集成 GitHub，优化代码协作与管理。',
    createdAt: '2026-06-12 10:45',
    tags: [{ label: '代码管理', variant: 'secondary' }],
  },
  {
    name: 'Figma',
    status: 'archived',
    desc: '集中查看并协作处理 Figma 设计稿。',
    createdAt: '2026-06-03 11:20',
    tags: [{ label: '设计协作', variant: 'outline' }],
  },
]

export function AppsPage() {
  return (
    <Main fixed>
      <AppList
        apps={apps}
        addDialogDescription='填写项目信息后提交。'
        onAddSubmit={async (values) => {
          // create app with values.name, values.status, values.desc
        }}
        onActionClick={(app) => {
          // navigate(`/apps/${app.name}`)
        }}
        onEditClick={(app) => {
          // openEditDialog(app)
        }}
        onDeleteClick={(app) => {
          // openDeleteConfirm(app)
        }}
        onSettingsClick={(app) => {
          // openSettingsDialog(app)
        }}
        getTags={(app) => app.tags ?? []}
        getCreatedAt={(app) => app.createdAt}
        onCardClick={(app) => {
          // navigate(`/apps/${app.name}`)
        }}
      />
    </Main>
  )
}
```

## 路由接入约定

`AppList` 已依赖 `react-router` 的 `useSearchParams`，因此必须在 router context 内使用，例如 route element、模块页面或已经被 router provider 包裹的子组件。

调用方处理跳转时：

- 在 `onActionClick` 或 `onCardClick` 中使用 `navigate()`。
- 如需按稳定标识跳转，建议列表项携带额外 `id` 字段，并在调用方自行收窄类型。
- 不要在 `AppList` 内新增模块路由路径、详情页路径或业务跳转规则。

## 显示和交互规则

- 搜索框占位文案为 `筛选应用...`。
- 状态筛选包含 `全部应用`、`已归档`、`未归档`。
- 排序菜单包含 `升序` 和 `降序`。
- 新增按钮文案为 `新增项目`，点击后默认打开新增项目 `FormDialog`。
- 默认新增表单包含 `项目名称`、`项目状态`、`项目描述` 三个字段，并通过 zod 校验必填项。
- 主操作按钮文案固定为 `立刻进入`。
- 卡片编辑、删除和设置操作展示在标题右侧，使用 Lucide 的 `Pencil`、`Trash2`、`Settings` 图标。
- 卡片底部左侧展示标签列表；默认根据 `status` 显示归档状态标签，也可通过 `getTags` 覆盖。
- 卡片底部新增创建时间展示；优先使用 `getCreatedAt` 返回值，否则使用 `app.createdAt`。
- 当前实现没有空状态展示；筛选结果为空时只渲染空列表。

## 大模型修改约束

大模型在修改该组件时必须遵守：

- 不要在 `app-list.tsx` 中写入接口请求、模块私有 store 或固定应用数据。
- 不要把新增、进入、编辑、删除的具体业务逻辑写进组件内部。
- 默认新增表单只保留 `name`、`status`、`desc` 这类通用基础字段；复杂业务字段通过 `addDialogContent` 覆盖，不要继续堆进 `AppList`。
- 不要把 `AppList` 改成依赖某个具体模块的应用类型；跨模块字段通过 props 或泛型方案扩展。
- 如需新增更多筛选项，优先保持 URL query 与组件状态一致，并在本文档同步记录参数含义。
- 如需展示空状态，应优先组合已有 `common` 或 `ui` 组件，不在列表内硬编码复杂页面结构。
