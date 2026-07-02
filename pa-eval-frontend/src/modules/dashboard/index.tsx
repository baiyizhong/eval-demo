import { useMemo } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import {
  DataTable,
  DataTableProvider,
  type DataTableListResponse,
  type DataTableQueryState,
} from '@/components/common/data-table'
import { type FilterGroup } from '@/components/common/filter-panel'
import { Page } from '@/components/common/page'
import { PageAction } from '@/components/common/page-action'
import { DataTableBulkActions } from './components/data-table-bulk-actions'
import { tasksColumns } from './components/tasks-columns'
import { priorities, statuses } from './data/data'
import { type Task, type TaskDialogType } from './data/schema'
import { tasks } from './data/tasks'

type DashboardTableContext = {
  permissions: {
    update: boolean
    delete: boolean
  }
}

export function Dashboard() {
  const filterGroups = useMemo<FilterGroup[]>(
    () => [
      {
        id: 'tasks',
        label: '任务筛选',
        defaultOpen: true,
        fields: [
          {
            id: 'filter',
            label: '关键词',
            type: 'input',
            placeholder: '输入标题或 ID',
          },
          {
            id: 'status',
            label: '状态',
            type: 'checkbox',
            options: statuses.map(({ label, value }) => ({ label, value })),
          },
          {
            id: 'priority',
            label: '优先级',
            type: 'tags',
            options: priorities.map(({ label, value }) => ({ label, value })),
          },
        ],
      },
    ],
    []
  )

  return (
    <Page>
      <div className='flex flex-col gap-4'>
        <PageAction
          showBackButton
          buttonGroups={{
            buttons: [
              {
                id: 'refresh',
                label: '刷新',
                icon: RefreshCw,
                iconPosition: 'start',
                variant: 'outline',
                size: 'sm',
                onClick: () => toast.info('已刷新仪表盘数据'),
              },
              {
                id: 'export',
                label: '导出',
                icon: Download,
                iconPosition: 'start',
                size: 'sm',
                onClick: () => toast.info('已导出仪表盘报表'),
              },
            ],
          }}
        >
          <div className='flex flex-wrap items-center gap-2'>
            <Input
              className='w-64'
              placeholder='搜索指标、报表或负责人'
              aria-label='搜索仪表盘内容'
            />
          </div>
        </PageAction>
        <section className='min-w-0 border bg-white p-4'>
          <DataTableProvider<Task, TaskDialogType, DashboardTableContext>
            context={{
              permissions: {
                update: true,
                delete: true,
              },
            }}
          >
            <DataTable<Task, DataTableListResponse<Task>, TaskDialogType>
              columns={tasksColumns}
              request={{
                queryKey: (state) => ['dashboard-tasks', state],
                queryFn: getDashboardTasks,
              }}
              filterPanel={{
                groups: filterGroups,
              }}
              urlState={{
                globalFilterKey: 'filter',
                pageKey: 'page',
                pageSizeKey: 'pageSize',
                filters: [
                  { fieldId: 'status', type: 'array' },
                  { fieldId: 'priority', type: 'array' },
                ],
              }}
              toolbar={{
                searchPlaceholder: '按标题或 ID 筛选...',
                filters: [
                  {
                    columnId: 'status',
                    title: '状态',
                    options: statuses,
                  },
                  {
                    columnId: 'priority',
                    title: '优先级',
                    options: priorities,
                  },
                ],
                columnLabels: {
                  id: '任务',
                  title: '标题',
                  status: '状态',
                  priority: '优先级',
                },
              }}
              bulkActions={(table) => <DataTableBulkActions table={table} />}
            />
          </DataTableProvider>
        </section>
      </div>
    </Page>
  )
}

async function getDashboardTasks(
  state: DataTableQueryState
): Promise<DataTableListResponse<Task>> {
  const filteredTasks = filterDashboardTasks(tasks, state)
  const sortedTasks = sortDashboardTasks(filteredTasks, state)
  const start = (state.page - 1) * state.pageSize
  const end = start + state.pageSize

  return {
    total: sortedTasks.length,
    datas: sortedTasks.slice(start, end),
  }
}

function filterDashboardTasks(
  source: Task[],
  { filters, keyword }: DataTableQueryState
) {
  const normalizedKeyword = keyword.trim().toLowerCase()
  const statusValues = toStringArray(filters.status)
  const priorityValues = toStringArray(filters.priority)

  return source.filter((task) => {
    const matchesKeyword =
      !normalizedKeyword ||
      task.id.toLowerCase().includes(normalizedKeyword) ||
      task.title.toLowerCase().includes(normalizedKeyword)
    const matchesStatus =
      statusValues.length === 0 || statusValues.includes(task.status)
    const matchesPriority =
      priorityValues.length === 0 || priorityValues.includes(task.priority)

    return matchesKeyword && matchesStatus && matchesPriority
  })
}

function sortDashboardTasks(source: Task[], { sorting }: DataTableQueryState) {
  if (sorting.length === 0) {
    return source
  }

  return [...source].sort((firstTask, secondTask) => {
    for (const sort of sorting) {
      const firstValue = String(firstTask[sort.id as keyof Task] ?? '')
      const secondValue = String(secondTask[sort.id as keyof Task] ?? '')
      const comparison = firstValue.localeCompare(secondValue, 'zh-Hans-CN')

      if (comparison !== 0) {
        return sort.desc ? -comparison : comparison
      }
    }

    return 0
  })
}

function toStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}
