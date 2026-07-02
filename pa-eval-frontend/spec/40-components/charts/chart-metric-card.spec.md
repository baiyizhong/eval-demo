# ChartMetricCard 组件使用规范

## 组件职责

`ChartMetricCard` 是一个通用的报表指标卡组件，用于展示“指标标题 + 右上角图标 + 主数值 + 辅助说明”的轻量 KPI 信息。

组件只负责卡片结构和指标展示布局，不内置业务数据，不绑定收入、销售、用户、订单等具体业务场景。所有标题、数值、说明和图标必须由调用方传入。

适用场景：

- 总收入、订单量、销售额、活跃人数等 KPI 指标
- 报表顶部的概览卡片
- 仪表盘中单个核心数值的摘要展示
- 需要一个可选右上角图标的简短指标块

不适用场景：

- 需要展示趋势折线、柱状图或面积图的图表
- 需要多行明细列表的报表块
- 需要复杂交互、筛选或下钻的指标面板

## 导入方式

```tsx
import { ChartMetricCard } from '@/components/common/charts'
```

## 类型说明

```tsx
type ChartMetricCardProps = Omit<ComponentProps<typeof Card>, 'title'> & {
  title: ReactNode
  value: ReactNode
  description?: ReactNode
  icon?: ReactNode
  headerClassName?: string
  contentClassName?: string
  titleClassName?: string
  valueClassName?: string
  descriptionClassName?: string
}
```

## Props 契约

关键规则：

- `title` 必填，用于渲染 `CardTitle`。
- `value` 必填，用于渲染主指标值。
- `description` 为空时不渲染辅助说明。
- `icon` 为空时不渲染右上角图标区域。
- `className` 透传给外层 `Card`，用于控制网格跨度等布局。
- `headerClassName` 透传给 `CardHeader`，默认包含 `flex flex-row items-center justify-between space-y-0 pb-2`。
- `contentClassName` 透传给 `CardContent`。
- `titleClassName` 追加到标题，默认标题样式为 `text-sm font-medium`。
- `valueClassName` 追加到主指标值，默认主指标样式为 `text-2xl font-bold`。
- `descriptionClassName` 追加到辅助说明，默认说明样式为 `text-muted-foreground text-xs`。
- 除 `title` 外，组件支持透传 `Card` 的其它 props。

## 推荐用法

调用方负责维护业务数据和图标，组件只消费参数：

```tsx
<ChartMetricCard
  title='Total Revenue'
  value='$45,231.89'
  description='+20.1% from last month'
  icon={
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth='2'
      className='text-muted-foreground h-4 w-4'
    >
      <path d='M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' />
    </svg>
  }
/>
```

如果使用 lucide 图标，调用方仍然负责传入已渲染的 icon：

```tsx
import { Users } from 'lucide-react'

<ChartMetricCard
  title='Active Users'
  value='12,340'
  description='+8.2% from last week'
  icon={<Users className='text-muted-foreground h-4 w-4' />}
/>
```

## 布局约定

组件内部固定使用 shadcn `Card` 组合：

- `Card`
- `CardHeader`
- `CardTitle`
- `CardContent`

默认头部结构为：

```tsx
<CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
  <CardTitle className='text-sm font-medium'>{title}</CardTitle>
  {icon}
</CardHeader>
```

默认内容结构为：

```tsx
<CardContent>
  <div className='text-2xl font-bold'>{value}</div>
  <p className='text-muted-foreground text-xs'>{description}</p>
</CardContent>
```

`description` 为空时，`p` 节点不会渲染。

## 数据建模规则

推荐调用方先把业务数据格式化为展示值，再传给组件：

```tsx
{
  title: 'Total Revenue',
  value: formatCurrency(totalRevenue),
  description: `${growthRate}% from last month`,
}
```

`value` 和 `description` 可以是字符串，也可以是带样式的 `ReactNode`。如果需要表达上涨、下降、异常状态，优先在调用方完成文案和样式控制，不要把业务判断写入组件内部。

## 修改约束

大模型或开发者修改该组件时必须遵守：

- 不要把 Total Revenue、金额、增长率等业务数据直接写入 `chart-metric-card.tsx`。
- 不要在该组件中请求接口、读取 store、读取路由参数或处理业务权限。
- 不要新增收入、订单、用户等业务专用 props，例如 `revenue`、`orderCount`、`growthRate`。
- 不要把 `icon` 改为字符串枚举或内置图标映射；调用方应传入 `ReactNode`。
- 不要在组件内新增趋势图、列表、筛选、弹窗等复杂能力；这些需求应拆成新的通用组件或业务组件。
- 保持组件通过 `@/components/common/charts` 统一导出，业务模块不要直接依赖组件内部相对路径。

## 验证要求

修改组件或接入新业务场景后至少执行：

```bash
npm run typecheck
npm run lint
```
