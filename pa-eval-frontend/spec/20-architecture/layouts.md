# 布局开发规范

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

本文档说明项目中可复用布局的职责、适用场景和路由接入方式。布局组件位于 `src/components/layout`，路由聚合位于 `src/routes/index.tsx`。

## 布局类型

| 布局 | 文件 | 适用场景 |
| --- | --- | --- |
| `RootLayout` | `src/components/layout/root-layout.tsx` | 应用根布局，承载路由出口和全局 `Toaster` |
| `SidebarLayout` | `src/components/layout/sidebar-layout.tsx` | 中后台主业务页，左侧侧边栏 + 右侧页面内容 |
| `TopbarLayout` | `src/components/layout/topbar-layout.tsx` | 顶部导航型页面，适合一级产品入口、轻量应用列表等 |

## RootLayout

`RootLayout` 是所有页面的根容器，只负责渲染：

- `Outlet`：子路由出口。
- `Toaster`：全局 Sonner 消息容器，默认 `duration={4000}`。

根布局不承载侧边栏、顶部导航、页面标题或业务数据。新增公共错误页、登录页或其他不需要应用壳的页面时，可以直接挂在 `RootLayout` 下。

```tsx
{
  path: '/',
  element: <RootLayout />,
  errorElement: <RootErrorBoundary />,
  children: [
    { path: '404', element: <NotFoundError /> },
    { path: '500', element: <GeneralError /> },
  ],
}
```

## SidebarLayout

`SidebarLayout` 用于标准中后台页面。它组合了：

- `SearchProvider`：搜索上下文。
- `LayoutProvider`：侧边栏展示形态上下文。
- `SidebarProvider`：shadcn/ui sidebar 状态。
- `AppSidebar`：实际侧边栏导航。
- `SidebarInset`：右侧内容容器，内部渲染 `children ?? <Outlet />`。

路由中需要侧边栏的页面应挂在同一个 `SidebarLayout` 分支下：

```tsx
{
  path: '',
  element: <SidebarLayout />,
  children: [
    { index: true, element: <Dashboard /> },
    { path: 'dashboard', element: <Dashboard /> },
    { path: 'tasks', element: <Tasks /> },
  ],
}
```

### 侧边栏数据

侧边栏数据通过 `useSidebarData()` 读取：

- `useSidebarData` 通过 `useAPI()` 调用 `$api.getProjects()` 获取项目列表。
- `src/lib/sidebar-data.ts` 根据项目列表和当前 URL 中的 `projectId` 在前端本地构造侧边栏数据。
- 返回数据类型见 `src/components/layout/types.ts`，核心字段为 `teams`、`menuGroups`。
- mock 项目数据来自项目列表相关 mock，不再维护单独的 `/api/sidebar` mock。

`menuGroups` 在渲染前会经过权限过滤：

- `access` 支持单个权限码或权限码数组。
- `superAccess` 为 `true` 时仅超管可见。
- 子菜单会递归过滤，过滤后没有可见菜单项的分组会被移除。

### 侧边栏展示配置

`LayoutProvider` 管理侧边栏展示形态：

```ts
type Collapsible = 'offcanvas' | 'icon' | 'none'
type Variant = 'inset' | 'sidebar' | 'floating'
```

默认值：

- `collapsible`: `icon`
- `variant`: `inset`

配置会写入 cookie：

- `layout_collapsible`
- `layout_variant`

有效期为 7 天。需要读取或更新布局设置时，必须通过 `useLayout()`，不要在业务页面里直接读写这些 cookie。

## TopbarLayout

`TopbarLayout` 用于顶部导航型页面。它组合了：

- `SearchProvider`
- 固定顶部 `TopNav`
- `#content` 内容容器
- `children ?? <Outlet />`

`TopbarLayout` 接收 `navigation: TopNavProps`，由调用方提供品牌、一级导航、右侧操作和用户菜单。`TopNav` 的完整契约见 `spec/40-components/layout/top-nav.md`。

```tsx
const appsTopbarNavigation = {
  brand: {
    name: '智能评测系统',
    initial: 'A',
    href: '/',
    ariaLabel: 'Go to dashboard',
  },
  items: [
    { id: 'apps', label: '应用管理', href: '/apps', active: true },
    { id: 'tasks', label: '项目管理', href: '/tasks' },
  ],
  inlineActions: [],
  user: currentUser,
  menuActions,
}

{
  path: '',
  element: <TopbarLayout navigation={appsTopbarNavigation} />,
  children: [{ path: 'apps', element: <Apps /> }],
}
```

### 路由跳转

`TopbarLayout` 是 `TopNav` 和 `react-router` 的适配层：

- `onNavigate` 会先调用外部传入的 `navigation.onNavigate`。
- 如果事件未被 `preventDefault()`，布局会阻止默认跳转并调用 `navigate(item.href)`。
- `onAction` 会先调用外部传入的 `navigation.onAction`。
- 如果 action 有 `href` 且事件未被阻止，布局会调用 `navigate(action.href)`。

业务逻辑需要特殊处理时，应在 `navigation.onNavigate` 或 `navigation.onAction` 中调用 `event.preventDefault()`。

## 使用原则

- 侧边栏业务页优先使用 `SidebarLayout` + `Page`。
- 顶部导航型页面使用 `TopbarLayout`，页面内部直接使用 `Main`。
- 公共错误页和无需应用壳的页面直接挂在 `RootLayout` 下。
- 不要在页面组件里重复创建应用级 provider。
- 不要在布局组件中硬编码具体业务页面内容。
