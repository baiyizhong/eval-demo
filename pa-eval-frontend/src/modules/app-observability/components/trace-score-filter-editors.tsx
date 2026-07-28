import { useState, type InputHTMLAttributes } from 'react'
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
  TraceScoreConfigOption,
} from '../types'

export function CategoricalScoreFilterEditor({
  value,
  scoreConfigs = [],
  onChange,
}: {
  value: unknown
  scoreConfigs?: TraceScoreConfigOption[]
  onChange: (nextValue: TraceCategoricalScoreFilter[]) => void
}) {
  const filters = Array.isArray(value)
    ? (value as TraceCategoricalScoreFilter[])
    : []
  const categoricalScoreConfigs = scoreConfigs.filter(
    (config) =>
      !isScoreConfigArchived(config) && config.dataType === 'CATEGORICAL'
  )
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
            <ScoreNameSelect
              value={filter.name}
              scoreConfigs={categoricalScoreConfigs}
              onValueChange={(name) => {
                const selectedConfig = categoricalScoreConfigs.find(
                  (config) => config.name === name
                )
                const categoryLabels =
                  selectedConfig?.categories?.map(
                    (category) => category.label
                  ) ?? []
                const value = categoryLabels.includes(filter.value ?? '')
                  ? filter.value
                  : ''
                updateFilter(index, { name, value })
              }}
              placeholder='选择 score config'
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
                  operator: operator as TraceCategoricalScoreFilter['operator'],
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
            <ScoreCategoryValueSelect
              value={filter.value ?? ''}
              config={categoricalScoreConfigs.find(
                (config) => config.name === filter.name
              )}
              disabled={filter.operator === 'exists'}
              onValueChange={(value) => updateFilter(index, { value })}
              placeholder='选择分类值'
            />
          </div>
        </div>
      ))}
      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={() =>
          onChange([...filters, { name: '', operator: 'equals', value: '' }])
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
  scoreConfigs = [],
  onChange,
}: {
  value: unknown
  scoreConfigs?: TraceScoreConfigOption[]
  onChange: (nextValue: TraceNumericScoreFilter[]) => void
}) {
  const filters = Array.isArray(value)
    ? (value as TraceNumericScoreFilter[])
    : []
  const numericScoreConfigs = scoreConfigs.filter(
    (config) =>
      !isScoreConfigArchived(config) &&
      (config.dataType === 'NUMERIC' || config.dataType === 'BOOLEAN')
  )
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
            <ScoreNameSelect
              value={filter.name}
              scoreConfigs={numericScoreConfigs}
              onValueChange={(name) => {
                const selectedConfig = numericScoreConfigs.find(
                  (config) => config.name === name
                )
                updateFilter(index, {
                  name,
                  value:
                    selectedConfig?.dataType === 'BOOLEAN' &&
                    filter.value !== '0' &&
                    filter.value !== '1'
                      ? ''
                      : filter.value,
                })
              }}
              placeholder='选择 score config'
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
            {numericScoreConfigs.find((config) => config.name === filter.name)
              ?.dataType === 'BOOLEAN' ? (
              <ScoreBooleanValueSelect
                value={filter.value ?? ''}
                onValueChange={(value) => updateFilter(index, { value })}
              />
            ) : (
              <ScoreTextInput
                value={filter.value ?? ''}
                inputMode='decimal'
                onValueChange={(value) => updateFilter(index, { value })}
                placeholder='number value'
              />
            )}
          </div>
        </div>
      ))}
      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={() =>
          onChange([...filters, { name: '', operator: 'eq', value: '' }])
        }
      >
        <Plus data-icon='inline-start' />
        添加 Numeric Score 条件
      </Button>
    </div>
  )
}

function isScoreConfigArchived(config: TraceScoreConfigOption) {
  return Boolean(config.archived ?? config.isArchived)
}

function getScoreConfigSelectOptions(
  scoreConfigs: TraceScoreConfigOption[],
  value: string
) {
  const options = scoreConfigs.filter((config) => config.name.trim())
  if (!value || options.some((config) => config.name === value)) {
    return options
  }
  return [
    ...options,
    {
      id: `current-${value}`,
      name: value,
      dataType: 'TEXT',
    },
  ]
}

function ScoreNameSelect({
  value,
  scoreConfigs,
  onValueChange,
  placeholder,
}: {
  value: string
  scoreConfigs: TraceScoreConfigOption[]
  onValueChange: (value: string) => void
  placeholder: string
}) {
  const options = getScoreConfigSelectOptions(scoreConfigs, value)

  return (
    <Select
      value={value || undefined}
      disabled={options.length === 0}
      onValueChange={onValueChange}
    >
      <SelectTrigger className='w-full'>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((config) => (
          <SelectItem key={config.id} value={config.name}>
            {config.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ScoreCategoryValueSelect({
  value,
  config,
  disabled,
  onValueChange,
  placeholder,
}: {
  value: string
  config?: TraceScoreConfigOption
  disabled?: boolean
  onValueChange: (value: string) => void
  placeholder: string
}) {
  const categoryOptions =
    config?.categories?.filter((category) => category.label.trim()) ?? []
  const options =
    value && !categoryOptions.some((category) => category.label === value)
      ? [...categoryOptions, { label: value, value: Number.NaN }]
      : categoryOptions

  return (
    <Select
      value={value || undefined}
      disabled={disabled || options.length === 0}
      onValueChange={onValueChange}
    >
      <SelectTrigger className='w-full'>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((category) => (
          <SelectItem key={category.label} value={category.label}>
            {category.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ScoreBooleanValueSelect({
  value,
  onValueChange,
}: {
  value: string
  onValueChange: (value: string) => void
}) {
  return (
    <Select value={value || undefined} onValueChange={onValueChange}>
      <SelectTrigger className='w-full'>
        <SelectValue placeholder='选择布尔值' />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value='1'>true</SelectItem>
        <SelectItem value='0'>false</SelectItem>
      </SelectContent>
    </Select>
  )
}

function ScoreTextInput({
  value,
  onValueChange,
  disabled,
  inputMode,
  placeholder,
}: {
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode']
  placeholder?: string
}) {
  const [draftValue, setDraftValue] = useState(value)
  const [isComposing, setIsComposing] = useState(false)
  const inputValue = isComposing ? draftValue : value

  return (
    <Input
      value={inputValue}
      disabled={disabled}
      inputMode={inputMode}
      placeholder={placeholder}
      onCompositionStart={() => setIsComposing(true)}
      onCompositionEnd={(event) => {
        const nextValue = event.currentTarget.value
        setIsComposing(false)
        setDraftValue(nextValue)
        onValueChange(nextValue)
      }}
      onChange={(event) => {
        const nextValue = event.target.value
        setDraftValue(nextValue)
        if (!isComposing) {
          onValueChange(nextValue)
        }
      }}
    />
  )
}
