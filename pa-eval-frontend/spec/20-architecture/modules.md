# Modules

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

## 目标

规范 `src/modules` 中业务模块、页面模块和系统模块的定义、目录边界、路由接入、API 接入和复用上提方式，让新增业务按当前项目结构扩展，而不是引入另一套模块组织方式。

## 技术基础

当前项目模块体系基于：

- React 19 + TypeScript
- React Router 8 集中式 route object 配置
- Vite SPA，路径别名 `@` 指向 `src`
- shadcn/ui + Tailwind CSS v4 组件体系
- Axios API registry + `useAPI()`
- React Query
- Zustand 全局 store

模块根目录为：

```txt
src/modules/
```

## 适用范围

- `src/modules/<module-name>/*`
- 模块内页面、组件、hooks、stores、types、api、data、views
- `src/routes/index.tsx` 中的模块路由接入
- `src/api/registry.ts` 中的模块 API 注册
- 需要上提到全局目录的复用代码判断

## 模块类型

### 页面模块

页面模块直接提供可被路由挂载的页面组件。

示例：

```txt
src/modules/<module-name>/
  components/
    <module-name>-page-header.tsx
  index.tsx
```

`index.tsx` 导出页面组件：

```tsx
export function ModulePage() {
  return <Page>{/* page content */}</Page>
}
```

页面模块适合承载：

- 路由页面组件。
- 当前页面专属组件。
- 当前页面专属 hooks、store、types、data。
- 当前模块 API alias。

### 系统模块

系统模块服务应用框架或全局能力，不一定导出页面组件。

目录示例：

```txt
src/modules/<module-name>/api/index.ts
```

系统模块可以只定义 API、数据适配、配置适配或其他应用级能力，并由全局入口按需注册或调用。

### 错误页模块

错误页可以按页面模块方式集中维护，每个错误页保持独立组件：

```txt
src/modules/<error-module>/
  forbidden.tsx
  not-found.tsx
  server-error.tsx
```

错误页直接由 `src/routes/index.tsx` 挂到根路由 children 下，不进入业务布局分支。

## 标准目录

新增模块按需创建目录。不要为了模板完整性创建空目录。

```txt
src/modules/<module-name>/
  api/
    index.ts
  components/
  data/
  hooks/
  stores/
  types/
  views/
  index.tsx
```

目录职责：

| 目录或文件 | 是否必需 | 职责 |
| --- | --- | --- |
| `index.tsx` | 页面模块必需 | 模块页面入口，导出路由可挂载的 React 组件 |
| `components/` | 按需 | 模块私有组件，例如页面 header、filter、form、table columns、detail section |
| `views/` | 按需 | 模块内部子页面或复杂页面拆分后的 view |
| `hooks/` | 按需 | 模块私有 hooks |
| `stores/` | 按需 | 模块私有 Zustand store |
| `types/` 或 `types.ts` | 按需 | 模块私有 TypeScript 类型 |
| `api/index.ts` | 有接口时必需 | 模块 API alias 定义 |
| `data/` | 按需 | 模块私有静态数据、mock 数据或展示数据 |

命名规则：

- 模块目录使用 kebab-case，例如 `user-management`。
- React 组件使用 PascalCase。
- 模块私有文件使用 kebab-case，例如 `user-filter-panel.tsx`。
- Hooks 以 `use` 开头。
- Zustand store 文件使用 `*.store.ts`。
- API alias 使用动词开头的 camelCase。

## 模块入口

当前项目使用 `index.tsx` 作为页面模块入口，而不是强制每个模块提供 `routes.tsx`。

推荐：

```tsx
// src/modules/<module-name>/index.tsx
import { Page } from '@/components/common/page'

export function ModulePage() {
  return (
    <Page>
      <section className='flex flex-col gap-4'>
        <h1 className='text-2xl font-bold tracking-tight'>页面标题</h1>
      </section>
    </Page>
  )
}
```

导入方式：

```tsx
import { ModulePage } from '@/modules/<module-name>'
```

规则：

- 页面模块默认从 `index.tsx` 导出路由组件。
- 不新增全局 `src/modules/index.ts` 聚合所有模块。
- 模块内部可以使用相对路径导入私有文件。
- 模块外部只导入模块公开入口或明确的全局目录，不导入模块深层私有实现。

## 路由接入

项目使用集中式路由配置，路由定义在 `src/routes/index.tsx`。当前没有文件路由，也没有每模块必备的 `routes.tsx`。

新增页面模块时：

