# ChartBarListCard 组件使用规范

## 组件职责

`ChartBarListCard` 是一个通用的报表横向条形列表卡片，用于展示“名称 + 相对进度条 + 右侧数值”的排行或占比类明细。

组件只负责卡片结构、列表布局和条形宽度计算，不内置业务数据，不绑定来源、设备、渠道、分类等具体业务场景。所有标题、描述、列表项和数值格式化逻辑必须由调用方传入。

适用场景：

- 来源排行、渠道排行、分类排行
- 设备占比、地域占比、流量构成
- Top N 指标列表
- 需要用横向进度条表达相对大小的简短报表

不适用场景：

- 需要精确坐标轴、tooltip 或图例的正式图表
- 需要分页、筛选、排序的表格数据
- 需要堆叠条形、分组条形或多指标对比的复杂图表

## 导入方式

```tsx
import {
  ChartBarListCard,
  type ChartBarListCardItem,
} from '@/components/common/charts'
```

## 类型说明

```tsx
type ChartBarListCardItem = {
  id?: React.Key
  name: ReactNode
  value: number
}

type ChartBarListCardProps = Omit<ComponentProps<typeof Card>, 'title'> & {
  title: ReactNode
  description?: ReactNode
  items: ChartBarListCardItem[]
  barClass?: string
  valueFormatter?: (value: number) => ReactNode
  contentClassName?: string
  listClassName?: string
}
```

## Props 契约

关键规则：

- `title` 必填，用于渲染 `CardTitle`。
- `items` 必填，组件按数组顺序渲染列表项。
- `items[].name` 必填，用于左侧名称。
- `items[].value` 必填，必须是 number，用于计算条形宽度和右侧显示值。
- `description` 为空时不渲染 `CardDescription`。
- `barClass` 用于控制条形颜色，默认值为 `bg-primary`。
- `valueFormatter` 用于格式化右侧值，默认渲染为 `${value}`。
- `className` 透传给外层 `Card`，用于控制网格跨度等布局。
- `contentClassName` 透传给 `CardContent`。
- `listClassName` 用于覆盖列表容器间距，默认列表间距为 `space-y-3`。
- 除 `title` 外，组件支持透传 `Card` 的其它 props。

## 推荐用法

调用方负责维护业务数据，组件只消费参数：

```tsx
const referrerItems: ChartBarListCardItem[] = [
  { id: 'direct', name: 'Direct', value: 512 },
  { id: 'product-hunt', name: 'Product Hunt', value: 238 },
  { id: 'twitter', name: 'Twitter', value: 174 },
  { id: 'blog', name: 'Blog', value: 104 },
]

<ChartBarListCard
  className='col-span-1 lg:col-span-4'
  title='Referrers'
  description='Top sources driving traffic'
  items={referrerItems}
  barClass='bg-primary'
  valueFormatter={(value) => `${value}`}
/>
```

百分比类数据示例：

```tsx
const deviceItems: ChartBarListCardItem[] = [
  { id: 'desktop', name: 'Desktop', value: 74 },
  { id: 'mobile', name: 'Mobile', value: 22 },
  { id: 'tablet', name: 'Tablet', value: 4 },
]

<ChartBarListCard
  title='Devices'
  description='How users access your app'
  items={deviceItems}
  barClass='bg-muted-foreground'
  valueFormatter={(value) => `${value}%`}
/>
```

## 布局和计算约定

组件内部固定使用 shadcn `Card` 组合：

- `Card`
- `CardHeader`
- `CardTitle`
- `CardDescription`
- `CardContent`

列表容器默认结构为：

```tsx
<ul className={cn('space-y-3', listClassName)} />
```

每一行默认结构为：

- 行容器：`flex items-center justify-between gap-3`
- 名称：`text-muted-foreground mb-1 truncate text-xs`
- 背景轨道：`bg-muted h-2.5 w-full rounded-full`
- 条形：`h-2.5 rounded-full`
- 右侧值：`ps-2 text-xs font-medium tabular-nums`

条形宽度按当前列表最大值归一化计算：

```tsx
const max = Math.max(...items.map((item) => item.value), 1)
const width = `${Math.round((item.value / max) * 100)}%`
```

这表示最大值永远显示为 `100%` 宽度，其他项按相对比例显示。

## 数据建模规则

推荐每条数据提供稳定 `id`：

```tsx
{
  id: source.code,
  name: source.label,
  value: source.count,
}
```

如果没有稳定业务 id，组件会退回使用数组下标作为 key。只读静态列表可以接受这种方式；可新增、删除、重排的动态列表必须提供稳定 `id`。

`value` 应传入非负数。组件不会在内部做业务校验，负数、NaN 或非业务含义的数据应由调用方在传入前处理。

## 修改约束

大模型或开发者修改该组件时必须遵守：

- 不要把业务数据直接写入 `chart-bar-list-card.tsx`。
- 不要在该组件中请求接口、读取 store、读取路由参数或处理业务权限。
- 不要新增来源、设备、渠道等业务专用 props，例如 `sources`、`devices`、`trafficType`。
- 不要把 `items` 改为固定字段之外的业务模型；调用方应在模块内完成业务模型到 `ChartBarListCardItem` 的映射。
- 不要在组件内新增分页、筛选、排序、tooltip、图例等复杂图表能力；这些需求应拆成新的通用组件或使用 Recharts。
- 保持组件通过 `@/components/common/charts` 统一导出，业务模块不要直接依赖组件内部相对路径。

## 验证要求

修改组件或接入新业务场景后至少执行：

```bash
npm run typecheck
npm run lint
```
