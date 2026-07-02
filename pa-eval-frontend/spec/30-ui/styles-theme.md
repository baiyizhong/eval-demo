# 样式与主题开发规范

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

本文档说明项目中样式入口、主题变量、Tailwind CSS v4 token、shadcn/ui 组件样式和业务页面样式的定义与使用规则。

## 技术基础

项目样式体系基于：

- Tailwind CSS v4
- `@tailwindcss/vite`
- shadcn/ui 源码型组件
- CSS 变量主题 token
- `clsx` + `tailwind-merge` 合并 className
- `tw-animate-css`

Tailwind 由 `vite.config.ts` 加载：

```ts
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

项目不使用 `tailwind.config.ts` 维护主题扩展。Tailwind v4 token 通过 CSS 中的 `@theme inline` 定义。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `src/styles/index.css` | Tailwind 入口、全局 base 样式、全局 utility、少量全局动画 |
| `src/styles/theme.css` | 主题 CSS 变量和 Tailwind `@theme inline` token 映射 |
| `src/lib/utils.ts` | 提供 `cn()`，用于条件 className 和 Tailwind 类合并 |
| `src/components/ui/*` | shadcn/ui 底层组件源码，使用语义 token 和组件 variants |

`src/main.tsx` 只导入 `src/styles/index.css`：

```tsx
import './styles/index.css'
```

业务模块不要直接导入全局 CSS 文件。模块样式优先使用组件、Tailwind 工具类和主题 token。

## 样式入口

`src/styles/index.css` 的导入顺序固定：

```css
@import 'tailwindcss';
@import 'tw-animate-css';
@import './theme.css';
```

规则：

- `tailwindcss` 必须最先导入。
- 第三方动画样式放在 Tailwind 后。
- 项目主题变量通过 `theme.css` 导入。
- 不要在业务文件中重复导入 Tailwind 或 `theme.css`。

## Base 样式

全局 base 样式集中写在 `src/styles/index.css`：

```css
@layer base {
  * {
    @apply border-border outline-ring/50;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }

  html {
    @apply overflow-x-hidden;
    font-size: 15px;
  }

  body {
    @apply bg-background text-foreground has-[div[data-variant='inset']]:bg-sidebar min-h-svh w-full;
  }
}
```

允许在 base 中维护：

- 全局背景和前景色。
- 默认边框和 focus outline token。
- HTML/body 基础布局。
- 全局滚动条规则。
- Radix 或浏览器行为的必要修正。
- 移动端输入框防缩放等全局兼容规则。

不要在 base 中写具体页面、业务模块或单个组件的样式。

## 主题变量

主题变量定义在 `src/styles/theme.css` 的 `:root` 下。当前主题为浅色主题。

核心 token 分组：

| 分组 | 变量 |
| --- | --- |
| 基础 | `--background`、`--foreground`、`--border`、`--input`、`--ring` |
| 容器 | `--card`、`--card-foreground`、`--popover`、`--popover-foreground` |
| 操作色 | `--primary`、`--secondary`、`--accent`、`--destructive` |
| 状态色 | `--success`、`--warning`、`--info` |
| 图表 | `--chart-1` 到 `--chart-5` |
| 侧边栏 | `--sidebar`、`--sidebar-foreground`、`--sidebar-primary`、`--sidebar-accent` 等 |
| 圆角 | `--radius` |

示例：

```css
:root {
  --radius: 0.625rem;
  --background: oklch(0.99 0.002 250);
  --foreground: oklch(0.15 0.02 250);
  --primary: oklch(0.55 0.22 250);
  --primary-foreground: oklch(1 0 0);
  --border: oklch(0.91 0.01 250);
  --ring: oklch(0.55 0.22 250);
}
```

规则：

- 新增全局颜色时，优先补充语义变量，而不是在组件里硬编码颜色。
- 色值优先使用 OKLCH，保持亮度、色相和对比度可控。
- `:root` 是当前默认主题来源。
- 项目当前没有独立 `.dark` 主题覆盖；不要只在业务组件里写一组零散 `dark:*` 颜色作为主题方案。

## Tailwind @theme 映射

`@theme inline` 将 CSS 变量映射为 Tailwind token：

```css
@theme inline {
  --radius-sm: calc(var(--radius) - 5px);
  --radius-md: calc(var(--radius) - 4px);
  --radius-lg: calc(var(--radius) - 2px);
  --radius-xl: calc(var(--radius) + 2px);

  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-border: var(--border);
}
```

映射后可以在组件中使用 Tailwind 语义类：

```tsx
<div className='bg-background text-foreground border-border rounded-lg border' />
<Button className='focus-visible:ring-ring/50'>保存</Button>
```

规则：

- 业务代码使用 `bg-background`、`text-muted-foreground`、`border-border` 等语义类。
- 不直接使用 `var(--primary)`，除非 Tailwind 工具类无法表达该场景，例如自定义渐变。
- 新增 `--color-*` 映射时，必须先在 `:root` 中定义对应基础变量。
- 字体 token 当前为 `--font-inter` 和 `--font-manrope`，新增字体要在 `@theme inline` 统一声明。

## 组件样式

组件优先使用 shadcn/ui 已有组件和 variants，不要重复手写底层交互样式。

推荐：

```tsx
<Button variant='outline' size='sm'>
  取消
</Button>

<Card>
  <CardHeader>
    <CardTitle>应用信息</CardTitle>
    <CardDescription>查看应用配置和连接状态</CardDescription>
  </CardHeader>
  <CardContent>...</CardContent>
</Card>
```

不推荐：

```tsx
<button className='rounded bg-blue-500 px-3 py-2 text-white'>取消</button>

<div className='rounded-xl border bg-[white] p-6 shadow-sm'>
  <h2>应用信息</h2>
</div>
```

规则：

- Button、Card、Dialog、Dropdown、Tabs、Select、Avatar 等优先使用 `src/components/ui` 组件。
- 组件状态色使用组件 variant 或语义 token。
- `className` 主要用于布局、尺寸和少量局部调整，不用于覆盖组件核心颜色体系。
- 图标按钮使用组件已定义的尺寸规则；按钮内图标优先使用 `data-icon='inline-start'` 或 `data-icon='inline-end'`。

## className 合并

项目通过 `cn()` 合并 className：

```ts
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

组件接收 `className` 时应使用：

```tsx
function Panel({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('bg-card text-card-foreground rounded-lg border p-4', className)}
      {...props}
    />
  )
}
```

规则：

- 有条件类名时使用 `cn()`。
- 不要用字符串模板拼接 Tailwind class。
- 不要把 `undefined`、布尔条件和重复 class 手动拼成字符串。
- 底层通用组件必须把调用方 `className` 追加到默认样式之后。

## 布局与间距

布局类可以直接写在页面和组件中，但应保持一致规则：

- 横向或纵向间距优先使用 `gap-*`。
- 等宽高元素使用 `size-*`。
- 文本溢出使用 `truncate` 或 `line-clamp-*`。
- 响应式布局使用 Tailwind 断点和容器查询，例如 `sm:*`、`lg:*`、`@container/content`。
- 页面主内容优先通过 `Main`、`Page`、`PageNav` 等组件承载布局。

推荐：

```tsx
<div className='flex flex-col gap-4 sm:flex-row'>
  <Input className='h-9 w-40 lg:w-[250px]' />
  <Button size='sm'>查询</Button>
</div>
```

不推荐：

```tsx
<div className='[--invalid-space:1rem]'>
  <Input />
  <Button>查询</Button>
</div>
```

## 颜色使用

优先使用语义 token：

| 场景 | 推荐 |
| --- | --- |
| 页面背景 | `bg-background` |
| 正文 | `text-foreground` |
| 次级文本 | `text-muted-foreground` |
| 卡片 | `bg-card text-card-foreground` |
| 边框 | `border-border` 或 `border` |
| 主按钮/强调操作 | `bg-primary text-primary-foreground` 或 `Button` 默认 variant |
| 次级区域 | `bg-secondary text-secondary-foreground` |
| 悬浮/选中背景 | `bg-accent text-accent-foreground` |
| 危险操作 | `text-destructive` 或 `Button variant='destructive'` |
| 侧边栏 | `bg-sidebar text-sidebar-foreground` |

避免：

- 在业务组件里硬编码 `bg-blue-*`、`text-gray-*`、`border-slate-*`。
- 为单个状态写散落的 `dark:*` 覆盖。
- 使用硬编码白色背景表示卡片背景，优先使用 `bg-card` 或 `Card`。
- 使用 `text-gray-*` 表示辅助文本，优先使用 `text-muted-foreground`。


## 修改流程

新增或调整样式时按以下顺序判断：

1. 是否已有 shadcn/ui 组件或组件 variant 能满足。
2. 是否能通过现有语义 token 和 Tailwind 工具类组合完成。
3. 是否需要为全局语义新增 `:root` token 和 `@theme inline` 映射。
4. 是否需要新增跨模块复用的 `@utility`。
5. 只有组件私有且不可复用的样式，才放在组件 `className` 中局部处理。

修改 `src/styles/index.css` 或 `src/styles/theme.css` 后，至少运行：

```bash
npx prettier --check src/styles/index.css src/styles/theme.css
npm run typecheck
```

## 约束

- 全局主题变量只在 `src/styles/theme.css` 定义。
- 全局 base、utility 和 keyframes 只在 `src/styles/index.css` 定义。
- 业务页面优先使用 `Page`、`Main`、`Card`、`Button` 等组件组织视觉结构。
- 颜色、边框、文字和状态样式优先使用语义 token。
- 条件 className 使用 `cn()`。
- 不新增 `tailwind.config.ts` 来维护主题。
- 不在模块内创建新的全局 CSS 入口。
