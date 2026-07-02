# 页面开发规范

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

本文档定义项目中常用页面类型，以及 `Page`、`Main`、`PageNav` 的组合方式。页面模块通常位于 `src/modules/<module>`。

## 页面类型

| 类型 | 推荐容器 | 适用场景 |
| --- | --- | --- |
| `Page` 包裹型页面 | `Page` | `SidebarLayout` 下的标准业务页 |
| 带二级导航/操作区页面 | `Page` + `PageNav` | 页面内容区需要局部导航、返回按钮、右侧操作按钮 |
| `Main` 直用页面 | `Main` | `TopbarLayout` 下已有全局顶部导航的页面 |
| 错误页/公共页 | 自定义页面组件 | 直接挂在 `RootLayout` 下，不强制使用 `Page` |

## Page 包裹型页面

`Page` 位于 `src/components/common/page.tsx`，用于标准侧边栏业务页。它会自动渲染：

- `PageHeader`：固定页头，包含页面级顶部导航和 `ProfileDropdown`。
- `Main`：主内容容器。

`Page` 的 props 由 `Main` props 扩展，并额外支持 `links`：

```ts
type PageProps = React.ComponentProps<typeof Main> & {
  links?: React.ComponentProps<typeof PageHeader>['links']
}
```

### links

`links` 会传给 `PageHeader`，类型来自 `src/components/layout/sub-top-nav.tsx` 的 `TopNav`：

```tsx
const links = [
  {
    title: '应用管理',
    href: '/apps',
    isActive: true,
    disabled: false,
    icon: Home,
  },
]

<Page links={links}>...</Page>
```

未传 `links` 时，`Page` 会使用内部默认链接。新增业务页建议显式传入与当前模块对应的 `links`，避免页面顶部导航显示错误语义。

### Main 透传参数

`Page` 会将除 `links` 外的 props 透传给 `Main`：

- `fixed`：内容区使用固定高度布局，`Main` 会设置 `data-layout="fixed"`，并启用 `flex grow flex-col overflow-hidden`。
- `fluid`：取消默认最大宽度限制，让内容区占满可用宽度。
- `className`：追加到 `main` 元素上。
- 其他标准 `main` HTML 属性也可以传入。

```tsx
<Page fixed fluid className='gap-4'>
  <section>...</section>
</Page>
```

如果页面是带多个配置子页的设置类页面，可在 `Page` 内组合 `SidebarNav` 和 `Outlet`。完整约定见 `spec/50-patterns/settings-page-layout.md`。

## 标准内容页面

标准内容页面用于仪表盘、说明页、详情页等常规业务内容。结构建议为：

- 顶部标题区放在 `Page` 内容内。
- 标题使用页面级 `h1`。
- 页面主体使用 section、Tabs、表格或业务组件组合。

示例，对应 `src/modules/dashboard/index.tsx`：

```tsx
export function Dashboard() {
  return (
    <Page>
      <div className='mb-2 flex items-center justify-between gap-2'>
        <h1 className='text-2xl font-bold tracking-tight'>数字面板</h1>
        <Button>下载报告</Button>
      </div>

      <Tabs orientation='vertical' defaultValue='overview'>
        <TabsList>
          <TabsTrigger value='overview'>预览</TabsTrigger>
          <TabsTrigger value='analytics'>分析</TabsTrigger>
        </TabsList>
        <TabsContent value='overview'>
          <section className='rounded-lg border bg-card p-6 text-card-foreground'>...</section>
        </TabsContent>
      </Tabs>
    </Page>
  )
}
```

## 带二级导航/操作区页面

当页面内容区需要局部导航、返回按钮或右侧操作按钮时，在 `Page` 内组合 `PageNav`。`PageNav` 不替代 `PageHeader`，它属于页面内容的一部分。

`PageNav` 的 `topNav` 和 `buttonGroups` 都是可选配置。未配置 `topNav` 或 `topNav.links` 为空数组时，不显示二级导航；未配置 `buttonGroups` 或 `buttonGroups.buttons` 为空数组时，不显示右侧按钮组。如果返回按钮、二级导航和按钮组都没有有效配置，`PageNav` 整体不渲染。

当页面不需要二级导航，只需要左侧返回按钮、中间筛选条件或状态控件、右侧操作按钮时，使用 `PageAction`。`PageAction` 的 `children` 是中间插槽，`buttonGroups` 始终贴在最右侧，`showBackButton` 始终位于最左侧。

示例，对应 `src/modules/tasks/index.tsx` 和 `src/modules/tasks/components/tasks-page-header.tsx`：

```tsx
export function Tasks() {
  return (
    <Page>
      <div className='flex flex-col gap-4'>
        <div className='mb-4 flex items-center justify-between gap-2'>
          <h1 className='text-2xl font-bold tracking-tight'>评测管理</h1>
        </div>
        <TasksPageHeader />
        <section className='rounded-lg border bg-card p-6 text-card-foreground'>...</section>
      </div>
    </Page>
  )
}
```

```tsx
export function TasksPageHeader() {
  return (
    <PageNav
      showBackButton
      topNav={{
        variant: 'underline',
        links: tasksTopNav,
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
  )
}
```

## Main 直用页面

`TopbarLayout` 已经提供全局顶部导航，因此该布局下的页面不要再使用 `Page`，否则会重复渲染 `PageHeader` 和 `ProfileDropdown`。

这类页面直接使用 `Main`：

```tsx
export function Apps() {
  return (
    <Main fixed>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>App Integrations</h1>
        <p className='text-muted-foreground'>
          Here&apos;s a list of your apps for the integration!
        </p>
      </div>

      <section>...</section>
    </Main>
  )
}
```

适用规则：

- 页面已经位于 `TopbarLayout` 分支下。
- 顶部导航由 `TopbarLayout navigation={...}` 提供。
- 页面内容需要固定高度滚动时传 `fixed`。
- 页面需要全宽展示时传 `fluid` 或依赖 `TopbarLayout` 的内容容器样式。
- 需要页面内侧向导航时，可组合 `src/components/common/sidebar-nav.tsx`，但默认路由、菜单项和选择框文案必须由页面传入。
- 需要子页面内容标题和描述区时，可组合 `src/components/common/content-section.tsx`，标题、描述和表单内容由子页面传入。
- 设置类页面的父页面、子页面和路由默认跳转模板见 `spec/50-patterns/settings-page-layout.md`。

## 错误页和公共页

错误页如 `401`、`403`、`404`、`500`、`503` 直接挂在 `RootLayout` 下，不要求使用 `Page`：

```tsx
{ path: '404', element: <NotFoundError /> }
```

公共页如果不需要登录态应用壳，也应独立实现页面结构，不要强行挂入 `SidebarLayout` 或 `TopbarLayout`。

## 页面开发规则

- `SidebarLayout` 下的新业务页默认使用 `Page`。
- `TopbarLayout` 下的新页面默认使用 `Main`。
- 页面级标题写在页面内容内，不写进 `PageHeader`。
- 局部 tab、返回按钮和右侧操作按钮使用 `PageNav`。
- 无局部 tab、但需要返回按钮、筛选条件和右侧操作按钮时使用 `PageAction`。
- 不要在页面中重复渲染 `ProfileDropdown`。
- 只有明确需要全宽布局时才传 `fluid`。
- 需要固定高度、内部滚动或表格占满剩余空间时才传 `fixed`。
