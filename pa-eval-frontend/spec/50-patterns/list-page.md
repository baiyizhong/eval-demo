# 列表页组合模式

## 适用任务

- 新增标准业务列表页。
- 给已有页面接入服务端分页、筛选、列显隐、批量操作。
- 将零散列表 UI 收敛到 `DataTable` 体系。

## 相关源码

- `src/components/common/page.tsx`
- `src/components/common/page-action.tsx`
- `src/components/common/page-nav.tsx`
- `src/components/common/data-table/*`
- `src/components/common/filter-panel.tsx`

## 必读前置

- `spec/20-architecture/modules.md`
- `spec/30-ui/page-layout.md`
- `spec/40-components/common/data-table.md`
- `spec/40-components/common/filter-panel.md`

## 核心规则

- `SidebarLayout` 下列表页默认使用 `Page`，`TopbarLayout` 下直接使用 `Main`。
- 页面顶部操作区优先使用 `PageAction`；需要局部 tab 或返回按钮加二级导航时使用 `PageNav`。
- 表格主体使用 `DataTable` 和 `DataTableProvider`，业务列、筛选项、行操作、权限判断留在模块内。
- 筛选数据由页面或 URL 状态管理，`FilterPanel` 只负责展示和回传受控值。
- 接口返回结构不一致时，通过 `request.selectRows` 和 `request.selectTotal` 适配。

## 推荐示例

```tsx
import { Page } from '@/components/common/page'
import { PageAction } from '@/components/common/page-action'
import { DataTable } from '@/components/common/data-table'

export function ModuleListPage() {
  return (
    <Page fixed fluid>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <PageAction buttonGroups={{ buttons: [] }} />
        <section className='min-w-0 rounded-lg border bg-card p-4 text-card-foreground'>
          <DataTable columns={columns} request={request} />
        </section>
      </div>
    </Page>
  )
}
```

## 禁止事项

- 不要在 `DataTable` 内写业务接口兼容逻辑。
- 不要把业务列定义放到 `src/components/common/data-table`。
- 不要用自定义 `<table>` 重做已有表格能力。
- 不要在正向示例中使用硬编码白色背景或 space 间距工具。

## 检查清单

- 路由布局和页面容器选择正确。
- 表格外层支持 `min-w-0` 和必要滚动。
- URL 状态、分页、筛选和接口参数映射一致。
- 业务操作按钮已按权限控制。
- 涉及代码变更时运行 `npm run typecheck` 和 `npm run lint`。
