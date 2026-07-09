import { Circle, CircleCheck, CircleHelp, CircleX, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  DataTableFilterBinding,
  DataTableToolbarFilter,
} from '@/components/common/data-table'
import type { FilterGroup } from '@/components/common/filter-panel'
import {
  getTraceQuickTimeRangeToolbarDefault,
  TRACE_QUICK_TIME_RANGE_OPTIONS,
} from '../trace-time-ranges'
import type { TraceMetadataFilter } from '../types'

export const traceLogUrlFilters: DataTableFilterBinding[] = [
  { fieldId: 'timeRange', type: 'string' },
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
  { fieldId: 'metadataFilters', type: 'json' },
]

export const traceLogToolbarFilters: DataTableToolbarFilter[] = [
  {
    fieldId: 'timeRange',
    title: '时间',
    selectionMode: 'single',
    defaultValue: getTraceQuickTimeRangeToolbarDefault,
    options: TRACE_QUICK_TIME_RANGE_OPTIONS,
  },
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
    id: 'trace',
    label: '筛选条件',
    defaultOpen: true,
    fields: [
      {
        id: 'metadataFilters',
        type: 'custom',
        label: 'Metadata',
        render: ({ value, setValue }) => (
          <MetadataFilterEditor
            value={value}
            onChange={(nextValue) => setValue(nextValue, 'metadataFilters')}
          />
        ),
      },
      {
        id: 'createdAtRange',
        type: 'dateRange',
        label: '自定义时间范围',
        showTime: true,
        placeholder: '选择 Trace 创建时间范围',
      },
      {
        id: 'sessionId',
        type: 'input',
        label: 'Session ID',
        placeholder: '输入 Session ID',
      },
      {
        id: 'businessId',
        type: 'input',
        label: '业务标识',
        placeholder: '输入 businessId',
      },
      {
        id: 'userId',
        type: 'input',
        label: '用户标识',
        placeholder: '输入 userId',
      },
      // {
      //   id: 'latencyMin',
      //   type: 'input',
      //   label: '最小延迟 ms',
      //   placeholder: '例如 1000',
      // },
      // {
      //   id: 'latencyMax',
      //   type: 'input',
      //   label: '最大延迟 ms',
      //   placeholder: '例如 5000',
      // },
    ],
  },
]

function MetadataFilterEditor({
  value,
  onChange,
}: {
  value: unknown
  onChange: (nextValue: TraceMetadataFilter[]) => void
}) {
  const filters = Array.isArray(value)
    ? (value as TraceMetadataFilter[])
    : []
  const updateFilter = (
    index: number,
    patch: Partial<TraceMetadataFilter>
  ) => {
    onChange(
      filters.map((filter, currentIndex) =>
        currentIndex === index ? { ...filter, ...patch } : filter
      )
    )
  }

  return (
    <div className='flex flex-col gap-2'>
      {filters.map((filter, index) => (
        <div key={index} className='flex flex-col gap-2 rounded-md border p-2'>
          <div className='grid grid-cols-[minmax(0,1fr)_auto] gap-2'>
            <Input
              value={filter.key}
              onChange={(event) =>
                updateFilter(index, { key: event.target.value })
              }
              placeholder='key'
            />
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() =>
                onChange(
                  filters.filter((_, currentIndex) => currentIndex !== index)
                )
              }
            >
              <Trash2 data-icon='inline-start' />
              删除
            </Button>
          </div>
          <div className='grid grid-cols-[72px_minmax(0,1fr)] gap-2'>
            <Select
              value={filter.operator}
              onValueChange={(operator) =>
                updateFilter(index, {
                  operator: operator as TraceMetadataFilter['operator'],
                })
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='contains'>包含</SelectItem>
                <SelectItem value='equals'>等于</SelectItem>
                <SelectItem value='exists'>存在</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={filter.value ?? ''}
              disabled={filter.operator === 'exists'}
              onChange={(event) =>
                updateFilter(index, { value: event.target.value })
              }
              placeholder='value'
            />
          </div>
        </div>
      ))}
      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={() =>
          onChange([
            ...filters,
            { key: '', operator: 'contains', value: '' },
          ])
        }
      >
        <Plus data-icon='inline-start' />
        添加 Metadata 条件
      </Button>
    </div>
  )
}
