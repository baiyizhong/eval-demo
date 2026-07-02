# Page Shell 组件使用规范

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

本文档说明 `PageHeader`、`PageNav`、`PageAction`、`PageGuide`、`ProfileDropdown` 的职责和使用方式。完整页面类型和布局选择见 `spec/30-ui/page-layout.md` 与 `spec/20-architecture/layouts.md`。

## 组件职责

| 组件 | 文件 | 职责 |
| --- | --- | --- |
| `PageHeader` | `src/components/common/page-header.tsx` | 侧边栏页面顶部区域，组合 `Header`、页面级 `TopNav` 和 `ProfileDropdown` |
| `PageNav` | `src/components/common/page-nav.tsx` | 页面内容区的二级导航、返回按钮和右侧按钮组 |
| `PageAction` | `src/components/common/page-action.tsx` | 页面内容区的返回按钮、筛选条件插槽和右侧按钮组 |
| `PageGuide` | `src/components/common/page-guide.tsx` | 页面空状态、建设中或说明引导内容，支持默认文案、内容配置和后续扩展插槽 |
| `ProfileDropdown` | `src/components/common/profile-dropdown.tsx` | 用户头像下拉菜单和退出确认弹窗 |

## PageHeader

`PageHeader` 用于 `SidebarLayout` 下的页面顶部。普通业务页面通常不直接使用它，而是通过 `Page` 间接使用。

```tsx
import { PageHeader } from '@/components/common/page-header'

<PageHeader links={links} />
```

### Props

```ts
type PageHeaderProps = {
  links: React.ComponentProps<typeof TopNav>['links']
}
```

`links` 类型来自 `src/components/layout/sub-top-nav.tsx`：

```ts
type TopNavLink = {
  title: string
  href: string
  isActive?: boolean
  activeMatch?: 'exact' | 'prefix'
  disabled?: boolean
  icon?: LucideIcon
}
```

### 渲染结构

`PageHeader` 固定使用：

- `Header fixed`
- 右侧容器 `ms-auto flex items-center gap-8`
- `TopNav links={links}`
- `ProfileDropdown`

```tsx
export function PageHeader({ links }: PageHeaderProps) {
  return (
    <Header fixed>
      <div className='ms-auto flex items-center gap-8'>
        <TopNav links={links} />
        <ProfileDropdown />
      </div>
    </Header>
  )
}
```

### 使用规则

- `PageHeader` 只用于侧边栏页面顶部，不用于 `TopbarLayout` 页面。
- 页面级标题不要放进 `PageHeader`，应放在 `Page` 的内容区。
- 新页面优先使用 `Page`，由 `Page` 负责渲染 `PageHeader`。
- 不要在业务页面中额外重复渲染 `ProfileDropdown`。
- `links` 为空时不建议渲染 `PageHeader`；没有页面级导航的侧边栏页面可直接使用 `Page` 默认结构。

## PageNav

`PageNav` 用于页面内容区的局部导航和操作区。它常见于列表页、任务页、详情页的子导航栏。

```tsx
import { Download, Plus } from 'lucide-react'
import { PageNav } from '@/components/common/page-nav'

<PageNav
  showBackButton
  topNav={{
    variant: 'underline',
    links: [
      { title: '评测报告', href: '/tasks', isActive: true },
      { title: '自动评测', href: '/tasks', isActive: false },
    ],
  }}
  buttonGroups={{
    buttons: [
      {
        id: 'import',
        label: '导入',
        icon: Download,
        variant: 'outline',
        size: 'sm',
      },
      {
        id: 'create',
        label: '创建',
        icon: Plus,
        size: 'sm',
      },
    ],
  }}
/>
```

### Props

```ts
type PageNavTopNav = {
  links: React.ComponentProps<typeof TopNav>['links']
  variant?: React.ComponentProps<typeof TopNav>['variant']
  className?: React.ComponentProps<typeof TopNav>['className']
}

type PageNavProps = React.HTMLAttributes<HTMLDivElement> & {
  topNav?: PageNavTopNav | null
  buttonGroups?: ButtonGroupsProps | null
  showBackButton?: boolean
  onBack?: () => void
}
```

渲染规则：

- `topNav` 未配置，或 `topNav.links` 为空数组时，不渲染内部 `TopNav`。
- `buttonGroups` 未配置，或 `buttonGroups.buttons` 为空数组时，不渲染内部 `ButtonGroups`。
- `showBackButton`、`topNav.links`、`buttonGroups.buttons` 都没有有效配置时，`PageNav` 整体不渲染。

### topNav

`topNav.links` 使用 `src/components/layout/sub-top-nav.tsx` 的链接结构：