1. 在 `src/modules/<module>/index.tsx` 导出页面组件。
2. 在 `src/routes/index.tsx` 顶部导入页面组件。
3. 按页面形态挂入 `SidebarLayout` 或 `TopbarLayout` 分支。
4. 如需路由级权限，用 `RouteGuard` 包裹页面元素。
5. 如需导航入口，同步更新侧边栏数据来源、mock 数据或 `TopbarLayout` 的 `navigation.items`。
6. 如果新增的是已有模块入口下的子页面，例如 `/tasks/auto-evaluation`，需要同步检查父级菜单项是否设置 `activeMatch: 'prefix'`，保证进入子页面时侧边栏或顶部入口仍保持高亮。

### SidebarLayout 页面

标准中后台页面挂入 `SidebarLayout` 分支，页面内部优先使用 `Page`：

```tsx
import { ModulePage } from '@/modules/<module-name>'

{
  path: '',
  element: <SidebarLayout />,
  children: [
    { path: '<module-path>', element: <ModulePage /> },
  ],
}
```

页面内部：

```tsx
export function ModulePage() {
  return (
    <Page>
      <h1 className='text-2xl font-bold tracking-tight'>页面标题</h1>
    </Page>
  )
}
```

### TopbarLayout 页面

顶部导航型页面挂入 `TopbarLayout` 分支，页面内部通常直接使用 `Main`，不再使用 `Page` 或 `PageHeader`：

```tsx
import { ModulePage } from '@/modules/<module-name>'

{
  path: '',
  element: <TopbarLayout navigation={topbarNavigation} />,
  children: [{ path: '<module-path>', element: <ModulePage /> }],
}
```

若新增同一顶部导航分支下的页面，需要同步更新传给 `TopbarLayout` 的 `navigation.items`。

### 错误页

错误页直接挂在根路由 children 下：

```tsx
{ path: '<error-path>', element: <ErrorPage /> }
```

错误页模块不使用 `Page`，除非明确需要进入某个业务布局。

## API 接入

模块 API 放在：

```txt
src/modules/<module-name>/api/index.ts
```

定义示例：

```ts
export const moduleApi = {
  listItems: {
    method: 'GET',
    url: '/items',
  },
  getItem: {
    method: 'GET',
    url: '/items/:id',
  },
} as const
```

注册到全局 registry：

```ts
import { moduleApi } from '@/modules/<module-name>/api'

export const apiRegistry = {
  ...moduleApi,
} as const
```

使用方式：

```tsx
import { useAPI } from '@/hooks/use-api'

const $api = useAPI()
const data = await $api.listItems({ query: { page: 1, pageSize: 20 } })
```

规则：

- API alias 是全局扁平结构，名称必须唯一。
- 模块 API 必须在 `src/api/registry.ts` 中展开注册后才能通过 `$api` 使用。
- 模块页面、hooks、stores 中通过 `useAPI()` 或全局 `api` 调用接口。
- 具体 alias 命名、参数结构和测试规则见 `spec/10-foundation/api.md`。

## 组件接入

模块页面优先组合全局组件，而不是复制布局：

- `SidebarLayout` 页面优先使用 `Page`。
- 顶部导航布局页面优先使用 `Main`。
- 页面内容区导航和操作区优先使用 `PageNav`。
- 通用的页面内侧向导航可使用 `src/components/common/sidebar-nav.tsx`，调用方负责传入菜单项、默认选中值和文案。
- 通用的详情/设置内容区可使用 `src/components/common/content-section.tsx`，调用方负责传入标题、描述和内容。
- 设置类页面的父子路由、`SidebarNav` 和 `ContentSection` 组合方式见 `spec/50-patterns/settings-page-layout.md`。
- 基础 UI 使用 `src/components/ui`。
- 模块私有组件放入模块 `components/`。

模块内组件示例：

```txt
src/modules/<module-name>/
  components/
    <module-name>-page-header.tsx
  index.tsx
```

规则：

- 只服务当前模块的组件留在模块内。
- 依赖模块 API 类型、业务枚举、权限 code 或页面状态的组件留在模块内。
- 可复用的数据表基础能力使用 `src/components/common/data-table`，业务列定义和业务操作留在模块内。
- 组件上提到 `src/components/common` 时，必须先移除模块路径、业务默认值、接口类型和业务文案硬编码，改为 props 配置。
- 不要把模块私有组件直接放入 `src/components/common`。
- 组件分层和样式规则见 `spec/30-ui/component-guide.md` 与 `spec/30-ui/styles-theme.md`。

## 状态与数据

### 模块私有状态

