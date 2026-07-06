import type {
  DataTableFilterBinding,
  DataTableToolbarFilter,
} from '@/components/common/data-table'

export const reportUrlFilters: DataTableFilterBinding[] = [
  { fieldId: 'sourceType', type: 'array' },
  { fieldId: 'status', type: 'array' },
  { fieldId: 'hasBadcase', columnId: 'badcaseCount', type: 'array' },
]

export const reportToolbarFilters: DataTableToolbarFilter[] = [
  {
    columnId: 'sourceType',
    title: '来源类型',
    options: [
      { label: '自动评测', value: 'AUTO_EVAL' },
      { label: '人工标注', value: 'MANUAL_ANNOTATION' },
    ],
  },
  {
    columnId: 'status',
    title: '报告状态',
    options: [
      { label: '生成中', value: 'GENERATING' },
      { label: '已生成', value: 'READY' },
      { label: '生成失败', value: 'FAILED' },
    ],
  },
  {
    columnId: 'badcaseCount',
    title: 'Badcase',
    options: [
      { label: '存在 badcase', value: 'true' },
      { label: '无 badcase', value: 'false' },
    ],
  },
]
