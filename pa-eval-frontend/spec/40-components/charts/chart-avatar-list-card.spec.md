# ChartAvatarListCard 组件使用规范

## 组件职责

`ChartAvatarListCard` 是一个通用的报表卡片组件，用于展示“头像标识 + 主信息 + 辅助信息 + 右侧值”的列表型明细。

组件只负责卡片结构和列表布局，不内置业务数据，不绑定销售、用户、操作记录等具体业务场景。所有标题、描述和列表项必须由调用方传入。

适用场景：

- 最近销售、最近订单、最近成交
- 最近用户、活跃用户、负责人列表
- 操作记录、审批记录、排行明细
- 需要在报表区域展示头像或缩写标识的简短列表

不适用场景：

- 需要分页、筛选、排序的表格数据
- 需要复杂交互的时间线
- 无头像或标识需求的纯文本列表

## 导入方式

```tsx
import {
  ChartAvatarListCard,
  type ChartAvatarListCardItem,
} from '@/components/common/charts'
```

## 类型说明

```tsx
type ChartAvatarListCardItem = {
  id?: React.Key
  title: ReactNode
  description?: ReactNode
  value?: ReactNode
  avatarSrc?: string
  avatarAlt?: string
  avatarFallback: ReactNode
  avatarClassName?: string
}

type ChartAvatarListCardProps = Omit<ComponentProps<typeof Card>, 'title'> & {
  title: ReactNode
  description?: ReactNode
  items: ChartAvatarListCardItem[]
  contentClassName?: string
  listClassName?: string
}
```

## Props 契约

关键规则：

- `title` 必填，用于渲染 `CardTitle`。
- `items` 必填，组件按数组顺序渲染列表项。
- `items[].title` 必填，用于列表项主信息。
- `items[].avatarFallback` 必填，用于头像图片缺失或加载失败时的 fallback。
- `description` 为空时不渲染 `CardDescription`。
- `items[].description` 为空时不渲染辅助信息。
- `items[].value` 为空时不渲染右侧值。
- `className` 透传给外层 `Card`，用于控制网格跨度等布局。
- `contentClassName` 透传给 `CardContent`。
- `listClassName` 用于覆盖列表容器间距，默认列表间距为 `space-y-8`。
- 除 `title` 外，组件支持透传 `Card` 的其它 props。

## 推荐用法

调用方负责维护业务数据，组件只消费参数：

```tsx
const recentSalesItems: ChartAvatarListCardItem[] = [
  {
    id: 'olivia-martin',
    avatarSrc: '/avatars/01.png',
    avatarAlt: 'Olivia Martin',
    avatarFallback: 'OM',
    title: 'Olivia Martin',
    description: 'olivia.martin@email.com',
    value: '+$1,999.00',
  },
  {
    id: 'jackson-lee',
    avatarSrc: '/avatars/02.png',
    avatarAlt: 'Jackson Lee',
    avatarFallback: 'JL',
    title: 'Jackson Lee',
    description: 'jackson.lee@email.com',
    value: '+$39.00',
  },
]

<ChartAvatarListCard
  className='col-span-1 lg:col-span-3'
  title='Recent Sales'
  description='You made 265 sales this month.'
  items={recentSalesItems}
/>
```

## 布局约定

组件内部固定使用 shadcn `Card` 组合：

- `Card`
- `CardHeader`
- `CardTitle`
- `CardDescription`
- `CardContent`
- `ChartAvatarItem`

默认列表容器为：

```tsx
<div className={cn('space-y-8', listClassName)} />
```

单行列表项由 `ChartAvatarItem` 控制，默认结构为：

- 根节点：`flex items-center gap-4`
- 头像：`size-9`
- 文本和值区域：`flex flex-1 flex-wrap items-center justify-between`
- 主信息：`text-sm leading-none font-medium`
- 辅助信息：`text-muted-foreground text-sm`
- 右侧值：`font-medium`

如需调整头像边框或对齐方式，优先通过 `items[].avatarClassName` 传入。

## 数据建模规则

推荐每条数据提供稳定 `id`：

```tsx
{
  id: user.id,
  avatarSrc: user.avatarUrl,
  avatarAlt: user.name,
  avatarFallback: user.initials,
  title: user.name,
  description: user.email,
  value: formatCurrency(user.amount),
}
```

如果没有稳定业务 id，组件会退回使用数组下标作为 key。只读静态列表可以接受这种方式；可新增、删除、重排的动态列表必须提供稳定 `id`。

`avatarAlt` 应使用可识别的人名、组织名或实体名。不要长期使用 `"Avatar"` 作为真实业务数据的 alt 文本。

## 修改约束

大模型或开发者修改该组件时必须遵守：

- 不要在该组件中请求接口、读取 store、读取路由参数或处理业务权限。
- 不要新增销售专用 props，例如 `sales`、`amount`、`customerName`。
- 不要把 `items` 改为固定字段之外的业务模型；调用方应在模块内完成业务模型到 `ChartAvatarListCardItem` 的映射。
- 不要在组件内新增分页、筛选、排序等复杂表格能力；这些需求应使用 Table 或单独业务组件。
- 保持组件通过 `@/components/common/charts` 统一导出，业务模块不要直接依赖组件内部相对路径。

## 验证要求

修改组件或接入新业务场景后至少执行：

```bash
npm run typecheck
npm run lint
```