- `title`：导航文本。
- `href`：跳转路径。
- `isActive`：手动指定当前激活状态。
- `activeMatch`：未传 `isActive` 时用于自动匹配，可选 `exact` 或 `prefix`。
- `disabled`：禁用链接。
- `icon`：Lucide 图标组件对象。

`topNav.variant` 可选：

- `default`：普通横向链接样式。
- `underline`：下划线 tab 样式，适合内容区二级导航。

### buttonGroups

`buttonGroups` 透传给 `ButtonGroups`，核心字段为 `buttons`：

```ts
type ButtonGroupsProps = React.HTMLAttributes<HTMLDivElement> & {
  buttons?: ButtonGroupItem[] | null
}

type ButtonGroupItem = Omit<ButtonProps, 'children'> & {
  id?: React.Key
  label: React.ReactNode
  icon?: LucideIcon
  iconPosition?: 'start' | 'end'
  hidden?: boolean
}
```

使用规则：

- `icon` 传 Lucide 组件对象，例如 `Plus`，不要传字符串。
- `label` 是按钮显示内容；业务页面应使用中文文案。
- `variant`、`size`、`disabled`、`onClick` 等来自 shadcn `Button`。
- `hidden` 为 `true` 时不渲染该按钮。
- `iconPosition` 默认 `end`，需要左图标时传 `start`。

### 返回按钮

`showBackButton` 为 `true` 时，`PageNav` 左侧会渲染返回按钮：

- 默认行为：调用 `react-router` 的 `navigate(-1)`。
- 如果传入 `onBack`，则调用 `onBack()`，不再执行默认返回。
- 返回按钮 `aria-label` 为 `返回上一页`。

```tsx
<PageNav
  showBackButton
  onBack={() => navigate('/tasks')}
  topNav={...}
  buttonGroups={...}
/>
```

### 样式

`PageNav` 默认根元素样式为：

```txt
bg-card border-border flex flex-wrap items-center gap-2 border px-4 py-3
```

`ButtonGroups` 会合并 `ml-auto shrink-0`，保证按钮组始终在最右侧；`showBackButton` 始终渲染在最左侧。可通过 `className` 追加布局类。不要在页面中重写内部 `TopNav`、按钮组或返回按钮结构；需要差异化时优先通过 `topNav.className`、`buttonGroups.className` 或外层 `className` 调整。

## PageAction

`PageAction` 用于内容区操作栏，但不包含二级导航。它适合放筛选条件、搜索框、状态切换等页面局部控件，并在最右侧放操作按钮。

```tsx
import { Download, Plus } from 'lucide-react'
import { PageAction } from '@/components/common/page-action'
import { Input } from '@/components/ui/input'

<PageAction
  showBackButton
  buttonGroups={{
    buttons: [
      {
        id: 'export',
        label: '导出',
        icon: Download,
        variant: 'outline',
        size: 'sm',
      },
      {
        id: 'create',
        label: '新建',
        icon: Plus,
        size: 'sm',
      },
    ],
  }}
>
  <Input className='w-64' placeholder='搜索名称' />
</PageAction>
```

### Props

```ts
type PageActionProps = React.HTMLAttributes<HTMLDivElement> & {
  buttonGroups?: ButtonGroupsProps | null
  showBackButton?: boolean
  onBack?: () => void
}
```

`children` 来自 `React.HTMLAttributes<HTMLDivElement>`，作为中间插槽使用。常见内容包括筛选条件、搜索框、时间范围、状态切换和批量选择摘要。

渲染规则：

- `children` 未传入时，不渲染中间插槽。
- `buttonGroups` 未配置，或 `buttonGroups.buttons` 为空数组时，不渲染内部 `ButtonGroups`。
- `showBackButton`、`children`、`buttonGroups.buttons` 都没有有效配置时，`PageAction` 整体不渲染。

### 布局规则

`PageAction` 默认根元素样式为：

```txt
bg-card border-border flex flex-wrap items-center gap-2 border px-4 py-3
```

内部布局固定为：

- `showBackButton` 在最左侧。
- `children` 插槽位于返回按钮之后，使用 `min-w-0` 避免撑破容器。
- `ButtonGroups` 合并 `ml-auto shrink-0`，始终贴在最右侧。

返回按钮行为与 `PageNav` 一致：默认调用 `navigate(-1)`；如果传入 `onBack`，则调用 `onBack()`，不再执行默认返回。

### 使用规则

- `PageAction` 不渲染二级导航；需要局部 tab 或导航链接时使用 `PageNav`。
- `children` 插槽只放页面局部控件，不放整段页面内容。
- 当中间控件较多时，调用方应自行组合成可换行的 flex 容器，避免挤压右侧按钮组。
- 右侧操作仍通过 `buttonGroups` 传入，不在 `children` 中手写一组按钮。

