# Components

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

规范项目中组件的定义、放置、导入和组合方式，保证中后台界面在 shadcn/ui、Tailwind CSS v4 和业务模块之间保持一致、可维护。

## 技术基础

当前项目组件体系基于：

- React 19 + TypeScript
- Vite SPA，`components.json` 中 `rsc: false`
- Tailwind CSS v4，样式入口为 `src/styles/index.css`
- shadcn/ui 源码型组件，目录为 `src/components/ui`
- Radix UI primitives
- Lucide React 图标库，`components.json` 中 `iconLibrary: "lucide"`
- `class-variance-authority`、`clsx`、`tailwind-merge`
- TanStack Table、React Hook Form、Sonner 等组合型能力

组件 import alias 以 `components.json` 为准：

```json
{
  "components": "@/components",
  "ui": "@/components/ui",
  "utils": "@/lib/utils",
  "lib": "@/lib",
  "hooks": "@/hooks"
}
```

## 适用范围

- `src/components/ui/*`
- `src/components/common/*`
- `src/components/layout/*`
- `src/modules/<module-name>/components/*`
- `src/modules/<module-name>/views/*`
- `components.json`
- 任意 JSX/TSX 页面与组件

## 组件分层

| 目录 | 当前状态 | 职责 |
| --- | --- | --- |
| `src/components/ui` | 已存在 | shadcn/ui 生成或维护的底层 UI 源码组件，只承载基础交互、样式 variant 和可访问性结构 |
| `src/components/common` | 已存在 | 跨页面复用、无强业务域归属的组合组件，例如 `Page`、`PageNav`、`AppCardList`、`ConfirmDialog`、`DataTable*`、`Can` |
| `src/components/layout` | 已存在 | 应用级壳组件和导航组件，例如 `RootLayout`、`SidebarLayout`、`TopbarLayout`、`Header`、`Main`、`TopNav`、`AppSidebar` |
| `src/components/business` | 已存在 | 被多个模块复用且带明确业务概念的组件，例如 `AppList` |
| `src/modules/<module>/components` | 已存在示例 | 模块私有组件，例如 `src/modules/tasks/components/tasks-page-header.tsx` |
| `src/modules/<module>/views` | 当前未创建 | 模块私有子页面视图，适合页面拆分后的 route view |
| `src/lib` | 已存在 | 工程 helper 和第三方适配，例如 `cn()`、权限、导航、请求错误处理 |

判断放置位置时优先按复用范围决定，而不是按文件大小决定：

- 只被一个模块使用：放入 `src/modules/<module>/components`。
- 多个模块复用但没有业务语义：放入 `src/components/common`。
- 多个模块复用且带业务领域语义：放入 `src/components/business`。
- 应用框架、导航、页面壳、主内容容器：放入 `src/components/layout`。
- Button、Dialog、Select、Table 等底层交互与视觉 primitive：放入 `src/components/ui`。

## `src/components/ui` 定义规则

`src/components/ui` 是 shadcn/ui 源码组件目录。当前项目已经存在：

- 操作与状态：`button`、`badge`、`alert`、`skeleton`、`sonner`
- 表单输入：`form`、`input`、`textarea`、`select`、`checkbox`、`radio-group`、`switch`、`input-otp`、`calendar`
- 覆盖层：`dialog`、`alert-dialog`、`sheet`、`popover`、`hover-card`、`tooltip`、`dropdown-menu`
- 数据展示：`table`、`card`、`avatar`
- 导航与结构：`tabs`、`sidebar`、`collapsible`、`command`、`scroll-area`、`separator`

规则：

- 业务代码优先组合已有 `ui` 组件，不手写等价的 button、dialog、select、table、card 等基础组件。
- 新增 shadcn/ui 组件时使用 CLI 生成到 `src/components/ui`，不要手动从网络复制源码。
- `ui` 组件不得依赖业务 API、路由数据、store、权限 code 或模块私有类型。
- `ui` 组件可暴露 `variant`、`size`、`asChild`、`className` 等通用扩展点。
- `ui` 组件内部样式使用语义 token 和 Tailwind utility，条件 class 使用 `cn()`。
- 不在 `ui` 组件里新增业务默认文案、菜单项、接口请求或登录态逻辑。
- 不维护与文件系统不一致的能力清单；是否可用以 `src/components/ui/*.tsx` 为准。

