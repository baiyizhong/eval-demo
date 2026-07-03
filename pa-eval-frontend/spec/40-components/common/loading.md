# Loading 组件使用规范

## 适用任务

- 处理页面局部数据加载态、区域加载态或通用 loading 展示。

## 相关源码

- `src/components/common/loading.tsx`

## 必读前置

- `spec/README.md`
- `spec/30-ui/component-guide.md`
- `spec/30-ui/styles-theme.md`

## 组件定位

`Loading` 是项目内通用的局部加载态组件，放在 `src/components/common`。它用于页面内容区、卡片区、表格加载单元格等局部数据加载场景。

`Loading` 不负责请求数据、不读取路由或业务 store，也不内置业务文案。调用方通过 props 传入当前场景的加载文案和布局尺寸。

全局路由切换进度仍使用 `NavigationProgress`；骨架屏仍使用 `Skeleton`。不要用 `Loading` 替代全局页面跳转进度。

## 导入

```tsx
import { Loading } from '@/components/common/loading'
```

## Props 契约

```tsx
type LoadingProps = React.ComponentProps<'div'> & {
  text?: string
  full?: boolean
}
```

规则：

- `text` 默认为 `加载中...`。业务页面应传入更具体的文案，例如 `加载 Trace 指标中...`。
- `full` 为 `true` 时使用可填满父容器的布局，适合父容器已有明确高度或 flex 剩余空间。
- `className` 只用于布局和尺寸覆盖，例如 `flex-1`、`min-h-24`、`border-0`。
- 组件使用 `role="status"` 和 `aria-live="polite"`，调用方不要重复包裹额外状态提示。
- 图标使用 `lucide-react` 的 loading 图标，并由组件内部控制尺寸和动画。

## 推荐用法

页面局部加载：

```tsx
{query.isLoading ? (
  <Loading text='加载 Trace 指标中...' className='flex-1' />
) : null}
```

表格单元格加载：

```tsx
<DataTable
  loadingText={
    <Loading
      text='加载 Trace 日志中...'
      className='min-h-24 border-0 bg-transparent'
    />
  }
/>
```

填满父容器：

```tsx
<section className='flex min-h-0 flex-1 flex-col'>
  <Loading full text='加载数据中...' />
</section>
```

## 样式规则

- 使用语义 token，例如 `bg-card`、`text-muted-foreground`、`border-border`。
- 使用 `gap-*` 管理间距，不使用 `space-*`。
- 使用 `size-*` 管理等宽高图标。
- 调用方覆盖尺寸时应通过 `className` 传入 Tailwind class，不写内联 style。
- `loading.tsx` 内部集中维护 class 组合规则；新增尺寸模式时应同步补充类型覆盖用例。

## 与其他加载态的边界

- `Loading`：局部区域加载，适合数据请求期间的集中提示。
- `Skeleton`：需要保留内容结构和占位轮廓时使用。
- `NavigationProgress`：路由切换、全局导航加载进度。
- 按钮保存中状态：优先在按钮内组合 spinner 和禁用状态，不使用区域 `Loading`。

## 禁止事项

- 不要在 `Loading` 中写具体模块名称、接口名称或业务枚举。
- 不要让 `Loading` 直接发起请求或读取 React Query 状态。
- 不要在业务页面复制一套 loading spinner JSX；优先复用 `Loading`。
- 不要用 `Loading` 包裹整个应用壳或全局路由出口。
- 不要为单个页面创建仅文案不同的私有 loading 组件。

## 检查清单

使用或修改 `Loading` 时确认：

- 加载文案由调用方按业务场景传入。
- `className` 只处理布局、尺寸或边框透明等局部覆盖。
- 页面局部加载和全局导航进度没有混用。
- `npm run typecheck` 通过。
- 修改 `Loading` 的 props 或 class 组合逻辑时，补充或更新 `src/tests/common/loading.types.test.tsx`。
