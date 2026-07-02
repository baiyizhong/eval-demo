# 设置类页面布局规范

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

本文档定义设置类页面的通用开发模式。设置类页面通常包含多个配置子页，例如账户设置、项目设置、系统配置、偏好配置、通知配置等。

## 适用场景

适合使用本规范的页面通常具备以下特征：

- 页面本身是配置入口，内部通过子路由展示不同配置项。
- 左侧或移动端需要配置分组导航。
- 子页面需要稳定的标题、描述和表单/内容区域。
- 页面需要在 `TopbarLayout` 或 `SidebarLayout` 下复用同一套内容区结构。

不适合使用本规范的页面：

- 普通列表页、详情页、仪表盘页面。
- 只有一个内容块且不需要分组导航的页面。
- 需要复杂工作流、步骤条或多面板编排的页面。

## 布局选择

设置类页面不绑定某个外层布局，按路由分支选择容器：

- `TopbarLayout` 下：页面入口直接使用 `Main`。不要使用 `Page`，避免重复渲染 `PageHeader`、`ProfileDropdown`，也避免在没有 `SidebarProvider` 的上下文中触发 `Header` 内部的 `SidebarTrigger`。
- `SidebarLayout` 下：页面入口优先使用 `Page`，由 `Page` 提供侧边栏页面的顶部区域；如果页面明确不需要 `PageHeader`，才直接使用 `Main`。

无论外层使用哪种布局，页面内容区都保持一致：

1. 页面标题和说明。
2. `Separator`。
3. 横向内容区：左侧/移动端 `SidebarNav`，右侧 `Outlet`。
4. 子页面使用 `ContentSection`。

## 父页面结构

父页面负责声明页面标题、说明、配置导航项和子路由出口。`SidebarNav` 的业务路径、默认选中项、移动端 placeholder 都必须由调用方传入。

### TopbarLayout 页面

```tsx
import { Wrench } from 'lucide-react'
import { Outlet } from 'react-router'
import { Separator } from '@/components/ui/separator'
import { SidebarNav } from '@/components/common/sidebar-nav'
import { Main } from '@/components/layout/main'

const settingsNavItems = [
  {
    title: '账户',
    href: '/settings/account',
    icon: <Wrench size={18} />,
  },
]

export function Settings() {
  return (
    <Main>
      <div className='flex flex-col gap-1'>
        <h1 className='text-2xl font-bold tracking-tight md:text-3xl'>
          设置
        </h1>
        <p className='text-muted-foreground'>管理账户设置和偏好配置。</p>
      </div>
      <Separator className='my-4 lg:my-6' />
      <div className='flex flex-1 flex-col gap-2 overflow-hidden lg:flex-row lg:gap-12'>
        <aside className='top-0 lg:sticky lg:w-1/5'>
          <SidebarNav
            items={settingsNavItems}
            defaultValue='/settings/account'
            selectPlaceholder='设置分组'
          />
        </aside>
        <div className='flex w-full overflow-y-hidden p-1'>
          <Outlet />
        </div>
      </div>
    </Main>
  )
}
```

### SidebarLayout 页面

```tsx
import { Wrench } from 'lucide-react'
import { Outlet } from 'react-router'
import { Separator } from '@/components/ui/separator'
import { Page } from '@/components/common/page'
import { SidebarNav } from '@/components/common/sidebar-nav'

const settingsNavItems = [
  {
    title: '账户',
    href: '/settings/account',
    icon: <Wrench size={18} />,
  },
]

export function Settings() {
  return (
    <Page>
      <div className='flex flex-col gap-1'>
        <h1 className='text-2xl font-bold tracking-tight md:text-3xl'>
          设置
        </h1>
        <p className='text-muted-foreground'>管理账户设置和偏好配置。</p>
      </div>
      <Separator className='my-4 lg:my-6' />
      <div className='flex flex-1 flex-col gap-2 overflow-hidden lg:flex-row lg:gap-12'>
        <aside className='top-0 lg:sticky lg:w-1/5'>
          <SidebarNav
            items={settingsNavItems}
            defaultValue='/settings/account'
            selectPlaceholder='设置分组'
          />
        </aside>
        <div className='flex w-full overflow-y-hidden p-1'>
          <Outlet />
        </div>
      </div>
    </Page>
  )
}
```

## 子页面结构

子页面使用 `ContentSection` 承载标题、说明和具体内容。标题和说明由子页面传入，不写进公共组件。

```tsx
import { ContentSection } from '@/components/common/content-section'
import { AccountForm } from './account-form'

export function SettingsAccount() {
  return (
    <ContentSection title='账户' desc='更新账户设置，配置你的首选语言和时区。'>
      <AccountForm />
    </ContentSection>
  )
}
```

## 路由接入

设置类页面应使用子路由承载每个配置分组，并为父路径配置 index redirect，默认进入第一个子页面。

```tsx
import { Navigate } from 'react-router'
import { Settings } from '@/modules/settings'
import { SettingsAccount } from '@/modules/settings/views/account'

{
  path: 'settings',
  element: <Settings />,
  children: [
    { index: true, element: <Navigate to='account' replace /> },
    { path: 'account', element: <SettingsAccount /> },
  ],
}
```

如果页面挂在 `TopbarLayout` 分支下，需要同步更新该分支的 `navigation.items`。如果页面挂在 `SidebarLayout` 分支下，需要同步更新侧边栏菜单数据来源。

## 配置化规则

- `SidebarNav.items` 由页面定义，`href` 必须与路由子页面保持一致。
- `SidebarNav.defaultValue` 使用第一个默认子路由的完整路径。
- `SidebarNav.selectPlaceholder` 使用当前业务语义，例如 `设置分组`、`项目配置`。
- `SidebarNav.orientation` 可选值为 `responsive`、`horizontal`、`vertical`，默认 `responsive`。
- `responsive` 保持设置页默认行为：移动端使用下拉选择，`md` 到 `lg` 内容区为横向导航，`lg` 及以上为垂直导航。
- `horizontal` 用于需要固定横向展示配置分组的场景；`vertical` 用于需要固定垂直展示配置分组的场景。
- `ContentSection.title`、`ContentSection.desc` 由子页面传入。
- 公共组件不得硬编码 `/settings`、业务标题、业务枚举、接口类型或权限 code。

## 禁止事项

- 不要在设置类页面中直接使用 `Header`。
- 不要在 `TopbarLayout` 下使用 `Page` 或 `PageHeader`。
- 不要复制 `SidebarNav` 或 `ContentSection` 的私有实现。
- 不要在 `src/components/common` 中写死设置模块路径、默认文案或业务数据。
- 不要省略父路由的 index redirect，否则访问父路径时右侧内容区会为空。