只被一个模块使用的状态放在：

```txt
src/modules/<module-name>/stores/
```

规则：

- 使用 Zustand 时，文件命名为 `*.store.ts`。
- 模块私有 store 不被其他模块深层导入。
- 如果多个模块稳定依赖同一状态，再上提到 `src/stores`。

### 全局状态

全局 store 当前位于：

```txt
src/stores/
```

不要使用旧路径 `src/store`。

### 模块私有数据

静态展示数据、演示数据或模块内 mock 数据可放在：

```txt
src/modules/<module-name>/data/
```

如果数据会被多个模块复用，先判断它是业务类型、配置、资产还是 API 结果，再分别上提到 `src/types`、`src/config`、`src/assets` 或接口层。

## 类型与 hooks

模块私有类型：

```txt
src/modules/<module-name>/types.ts
src/modules/<module-name>/types/
```

模块私有 hooks：

```txt
src/modules/<module-name>/hooks/
```

规则：

- 只服务当前模块的类型和 hooks 留在模块内。
- 被多个模块复用的 hook 上提到 `src/hooks`。
- 被多个模块复用的类型上提到 `src/types`。
- 类型不要为了“可能复用”提前上提。
- 模块外部不要依赖模块私有 types 路径；需要公开类型时从模块入口显式导出。

## 跨模块依赖

允许：

- 模块使用 `src/components/*`、`src/hooks/*`、`src/lib/*`、`src/api/*`、`src/stores/*`、`src/types/*` 的公开能力。
- 路由层从模块入口导入页面组件。
- API registry 从模块 `api` 导入 alias。

避免：

- 一个业务模块导入另一个业务模块的 `components/`、`hooks/`、`stores/`、`views/` 深层文件。
- 模块之间共享私有 Zustand store。
- 通过相对路径跨模块导入，例如 `../other-module/components/...`。

如果确实需要跨模块复用，先上提到合适的全局层：

| 复用内容 | 上提目标 |
| --- | --- |
| 无业务含义 UI 组合 | `src/components/common` |
| 跨模块业务组件 | `src/components/business` |
| 应用框架、导航、布局 | `src/components/layout` |
| 全局 hook | `src/hooks` |
| 全局状态 | `src/stores` |
| 共享类型 | `src/types` |
| 纯工具函数 | `src/lib` 或 `src/utils`，以当前项目已有职责为准 |
| 主题、reset、全局 utility | `src/styles` |

## 禁止事项

- 不要为每个模块强制创建空目录。
- 不要引用不存在的模板模块；以当前真实模块目录作为参考。
- 不要假设每个模块必须有 `routes.tsx`；当前路由集中在 `src/routes/index.tsx`。
- 不要在模块内创建新的全局路由根节点。
- 不要把模块私有 UI 直接放到 `src/components/common` 或 `src/components/business`。
- 不要从其他模块深层路径导入私有实现。
- 不要让模块之间互相依赖私有 store。
- 不要在模块页面里直接创建全局 provider、router、query client 或 axios 实例。
- 不要为了单个模块创建新的跨项目抽象层。

## 新增模块流程

1. 创建 `src/modules/<module-name>/index.tsx`，导出页面组件。
2. 按需创建 `components`、`views`、`hooks`、`stores`、`types`、`data`、`api`。
3. 页面布局根据路由分支选择：`SidebarLayout` 页面用 `Page`，`TopbarLayout` 页面用 `Main`。
4. 在 `src/routes/index.tsx` 导入模块页面并挂入对应布局分支。
5. 如需路由权限，用 `RouteGuard` 包裹页面元素。
6. 如需 API，在模块 `api/index.ts` 定义 alias，并注册到 `src/api/registry.ts`。
7. 如需导航入口，同步更新侧边栏数据来源、mock 数据或 topbar navigation。
8. 根据改动运行格式检查、类型检查和必要测试。

涉及代码变更时至少运行：

```bash
npm run typecheck
```

## 检查清单

- 模块目录名使用 kebab-case。
- 没有创建无内容的模板目录。
- 页面模块从 `index.tsx` 导出路由组件。
- 路由已在 `src/routes/index.tsx` 按布局分支挂载。
- 需要权限的路由已使用 `RouteGuard`。
- 模块私有组件、hooks、stores、types 留在模块内。
- 跨模块导入只使用模块公开入口或全局目录。
- 新增 API 已在 `src/api/registry.ts` 注册。
- 没有使用不存在的 `src/store` 路径。
- 涉及代码变更时已运行 `npm run typecheck`。