## PageGuide

`PageGuide` 用于页面内容区的空状态、建设中页面或轻量说明引导。默认内容是“即将上线”状态，可以直接用于还未实现的页面。

```tsx
import { PageGuide } from '@/components/common/page-guide'

<PageGuide />
```

需要自定义内容时，通过 props 注入图标、标题和描述；需要在说明内容后追加操作按钮、链接或其他扩展内容时，使用 `children` 插槽。

```tsx
import { ArrowLeft, Wrench } from 'lucide-react'
import { PageGuide } from '@/components/common/page-guide'
import { Button } from '@/components/ui/button'

<PageGuide
  icon={Wrench}
  title='功能建设中'
  description={['该模块正在配置中。', '如需开通，请联系管理员。']}
>
  <Button size='sm' variant='outline'>
    <ArrowLeft />
    返回上一页
  </Button>
</PageGuide>
```

### Props

```ts
type PageGuideDescription = ReactNode | ReactNode[]

type PageGuideProps = {
  icon?: LucideIcon
  title?: ReactNode
  description?: PageGuideDescription
  children?: ReactNode
  className?: string
  contentClassName?: string
}
```

渲染规则：

- `icon` 默认使用 `Telescope`，调用方传 Lucide 组件对象，不传字符串。
- `title` 默认是 `即将上线！`。
- `description` 默认是两行文案：`该页面尚未创建。`、`敬请期待！`。
- `description` 传数组时按顺序渲染，并在每项之间插入换行。
- `children` 渲染在描述下方，适合放主要操作按钮、返回按钮、帮助链接或少量扩展内容。
- `className` 追加到外层容器，`contentClassName` 追加到内容容器。

### 布局规则

`PageGuide` 默认外层占满页面可视高度，并使用水平居中、内容中上居中布局：

```txt
min-h-svh w-full px-4
```

内部内容容器默认使用：

```txt
mx-auto flex w-full max-w-xl flex-col items-center pt-[20vh] text-center
```

使用规则：

- `PageGuide` 是页面内容区组件，不替代 `PageHeader`、`PageNav` 或 `PageAction`。
- 建设中、空数据说明、权限缺少补充说明等轻量状态优先使用 `PageGuide`。
- 复杂空状态页面如果需要筛选器、表格占位、多个分区或业务数据展示，应在业务模块内自行组合，不要把业务结构塞进 `PageGuide`。
- 追加操作优先放在 `children`，不要通过覆盖内部样式重写组件结构。

## ProfileDropdown

`ProfileDropdown` 渲染用户头像下拉菜单和退出确认弹窗。它当前由 `PageHeader` 使用，普通业务页面不应直接重复引入。

```tsx
import { ProfileDropdown } from '@/components/common/profile-dropdown'

<ProfileDropdown />
```

### 当前结构

组件内部使用：

- `DropdownMenu`
- `DropdownMenuTrigger`
- `Avatar`、`AvatarImage`、`AvatarFallback`
- `DropdownMenuGroup`
- `DropdownMenuItem`
- `DropdownMenuShortcut`
- `SignOutDialog`
- `useDialogState`

当前用户展示信息和菜单项仍是组件内静态数据。后续接入真实登录态时，应从认证 store 或用户 API 注入数据，避免在多个页面复制用户信息。

### 退出登录

退出菜单项使用 destructive 样式：

```tsx
<DropdownMenuItem variant='destructive' onClick={() => setOpen(true)}>
  Sign out
  <DropdownMenuShortcut className='text-current'>⇧⌘Q</DropdownMenuShortcut>
</DropdownMenuItem>
```

点击后打开 `SignOutDialog`：

```tsx
<SignOutDialog open={!!open} onOpenChange={setOpen} />
```

退出流程应集中在 `SignOutDialog` 或认证流程中实现，不要在调用页面中绕过该弹窗重复实现。

## 修改约束

- `PageHeader` 是页面壳组件，不承载业务标题和业务按钮。
- `PageNav` 是内容区组件，不替代应用级顶部导航。
- `PageAction` 是内容区操作栏组件，不承载二级导航；需要局部导航时使用 `PageNav`。
- `PageGuide` 是内容区状态引导组件，不承载页面壳导航、筛选器或业务列表结构。
- `ProfileDropdown` 默认只由页面壳或应用导航组合使用。
- `TopbarLayout` 页面不要使用 `PageHeader` 或 `ProfileDropdown`，用户入口由 `TopNav` 的 `user` 和 `menuActions` 提供。
- shadcn/ui 组件按源码组合使用，图标按钮优先传 Lucide 组件对象。