## `src/components/common` 定义规则

`common` 是全局组合组件层。它可以组合 `ui`、hooks、context 和少量工程 helper，但不应绑定某个业务模块的数据结构。

当前主要类型：

- 页面壳组合：`Page`、`PageHeader`、`PageNav`、`PageAction`、`ContentSection`
- 卡片列表展示：`AppCardList`
- 通用交互：`ConfirmDialog`、`SignOutDialog`、`ImportDialog`、`DatePicker`、`PasswordInput`、`SelectDropdown`
- 导航与用户入口：`ProfileDropdown`、`NavUser`、`Search`、`CommandMenu`、`SidebarNav`
- 数据表组合：`common/data-table/*`
- 权限展示：`Can`、`PermissionScopeProvider`
- 状态与展示：`PageGuide`、`LongText`、`NavigationProgress`

规则：

- `common` 组件必须有跨页面复用价值。
- `common` 组件可以有产品通用语义，例如确认弹窗、页面导航、权限可见性。
- 不要把单个页面的标题区、筛选区、按钮组直接上提到 `common`。
- 如果组件需要业务数据，优先通过 props 注入，不在组件内请求模块 API。
- 抽离到 `common` 的组件不得保留模块路径、默认文案或业务枚举硬编码；例如 `SidebarNav` 的默认选中路由和移动端 placeholder 由调用方通过 `defaultValue`、`selectPlaceholder` 传入。
- 可复用的数据表工具放在 `src/components/common/data-table`，业务列定义、业务筛选项和操作按钮留在模块内。

## `src/components/layout` 定义规则

`layout` 只处理应用框架、导航和页面主区域，不处理具体业务页面内容。

当前主要组件：

- `RootLayout`：全局 provider 和 outlet 壳。
- `SidebarLayout`：侧边栏布局，组合 `SidebarProvider`、`AppSidebar`、`SidebarInset`、`LayoutProvider`、`SearchProvider`。
- `TopbarLayout`：顶部导航布局，组合 `TopNav` 和 route outlet。
- `Main`：页面主内容容器，负责 padding、fixed/fluid、容器查询宽度。
- `Header`、`AppSidebar`、`NavGroup`、`ProjectSwitcher`：侧边栏布局的导航结构。
- `TopNav`：纯展示顶部导航，不绑定路由库、不内置业务数据。
- `sub-top-nav`：侧边栏页面内的顶部链接导航。

规则：

- 新页面优先使用现有 layout，不在页面里重复实现 app shell。
- `TopNav` 的品牌、菜单、用户和操作入口都由调用方传入；不要把默认业务数据写进组件。
- `PageHeader` 只用于 `SidebarLayout` 下的页面顶部，`TopbarLayout` 不使用 `PageHeader`。
- 页面标题、筛选条件、表格和业务按钮放在页面内容区，不放进 `layout`。

## 模块私有组件定义规则

模块私有组件放在：

```txt
src/modules/<module-name>/components/
```

适合放入模块内的内容：

- 只服务当前模块的页面 header、filter、form、table columns、detail section。
- 依赖当前模块 API 类型、store、权限 code 或业务枚举的组件。
- 当前模块暂未证明会被复用的复杂 JSX。

只有满足以下条件之一，才考虑上提：

- 已被两个以上模块稳定复用。
- 抽离后不再依赖模块私有 API 类型。
- 抽离后能用清晰 props 表达输入输出。

## 组件使用规则

### 导入

从具体文件导入，不新增全局全量 barrel：

```tsx
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Page } from '@/components/common/page'
```

允许局部目录维护小范围出口，例如 `common/data-table` 可按需要导出同组组件，但不要创建 `src/components/index.ts` 作为全量入口。

### 页面骨架

侧边栏布局下的新页面优先使用 `Page` 和 `Main` 约定：

```tsx
import { Page } from '@/components/common/page'

export function TasksPage() {
  return (
    <Page>
      <section className='flex flex-col gap-4'>
        {/* page content */}
      </section>
    </Page>
  )
}
```

详情页、列表页的内容区二级导航和操作按钮优先使用 `PageNav`。如果内容区只需要返回按钮、筛选条件插槽和右侧操作按钮，不需要二级导航，使用 `PageAction`。顶部导航布局页面使用 `TopbarLayout` 的 `navigation` 配置，不重复引入 `PageHeader`。

### 组合优先级

