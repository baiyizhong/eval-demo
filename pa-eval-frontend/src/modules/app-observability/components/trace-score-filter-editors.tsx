import { Plus, Trash2 } from 'lucide-react'
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
  TraceCategoricalScoreFilter,
  TraceNumericScoreFilter,
} from '../types'

export function CategoricalScoreFilterEditor({
  value,
  onChange,
}: {
  value: unknown
  onChange: (nextValue: TraceCategoricalScoreFilter[]) => void
}) {
  const filters = Array.isArray(value)
    ? (value as TraceCategoricalScoreFilter[])
    : []
  const updateFilter = (
    index: number,
    patch: Partial<TraceCategoricalScoreFilter>
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
              value={filter.name}
              onChange={(event) =>
                updateFilter(index, { name: event.target.value })
              }
              placeholder='score name'
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
                  operator:
                    operator as TraceCategoricalScoreFilter['operator'],
                })
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='equals'>等于</SelectItem>
                <SelectItem value='contains'>包含</SelectItem>
                <SelectItem value='exists'>存在</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={filter.value ?? ''}
              disabled={filter.operator === 'exists'}
              onChange={(event) =>
                updateFilter(index, { value: event.target.value })
              }
              placeholder='string value'
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
            { name: '', operator: 'equals', value: '' },
          ])
        }
      >
        <Plus data-icon='inline-start' />
        添加 Categorical Score 条件
      </Button>
    </div>
  )
}

export function NumericScoreFilterEditor({
  value,
  onChange,
}: {
  value: unknown
  onChange: (nextValue: TraceNumericScoreFilter[]) => void
}) {
  const filters = Array.isArray(value) ? (value as TraceNumericScoreFilter[]) : []
  const updateFilter = (
    index: number,
    patch: Partial<TraceNumericScoreFilter>
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
              value={filter.name}
              onChange={(event) =>
                updateFilter(index, { name: event.target.value })
              }
              placeholder='score name'
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
                  operator: operator as TraceNumericScoreFilter['operator'],
                })
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='eq'>=</SelectItem>
                <SelectItem value='gte'>≥</SelectItem>
                <SelectItem value='lte'>≤</SelectItem>
                <SelectItem value='gt'>＞</SelectItem>
                <SelectItem value='lt'>＜</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={filter.value ?? ''}
              inputMode='decimal'
              onChange={(event) =>
                updateFilter(index, { value: event.target.value })
              }
              placeholder='number value'
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
            { name: '', operator: 'eq', value: '' },
          ])
        }
      >
        <Plus data-icon='inline-start' />
        添加 Numeric Score 条件
      </Button>
    </div>
  )
}
