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
    options: [
      { label: '张三', value: 'user_annotator_a' },
      { label: '李四', value: 'user_annotator_b' },
    ],
  },
]