开发组件时按以下顺序选择：

1. 是否已有 `src/components/ui` primitive。
2. 是否已有 `src/components/common` 或 `src/components/layout` 组合组件。
3. 是否应在模块内创建私有组件。
4. 是否需要新增跨模块 `common` 或 `business` 组件。
5. 是否需要新增 shadcn/ui 底层组件。

## 样式与图标规则

- 样式规则以 `spec/30-ui/styles-theme.md` 为准。
- 业务组件优先使用 `Button`、`Card`、`Dialog`、`DropdownMenu`、`Tabs`、`Select`、`Avatar` 等已有 `ui` 组件。
- 颜色使用语义 token，例如 `bg-background`、`text-muted-foreground`、`border-border`、`bg-card`。
- `className` 主要用于布局、尺寸和少量局部调整，不覆盖组件核心颜色体系。
- 条件 class、可选 class 和可合并 class 使用 `cn()`。
- 间距优先使用 `gap-*`，不要新增 space 间距工具。
- 等宽高元素使用 `size-*`。
- 文本溢出使用 `truncate` 或 `line-clamp-*`。
- 新增图标优先从 `lucide-react` 导入；当前少量历史组件使用 `@radix-ui/react-icons` 可保留，但新代码不继续扩大使用范围。
- 按钮内图标优先使用 `data-icon='inline-start'` 或 `data-icon='inline-end'`，并让 `Button` 控制图标尺寸。

示例：

```tsx
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

<Button size='sm'>
  <Plus data-icon='inline-start' />
  新建
</Button>
```

## Props 与状态规则

- 组件 props 使用明确类型，不使用 `any`。
- 能从已有组件继承的 props，优先使用 `React.ComponentProps<typeof Component>` 或 `React.HTMLAttributes<HTMLElement>`。
- 可复用组件通过 props 接收数据和回调，不直接读模块私有 store。
- 受控/非受控状态要在 props 命名上表达清楚，例如 `open` + `onOpenChange`。
- 异步状态通过 `disabled`、loading 文案或 spinner 表达，不向 shadcn `Button` 增加不存在的 `isLoading` prop。
- 路由跳转逻辑写在调用方；纯展示组件通过回调把事件交给调用方。

## 禁止事项

- 不要为单个模块的私有组件创建全局组件。
- 不要在多个文件中复制大段相同 JSX。
- 不要在业务页面手写基础 button、card、dialog、select、table 样式来替代现有组件。
- 不要在 `src/components/ui` 中写业务请求、权限判断、路由跳转或 store 读取。
- 不要使用内联 style 处理可由 Tailwind 表达的样式。
- 不要引入新的 CSS-in-JS 或运行时全量 UI 框架，除非任务明确要求。
- 不要让页面依赖不存在的设计 token 或未配置的 Tailwind 主题字段。
- 不要在模块或组件样式里重复定义全局 reset、滚动条或主题变量。
- 不要新增与当前文件系统不一致的组件清单。

## 新增或修改组件流程

1. 判断组件作用域：模块私有、全局通用、跨模块业务、布局或底层 UI。
2. 先检查 `src/components/ui`、`src/components/common`、`src/components/layout` 是否已有组件可组合。
3. 若只是当前模块需要，在模块内创建组件。
4. 若需要新增底层通用 UI，使用 shadcn CLI 生成源码到 `src/components/ui`，再检查生成文件是否符合项目 alias、token 和图标规则。
5. 若新增组合组件，按复用范围放入 `common`、`business` 或模块目录。
6. 为组件定义明确 props，必要时暴露 `className` 并使用 `cn()` 合并。
7. 检查交互组件的可访问性、焦点管理、键盘操作和 title/fallback。
8. 根据风险补充测试或至少运行类型检查、lint、格式检查。

## 检查清单

- 组件目录符合复用范围。
- 组件名使用 PascalCase，文件名使用 kebab-case。
- props 类型明确，没有 `any`。
- UI primitive 从具体文件按需导入。
- 没有新增全局全量 barrel export。
- 条件 class 使用 `cn()`。
- 样式使用语义 token 和已有组件 variant。
- 图标来自 `lucide-react`，新按钮内图标带 `data-icon`。
- Overlay 组件有 title、关闭行为和焦点管理。
- 业务请求、权限 code 和模块私有类型没有泄漏到 `src/components/ui`。
