# 路由开发规范

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

本文档说明项目中路由的定义、挂载、权限控制和跳转方式。项目使用 React Router 的集中式 route object 配置，不使用文件路由。

## 路由入口

路由相关文件职责如下：

| 文件 | 职责 |
| --- | --- |
| `src/routes/index.tsx` | 定义全局 `routes` 数组，组合根路由、公共页、环境门禁和布局分支 |
| `src/routes/lazy-pages.tsx` | 集中声明需要懒加载的业务页面组件 |
| `src/routes/sidebar-routes.tsx` | 维护 `SidebarLayout` 下的业务路由分支 |
| `src/routes/topbar-navigation.tsx` | 维护顶部导航配置和 `AppsTopbarLayout` 包装组件 |
| `src/routes/topbar-routes.tsx` | 维护 `TopbarLayout` 下的应用、设置、后台、审计等路由分支 |
| `src/router.tsx` | 调用 `createBrowserRouter(routes, options)` 创建应用 router |
| `src/main.tsx` | 初始化权限数据，创建 router，并渲染 `RouterProvider` |
| `src/components/common/route-guard.tsx` | 路由级权限守卫 |
| `src/components/common/navigation-progress.tsx` | 监听 router 状态并显示顶部加载进度 |

## Router 创建

应用 router 由 `createAppRouter()` 创建：

```tsx
import { env } from '@/config/env'
import { routes } from '@/routes'
import { createBrowserRouter } from 'react-router'

export function createAppRouter() {
  return createBrowserRouter(routes, {
    basename: env.appBasePath,
  })
}
```

`basename` 来自 `env.appBasePath`，由 `VITE_APP_BASE_PATH` 读取并规范化：

- 未配置时为 `/`。
- 缺少前置 `/` 时自动补齐。
- 末尾 `/` 会被移除，根路径仍保持 `/`。

非根路径部署时，只需要配置环境变量，不要在路由 `path` 或页面跳转里手动拼接部署前缀。

## 应用挂载

`src/main.tsx` 的启动流程：

1. 请求 `/api/user/session` 初始化 session store。
2. 权限请求失败时写入默认最小权限。
3. 调用 `createAppRouter()` 创建 router。
4. 渲染 `NavigationProgress` 和 `RouterProvider`。

```tsx
const router = createAppRouter()

root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <NavigationProgress router={router} />
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
)
```

新增全局 provider 时，应在 `main.tsx` 中包裹 `RouterProvider`，不要在页面路由里重复创建全局实例。

## 路由结构

当前路由以 `RootLayout` 作为根节点：

```tsx
export const routes = [
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RootErrorBoundary />,
    children: [
      {
        path: '',
        element: <EnvironmentGate />,
        children: [...sidebarRoutes, ...topbarRoutes],
      },
      { path: '401', element: <UnauthorisedError /> },
      { path: '403', element: <ForbiddenError /> },
      { path: '404', element: <NotFoundError /> },
      { path: '500', element: <GeneralError /> },
      { path: '503', element: <MaintenanceError /> },
    ],
  },
]
```

### 根路由

根路由必须包含：

- `path: '/'`
- `element: <RootLayout />`
- `errorElement: <RootErrorBoundary />`
- `children`

`RootLayout` 只负责全局 `Outlet` 和 `Toaster`，不承载具体业务页面布局。

### 布局分支

业务页通过布局分支归类：

- `SidebarLayout`：中后台主业务页，页面内部通常使用 `Page`。
- `TopbarLayout`：顶部导航型页面，页面内部通常直接使用 `Main`。
- 公共错误页：直接挂在根路由 children 下，不进入业务布局。

布局分支本身使用 `path: ''`，表示不额外增加 URL 层级，只给子路由提供布局壳。

## 新增页面路由

新增页面时按以下步骤处理：

1. 在 `src/modules/<module>/index.tsx` 导出页面组件。
2. 需要懒加载时，在 `src/routes/lazy-pages.tsx` 导出 lazy 页面组件。
3. 根据页面布局挂入 `src/routes/sidebar-routes.tsx` 或 `src/routes/topbar-routes.tsx`。
4. 如需路由级权限，用 `RouteGuard` 包裹页面元素。
5. 如需侧边栏入口，同步更新 `src/lib/sidebar-data.ts` 中的本地菜单构造逻辑。
6. 如需顶部栏入口，同步更新传给 `TopbarLayout` 的 `navigation.items`。
7. 如果新增的是某个模块入口下的子页面，例如 `/tasks/auto-evaluation` 挂在 `/tasks` 下，必须检查对应侧边栏菜单或顶部导航入口是否需要设置 `activeMatch: 'prefix'`，否则进入子页面时父级菜单不会高亮。

### SidebarLayout 页面

适用于标准业务页：

```tsx
import { Reports } from '@/modules/reports'

{
  path: '',
  element: <SidebarLayout />,
  children: [
    { index: true, element: <Dashboard /> },
    { path: 'dashboard', element: <Dashboard /> },
    { path: 'tasks', element: <Tasks /> },
    { path: 'reports', element: <Reports /> },
  ],
}
```

