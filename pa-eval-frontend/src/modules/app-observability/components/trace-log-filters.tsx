import { Circle, CircleCheck, CircleHelp, CircleX, Tags } from 'lucide-react'
import type {
  DataTableFilterBinding,
  DataTableToolbarFilter,
} from '@/components/common/data-table'
import type { FilterGroup } from '@/components/common/filter-panel'

export const traceLogUrlFilters: DataTableFilterBinding[] = [
  { fieldId: 'createdAtRange', type: 'array' },
  { fieldId: 'environment', type: 'array', columnId: 'environment' },
  { fieldId: 'status', type: 'array', columnId: 'status' },
  { fieldId: 'tags', type: 'array' },
  { fieldId: 'latencyMin', type: 'string' },
  { fieldId: 'latencyMax', type: 'string' },
  { fieldId: 'sessionId', type: 'string' },
  { fieldId: 'userId', type: 'string' },
  { fieldId: 'businessId', type: 'string' },
  { fieldId: 'metadataKey', type: 'string' },
  { fieldId: 'metadataValue', type: 'string' },
]

export const traceLogToolbarFilters: DataTableToolbarFilter[] = [
  {
    columnId: 'environment',
    title: '环境',
    options: [
      { label: 'default', value: 'default' },
      { label: 'production', value: 'production' },
      { label: 'staging', value: 'staging' },
      { label: 'testing', value: 'testing' },
    ],
  },
  {
    columnId: 'status',
    title: '状态',
    options: [
      { label: '成功', value: 'success', icon: CircleCheck },
      { label: '失败', value: 'failed', icon: CircleX },
      { label: '运行中', value: 'running', icon: Circle },
      { label: '未知', value: 'unknown', icon: CircleHelp },
    ],
  },
]

export const traceLogFilterGroups: FilterGroup[] = [
  {
    id: 'basic',
    label: '普通筛选',
    defaultOpen: true,
    fields: [
      {
        id: 'createdAtRange',
        type: 'dateRange',
        label: '时间范围',
        showTime: true,
        placeholder: '选择 Trace 创建时间范围',
      },
      {
        id: 'sessionId',
        type: 'input',
        label: 'Session ID',
        placeholder: '输入 Session ID',
      },
    ],
  },
  {
    id: 'advanced',
    label: '高级筛选',
    icon: <Tags className='size-4' />,
    fields: [
      {
        id: 'latencyMin',
        type: 'input',
        label: '最小延迟 ms',
        placeholder: '例如 1000',
      },
      {
        id: 'latencyMax',
        type: 'input',
        label: '最大延迟 ms',
        placeholder: '例如 5000',
      },
      {
        id: 'userId',
        type: 'input',
        label: '用户标识',
        placeholder: '输入 userId',
      },
      {
        id: 'businessId',
        type: 'input',
        label: '业务标识',
        placeholder: '输入 businessId',
      },
      {
        id: 'metadataKey',
        type: 'input',
        label: 'metadata key',
        placeholder: '例如 businessId',
      },
      {
        id: 'metadataValue',
        type: 'input',
        label: 'metadata value',
        placeholder: '可为空',
      },
    ],
  },
]
