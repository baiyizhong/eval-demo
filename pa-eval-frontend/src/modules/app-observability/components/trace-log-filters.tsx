import { Circle, CircleCheck, CircleHelp, CircleX, Plus, Tags, Trash2 } from 'lucide-react'
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
import type { TraceMetadataFilter } from '../types'

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
  { fieldId: 'metadataFilters', type: 'json' },
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
        <div key={index} className='grid grid-cols-[1fr_120px_1fr_auto] gap-2'>
          <Input
            value={filter.key}
            onChange={(event) => updateFilter(index, { key: event.target.value })}
            placeholder='key'
          />
          <Select
            value={filter.operator}
            onValueChange={(operator) =>
              updateFilter(index, {
                operator: operator as TraceMetadataFilter['operator'],
              })
            }
          >
            <SelectTrigger>
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
          <Button
            type='button'
            variant='ghost'
            size='icon'
            onClick={() =>
              onChange(filters.filter((_, currentIndex) => currentIndex !== index))
            }
          >
            <Trash2 className='size-4' />
            <span className='sr-only'>删除 Metadata 条件</span>
          </Button>
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