页面组件内部优先使用 `Page`：

```tsx
export function Reports() {
  return (
    <Page>
      <h1 className='text-2xl font-bold tracking-tight'>报告管理</h1>
    </Page>
  )
}
```

### TopbarLayout 页面

适用于顶部导航型页面：

```tsx
import { Apps } from '@/modules/apps'

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
  inlineActions,
  user: currentUser,
  menuActions,
}

{
  path: '',
  element: <TopbarLayout navigation={appsTopbarNavigation} />,
  children: [{ path: 'apps', element: <Apps /> }],
}
```

`TopbarLayout` 内部会把 `TopNav` 的点击事件适配为 `react-router` 的 `navigate()`。页面内部不要再渲染 `Page`、`PageHeader` 或 `ProfileDropdown`。

### 错误页和公共页

错误页直接挂在根路由 children 下：

```tsx
{ path: '403', element: <ForbiddenError /> }
```

公共页如果不需要应用壳，也按错误页方式直接挂根路由。需要应用壳时再进入对应布局分支。

## 路由权限

路由级权限使用 `RouteGuard`：

```tsx
import { RouteGuard } from '@/components/common/route-guard'

{
  path: 'reports',
  element: (
    <RouteGuard accessConfig={{ access: ['report:view'] }}>
      <Reports />
    </RouteGuard>
  ),
}
```

权限配置类型：

```ts
export interface RouteAccessConfig {
  access?: string | string[]
  superAccess?: boolean
  projectId?: string
}
```

规则：

- 未传 `accessConfig` 时默认允许访问。
- `superAccess: true` 表示仅超管可访问。
- `access` 可以是单个权限码或权限码数组，匹配任意一个即可访问。
- `projectId` 用于多项目权限场景，未传时使用空字符串。
- 无权限时跳转 `/403`，并使用 `replace: true`。

路由级权限只控制页面访问。按钮、菜单、表格操作等元素级权限应使用对应的权限组件或业务逻辑控制。

## 导航与跳转

页面内跳转优先使用 React Router：

```tsx
import { Link, useNavigate } from 'react-router'

<Link to='/tasks'>评测管理</Link>

const navigate = useNavigate()
navigate('/tasks')
```

使用规则：

- 应用内页面跳转使用 `Link` 或 `navigate()`。
- 不要用原生 `<a href>` 处理应用内跳转，除非组件本身是纯展示组件并通过回调交给布局适配。
- 路由路径使用以 `/` 开头的应用内绝对路径，例如 `/tasks`。
- 不要手动拼接 `VITE_APP_BASE_PATH`，`basename` 会统一处理。

`TopbarLayout` 是例外适配层：它接收 `TopNav` 的原生事件并调用 `navigate()`，具体约定见 `spec/40-components/layout/top-nav.md` 和 `spec/20-architecture/layouts.md`。

## 激活状态

项目通过 `src/lib/nav.ts` 判断导航激活：

```ts
export type ActiveMatch = 'exact' | 'prefix'

export function isRouteActive(
  pathname: string,
  href: string,
  match: ActiveMatch = 'exact'
) {
  if (match === 'exact') {
    return pathname === href
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}
```

使用规则：

- 默认精确匹配当前路径。
- 父级菜单或模块入口需要包含子路径时，使用 `activeMatch: 'prefix'`。
- 新增模块子页面时，如果左侧侧边栏仍只展示父级入口，例如菜单项是 `{ title: '评测管理', url: '/tasks' }`，而子页面路径是 `/tasks/auto-evaluation`，该菜单项必须补充 `activeMatch: 'prefix'`。
- 同一规则也适用于顶部导航和页面内二级导航：父级入口需要覆盖自身路径和子路径时使用 `activeMatch: 'prefix'`，只允许当前路径命中时保留默认精确匹配。
- 手动传入 `isActive` 或 `active` 时，应由调用方保证与当前路由一致。

## 加载进度

`NavigationProgress` 监听 router 状态：

- `!state.initialized`
- `state.navigation.state === 'loading'`
- `state.revalidation === 'loading'`

满足任一条件时启动顶部进度条；加载结束后调用 `complete()`。该组件应与 `RouterProvider` 使用同一个 router 实例。

## 约束

- 所有全局路由仍由 `src/routes/index.tsx` 导出，具体布局分支放在 `src/routes/sidebar-routes.tsx` 和 `src/routes/topbar-routes.tsx`。
- 业务页面 lazy 导入统一放在 `src/routes/lazy-pages.tsx`，不要散落在各页面模块。
- 新路由必须明确选择布局分支，不要把业务页直接挂在根路由下。
- 布局分支使用 `path: ''`，业务页面使用具体相对路径。
- 根路由保留 `errorElement: <RootErrorBoundary />`。
- 路由路径、侧边栏菜单、顶部导航入口应保持一致。
- 非根路径部署只配置 `VITE_APP_BASE_PATH`，不要在业务代码中硬编码部署前缀。
