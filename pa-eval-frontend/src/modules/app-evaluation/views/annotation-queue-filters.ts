import type {
  DataTableFilterBinding,
  DataTableToolbarFilter,
} from '@/components/common/data-table'

export const queueUrlFilters: DataTableFilterBinding[] = [
  { fieldId: 'assigneeIds', columnId: 'assignees', type: 'array' },
  { fieldId: 'pendingState', columnId: 'pendingCount', type: 'array' },
]

export const queueToolbarFilters: DataTableToolbarFilter[] = [
  {
    columnId: 'pendingCount',
    title: '处理状态',
    options: [
      { label: '包含待处理', value: 'hasPending' },
      { label: '全部完成', value: 'completed' },
    ],
  },
  {
    columnId: 'assignees',
    title: '处理人',
    options: [],
  },
]

export function buildQueueToolbarFilters(
  users: { id: string; name: string; email: string }[]
): DataTableToolbarFilter[] {
  return [
    queueToolbarFilters[0],
    {
      columnId: 'assignees',
      title: '处理人',
      options: users.map((user) => ({
        label: user.name || user.email || user.id,
        value: user.id,
      })),
    },
  ]
}
