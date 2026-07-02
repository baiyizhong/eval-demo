import { useMemo, useState, type ReactNode } from 'react'
import * as Accordion from '@radix-ui/react-accordion'
import * as Checkbox from '@radix-ui/react-checkbox'
import * as Slider from '@radix-ui/react-slider'
import * as ToggleGroup from '@radix-ui/react-toggle-group'
import {
  CalendarIcon,
  Check,
  ChevronDown,
  ChevronUp,
  Filter,
  Search,
} from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export type FilterValues = Record<string, unknown>

export type FilterChangeMeta = {
  groupId: string
  fieldId: string
  fieldType: string
  action: string
}

type FilterOption = {
  label: string
  value: string
  count?: number
  disabled?: boolean
}

type BaseFilterField = {
  id: string
  label: string
  description?: string
  disabled?: boolean
  emptyValue?: unknown
}

export type InputFilterField = BaseFilterField & {
  type: 'input'
  placeholder?: string
}

export type CheckboxFilterField = BaseFilterField & {
  type: 'checkbox'
  options: FilterOption[]
}

export type RangeFilterField = BaseFilterField & {
  type: 'range'
  min: number
  max: number
  step?: number
  defaultValue?: [number, number]
  formatValue?: (value: number) => string
}

export type TagsFilterField = BaseFilterField & {
  type: 'tags'
  options: FilterOption[]
}

type DateTimeConfig = {
  placeholder?: string
  showTime?: boolean
  timeStep?: number
  timeFormat?: 'HH:mm' | 'HH:mm:ss'
}

export type DateFilterField = BaseFilterField &
  DateTimeConfig & {
    type: 'date'
  }

export type DateRangeFilterField = BaseFilterField &
  DateTimeConfig & {
    type: 'dateRange'
  }

export type FilterRendererContext<TField extends FilterField = FilterField> = {
  group: FilterGroup
  field: TField
  value: unknown
  values: FilterValues
  setValue: (nextValue: unknown, action?: string) => void
  clearValue: () => void
}

export type CustomFilterField = BaseFilterField & {
  type: 'custom'
  render: (context: FilterRendererContext<CustomFilterField>) => ReactNode
}

export type ExternalFilterField = BaseFilterField & {
  type: string
  [key: string]: unknown
}

export type BuiltInFilterField =
  | InputFilterField
  | CheckboxFilterField
  | RangeFilterField
  | TagsFilterField
  | DateFilterField
  | DateRangeFilterField
  | CustomFilterField

export type FilterField = BuiltInFilterField | ExternalFilterField

export type FilterGroup = {
  id: string
  label: string
  icon?: ReactNode
  defaultOpen?: boolean
  fields: FilterField[]
}

export type FilterRenderer = (context: FilterRendererContext) => ReactNode
export type FilterRendererMap = Record<string, FilterRenderer>

export type FilterPanelProps = {
  groups: FilterGroup[]
  value: FilterValues
  onChange: (nextValue: FilterValues, meta: FilterChangeMeta) => void
  renderers?: FilterRendererMap
  title?: string
  searchPlaceholder?: string
  width?: number | string
  maxHeight?: number | string
  collapsed?: boolean
  defaultOpenGroupIds?: string[]
  className?: string
}

const DEFAULT_MAX_HEIGHT = 'calc(100vh - 160px)'

const BUILT_IN_FIELD_TYPES = new Set([
  'input',
  'checkbox',
  'range',
  'tags',
  'date',
  'dateRange',
  'custom',
])

export function FilterPanel({
  groups,
  value,
  onChange,
  renderers,
  title = '筛选',
  searchPlaceholder = '搜索筛选项...',
  width,
  maxHeight = DEFAULT_MAX_HEIGHT,
  collapsed = false,
  defaultOpenGroupIds,
  className,
}: FilterPanelProps) {
  const initialOpenGroups = useMemo(
    () =>
      defaultOpenGroupIds ??
      groups.filter((group) => group.defaultOpen).map((group) => group.id),
    [defaultOpenGroupIds, groups]
  )
  const [openGroups, setOpenGroups] = useState<string[]>(initialOpenGroups)
  const [searchQuery, setSearchQuery] = useState('')
  const [draftDateRanges, setDraftDateRanges] = useState<
    Record<string, DateRange>
  >({})
  const visibleGroups = useMemo(
    () => filterGroupsByQuery(groups, searchQuery),
    [groups, searchQuery]
  )

  const setFieldValue = (
    group: FilterGroup,
    field: FilterField,
    nextFieldValue: unknown,
    action: string
  ) => {
    onChange(
      {
        ...value,
        [field.id]: nextFieldValue,
      },
      {
        groupId: group.id,
        fieldId: field.id,
        fieldType: field.type,
        action,
      }
    )
  }

  const clearFieldValue = (group: FilterGroup, field: FilterField) => {
    setFieldValue(group, field, getEmptyValue(field), 'clear')
  }

  const clearAll = () => {
    const nextValue = { ...value }

    groups.forEach((group) => {
      group.fields.forEach((field) => {
        nextValue[field.id] = getEmptyValue(field)
      })
    })

    setDraftDateRanges({})
    onChange(nextValue, {
      groupId: '*',
      fieldId: '*',
      fieldType: '*',
      action: 'clear',
    })
  }

  return (
    <div
      className={cn(
        'w-[280px] overflow-x-hidden overflow-y-auto rounded-md border border-gray-200 opacity-100 transition-[width,opacity,border-color] duration-300 ease-in-out',
        collapsed && 'pointer-events-none border-transparent opacity-0',
        className
      )}
      aria-hidden={collapsed}
      data-collapsed={collapsed}
      style={{
        width: collapsed
          ? '0px'
          : width === undefined
            ? undefined
            : normalizeWidth(width),
        maxHeight: normalizeWidth(maxHeight),
      }}
    >
      <div className='flex items-center justify-between px-5 pt-5 pb-4'>
        <div className='flex items-center'>
          <span className='flex size-7 shrink-0 items-center justify-center rounded-md border-gray-200 bg-white text-gray-900'>
            <Filter size={16} />
          </span>
          <span className='text-sm font-semibold tracking-tight whitespace-nowrap text-gray-900'>
            {title}
          </span>
        </div>
        <button
          type='button'
          onClick={clearAll}
          className='text-sm text-gray-400 transition-colors hover:text-gray-600'
        >
          清空
        </button>
      </div>

      <div className='px-5 pb-4'>
        <div className='flex items-center gap-2.5 rounded-md bg-gray-100 px-3.5 py-2.5'>
          <Search
            size={16}
            strokeWidth={2}
            className='shrink-0 text-gray-400'
          />
          <input
            type='text'
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className='min-w-0 flex-1 bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400'
          />
        </div>
      </div>

      <div className='border-t border-gray-100' />

      <Accordion.Root
        type='multiple'
        value={openGroups}
        onValueChange={setOpenGroups}
        className='divide-y divide-gray-100'
      >
        {visibleGroups.map((group) => {
          const isOpen = openGroups.includes(group.id)
          const originalGroup =
            groups.find((currentGroup) => currentGroup.id === group.id) ?? group
          const activeCount = getGroupActiveCount(originalGroup, value)

          return (
            <Accordion.Item key={group.id} value={group.id}>
              <Accordion.Header>
                <Accordion.Trigger className='group flex w-full items-center justify-between px-5 py-4 focus:outline-none'>
                  <div className='flex min-w-0 items-center gap-3 text-gray-900'>
                    {group.icon ? (
                      <span className='shrink-0 text-gray-500'>
                        {group.icon}
                      </span>
                    ) : null}
                    <span className='truncate text-sm font-semibold tracking-tight'>
                      {group.label}
                    </span>
                  </div>
                  <div className='ml-3 flex shrink-0 items-center gap-2'>
                    {activeCount > 0 ? (
                      <Badge
                        variant='secondary'
                        className='h-5 min-w-5 rounded-md px-1.5'
                      >
                        {activeCount}
                      </Badge>
                    ) : null}
                    <span className='text-gray-400'>
                      {isOpen ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </span>
                  </div>
                </Accordion.Trigger>
              </Accordion.Header>

              <Accordion.Content className='overflow-hidden data-[state=closed]:animate-none data-[state=open]:animate-none'>
                <div className='flex flex-col gap-4 px-5 pb-4'>
                  {group.fields.map((field) => (
                    <FieldFrame key={field.id} field={field}>
                      {renderField({
                        group,
                        field,
                        values: value,
                        fieldValue: value[field.id],
                        renderers,
                        draftDateRange: draftDateRanges[field.id],
                        setDraftDateRange: (nextDraft) =>
                          setDraftDateRanges((prev) => ({
                            ...prev,
                            [field.id]: nextDraft,
                          })),
                        clearDraftDateRange: () =>
                          setDraftDateRanges((prev) => {
                            const next = { ...prev }
                            delete next[field.id]
                            return next
                          }),
                        setFieldValue: (nextFieldValue, action) =>
                          setFieldValue(group, field, nextFieldValue, action),
                        clearFieldValue: () => clearFieldValue(group, field),
                      })}
                    </FieldFrame>
                  ))}
                </div>
              </Accordion.Content>
            </Accordion.Item>
          )
        })}
      </Accordion.Root>

      {visibleGroups.length === 0 ? (
        <p className='px-5 py-4 text-sm text-gray-400'>没有匹配的筛选项</p>
      ) : null}

      <div className='h-2' />
    </div>
  )
}

function FieldFrame({
  field,
  children,
}: {
  field: FilterField
  children: ReactNode
}) {
  return (
    <div className='flex flex-col gap-2'>
      {field.type !== 'custom' ? (
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <div className='text-sm font-medium text-gray-800'>
              {field.label}
            </div>
            {field.description ? (
              <div className='mt-1 text-xs leading-5 text-gray-400'>
                {field.description}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {children}
    </div>
  )
}

function normalizeWidth(width: number | string) {
  return typeof width === 'number' ? `${width}px` : width
}

function renderField({
  group,
  field,
  values,
  fieldValue,
  renderers,
  draftDateRange,
  setDraftDateRange,
  clearDraftDateRange,
  setFieldValue,
  clearFieldValue,
}: {
  group: FilterGroup
  field: FilterField
  values: FilterValues
  fieldValue: unknown
  renderers?: FilterRendererMap
  draftDateRange?: DateRange
  setDraftDateRange: (nextDraft: DateRange) => void
  clearDraftDateRange: () => void
  setFieldValue: (nextValue: unknown, action: string) => void
  clearFieldValue: () => void
}) {
  const context: FilterRendererContext = {
    group,
    field,
    value: fieldValue,
    values,
    setValue: (nextValue, action = 'custom') =>
      setFieldValue(nextValue, action),
    clearValue: clearFieldValue,
  }

  if (field.type === 'input') {
    return (
      <Input
        value={typeof fieldValue === 'string' ? fieldValue : ''}
        onChange={(event) => setFieldValue(event.target.value, 'input')}
        placeholder={(field as InputFilterField).placeholder}
        disabled={field.disabled}
        className='h-10 rounded-md border-gray-200 bg-gray-50 text-sm'
      />
    )
  }

  if (field.type === 'checkbox') {
    return (
      <CheckboxList
        field={field as CheckboxFilterField}
        value={toStringArray(fieldValue)}
        onChange={(nextValue) => setFieldValue(nextValue, 'toggle')}
      />
    )
  }

  if (field.type === 'range') {
    return (
      <RangeControl
        field={field as RangeFilterField}
        value={toRangeValue(fieldValue, field as RangeFilterField)}
        onChange={(nextValue) => setFieldValue(nextValue, 'range')}
      />
    )
  }

  if (field.type === 'tags') {
    return (
      <TagsControl
        field={field as TagsFilterField}
        value={toStringArray(fieldValue)}
        onChange={(nextValue) => setFieldValue(nextValue, 'toggle')}
      />
    )
  }

  if (field.type === 'date') {
    return (
      <DateControl
        field={field as DateFilterField}
        value={typeof fieldValue === 'string' ? fieldValue : ''}
        onChange={(nextValue) => setFieldValue(nextValue, 'date')}
      />
    )
  }

  if (field.type === 'dateRange') {
    return (
      <DateRangeControl
        field={field as DateRangeFilterField}
        value={toStringArray(fieldValue)}
        draftRange={draftDateRange}
        setDraftRange={setDraftDateRange}
        clearDraftRange={clearDraftDateRange}
        onChange={(nextValue) => setFieldValue(nextValue, 'dateRange')}
      />
    )
  }

  if (
    field.type === 'custom' &&
    typeof (field as CustomFilterField).render === 'function'
  ) {
    return (field as CustomFilterField).render(
      context as FilterRendererContext<CustomFilterField>
    )
  }

  const externalRenderer = renderers?.[field.type]

  if (externalRenderer) {
    return externalRenderer(context)
  }

  if (!import.meta.env.DEV && !BUILT_IN_FIELD_TYPES.has(field.type)) {
    return null
  }

  return (
    <div className='rounded-md border border-dashed border-gray-200 px-3 py-2 text-sm text-gray-400'>
      未配置字段渲染器：{field.type}
    </div>
  )
}

function CheckboxList({
  field,
  value,
  onChange,
}: {
  field: CheckboxFilterField
  value: string[]
  onChange: (nextValue: string[]) => void
}) {
  const toggleOption = (optionValue: string, checked: boolean) => {
    if (checked) {
      onChange(Array.from(new Set([...value, optionValue])))
      return
    }

    onChange(value.filter((currentValue) => currentValue !== optionValue))
  }

  return (
    <ul className='flex flex-col gap-3'>
      {field.options.map((option) => (
        <li key={option.value}>
          <label className='group flex cursor-pointer items-center justify-between'>
            <div className='flex min-w-0 items-center gap-3'>
              <Checkbox.Root
                checked={value.includes(option.value)}
                disabled={field.disabled || option.disabled}
                onCheckedChange={(checked) =>
                  toggleOption(option.value, checked === true)
                }
                className='flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-gray-300 bg-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-gray-900 data-[state=checked]:bg-gray-900'
              >
                <Checkbox.Indicator>
                  <Check size={12} strokeWidth={3} className='text-white' />
                </Checkbox.Indicator>
              </Checkbox.Root>
              <span className='truncate text-sm text-gray-700 transition-colors group-hover:text-gray-900'>
                {option.label}
              </span>
            </div>
          </label>
        </li>
      ))}
    </ul>
  )
}

function RangeControl({
  field,
  value,
  onChange,
}: {
  field: RangeFilterField
  value: [number, number]
  onChange: (nextValue: [number, number]) => void
}) {
  const formatValue =
    field.formatValue ?? ((nextValue: number) => String(nextValue))

  return (
    <div className='flex flex-col gap-3'>
      <Slider.Root
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        value={value}
        disabled={field.disabled}
        onValueChange={(nextValue) => onChange(toRangeValue(nextValue, field))}
        className='relative flex w-full touch-none items-center select-none'
      >
        <Slider.Track className='relative h-2 w-full grow overflow-hidden rounded-md bg-gray-100'>
          <Slider.Range className='absolute h-full bg-gray-900' />
        </Slider.Track>
        {value.map((_, index) => (
          <Slider.Thumb
            key={index}
            className='block h-4 w-4 rounded-md border border-gray-900 bg-white shadow-sm transition-shadow hover:ring-4 hover:ring-gray-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-gray-200 disabled:pointer-events-none disabled:opacity-50'
          />
        ))}
      </Slider.Root>
      <div className='flex items-center justify-between text-xs text-gray-500'>
        <span>{formatValue(value[0])}</span>
        <span>{formatValue(value[1])}</span>
      </div>
    </div>
  )
}

function TagsControl({
  field,
  value,
  onChange,
}: {
  field: TagsFilterField
  value: string[]
  onChange: (nextValue: string[]) => void
}) {
  return (
    <ToggleGroup.Root
      type='multiple'
      value={value}
      onValueChange={onChange}
      disabled={field.disabled}
      className='flex flex-wrap gap-2'
    >
      {field.options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className='rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-50 data-[state=on]:border-gray-900 data-[state=on]:bg-gray-900 data-[state=on]:text-white'
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}

function DateControl({
  field,
  value,
  onChange,
}: {
  field: DateFilterField
  value: string
  onChange: (nextValue: string) => void
}) {
  const datePart = getDatePart(value)
  const selectedDate = parseDate(datePart)
  const timeValue = getTimePart(value, field)

  const updateDate = (date?: Date) => {
    if (!date) {
      onChange('')
      return
    }

    const nextDate = formatDate(date)
    onChange(
      field.showTime ? joinDateTime(nextDate, timeValue, field) : nextDate
    )
  }

  const updateTime = (time: string) => {
    if (!datePart) {
      return
    }

    onChange(joinDateTime(datePart, normalizeTime(time, field), field))
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type='button'
          variant='outline'
          className={cn(
            'h-10 justify-start rounded-md border-gray-200 bg-gray-50 px-3 text-left font-normal',
            !value && 'text-gray-400'
          )}
          disabled={field.disabled}
        >
          <CalendarIcon size={16} strokeWidth={1.75} />
          <span className='truncate'>
            {value || field.placeholder || '选择日期'}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-auto p-0'>
        <Calendar
          mode='single'
          selected={selectedDate}
          onSelect={updateDate}
          initialFocus
        />
        {field.showTime ? (
          <div className='border-t border-gray-100 p-3'>
            <Input
              type='time'
              step={
                field.timeStep ?? (field.timeFormat === 'HH:mm:ss' ? 1 : 60)
              }
              value={timeValue}
              disabled={!datePart}
              onChange={(event) => updateTime(event.target.value)}
            />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function DateRangeControl({
  field,
  value,
  draftRange,
  setDraftRange,
  clearDraftRange,
  onChange,
}: {
  field: DateRangeFilterField
  value: string[]
  draftRange?: DateRange
  setDraftRange: (nextRange: DateRange) => void
  clearDraftRange: () => void
  onChange: (nextValue: string[]) => void
}) {
  const selectedRange = draftRange ?? toDateRange(value)
  const displayText =
    value.length > 0 ? value.join(' 至 ') : field.placeholder || '选择日期区间'
  const startDate = getDatePart(value[0])
  const endDate = getDatePart(value[1])

  const updateRange = (range?: DateRange) => {
    if (!range?.from) {
      clearDraftRange()
      onChange([])
      return
    }

    if (!range.to) {
      setDraftRange(range)
      return
    }

    clearDraftRange()
    const start = formatDate(range.from)
    const end = formatDate(range.to)
    const startTime = getTimePart(value[0], field, 'start')
    const endTime = getTimePart(value[1], field, 'end')

    onChange(
      field.showTime
        ? [
            joinDateTime(start, startTime, field),
            joinDateTime(end, endTime, field),
          ]
        : [start, end]
    )
  }

  const updateTime = (index: 0 | 1, time: string) => {
    if (!startDate || !endDate) {
      return
    }

    const nextValue = [...value]
    const date = index === 0 ? startDate : endDate
    nextValue[index] = joinDateTime(date, normalizeTime(time, field), field)
    onChange(nextValue)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type='button'
          variant='outline'
          className={cn(
            'h-auto min-h-10 justify-start rounded-md border-gray-200 bg-gray-50 px-3 text-left font-normal',
            value.length === 0 && 'text-gray-400'
          )}
          disabled={field.disabled}
        >
          <CalendarIcon size={16} strokeWidth={1.75} />
          <span className='truncate'>{displayText}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-auto p-0'>
        <Calendar
          mode='range'
          selected={selectedRange}
          onSelect={updateRange}
          initialFocus
        />
        {field.showTime ? (
          <div className='grid grid-cols-2 gap-2 border-t border-gray-100 p-3'>
            <Input
              type='time'
              step={
                field.timeStep ?? (field.timeFormat === 'HH:mm:ss' ? 1 : 60)
              }
              value={getTimePart(value[0], field, 'start')}
              disabled={!startDate || !endDate}
              onChange={(event) => updateTime(0, event.target.value)}
            />
            <Input
              type='time'
              step={
                field.timeStep ?? (field.timeFormat === 'HH:mm:ss' ? 1 : 60)
              }
              value={getTimePart(value[1], field, 'end')}
              disabled={!startDate || !endDate}
              onChange={(event) => updateTime(1, event.target.value)}
            />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function filterGroupsByQuery(groups: FilterGroup[], query: string) {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return groups
  }

  return groups.reduce<FilterGroup[]>((result, group) => {
    if (matchesText(group.label, normalizedQuery)) {
      result.push(group)
      return result
    }

    const fields = group.fields.filter((field) =>
      matchesField(field, normalizedQuery)
    )

    if (fields.length > 0) {
      result.push({
        ...group,
        fields,
      })
    }

    return result
  }, [])
}

function matchesField(field: FilterField, query: string) {
  if (
    matchesText(field.label, query) ||
    matchesText(field.description, query)
  ) {
    return true
  }

  if (field.type === 'checkbox' || field.type === 'tags') {
    return (field as CheckboxFilterField | TagsFilterField).options.some(
      (option) => matchesText(option.label, query)
    )
  }

  return false
}

function matchesText(value: unknown, query: string) {
  return typeof value === 'string' && value.toLowerCase().includes(query)
}

function getEmptyValue(field: FilterField) {
  if ('emptyValue' in field && field.emptyValue !== undefined) {
    return field.emptyValue
  }

  if (field.type === 'input' || field.type === 'date') {
    return ''
  }

  if (
    field.type === 'checkbox' ||
    field.type === 'tags' ||
    field.type === 'dateRange'
  ) {
    return []
  }

  if (field.type === 'range') {
    const rangeField = field as RangeFilterField
    return rangeField.defaultValue ?? [rangeField.min, rangeField.max]
  }

  return undefined
}

function getGroupActiveCount(group: FilterGroup, values: FilterValues) {
  return group.fields.reduce((count, field) => {
    return isActiveFieldValue(field, values[field.id]) ? count + 1 : count
  }, 0)
}

function isActiveFieldValue(field: FilterField, fieldValue: unknown) {
  if (field.type === 'range') {
    const rangeField = field as RangeFilterField
    const current = toRangeValue(fieldValue, rangeField)
    const empty = toRangeValue(getEmptyValue(field), rangeField)
    return current[0] !== empty[0] || current[1] !== empty[1]
  }

  const emptyValue = getEmptyValue(field)

  if (Array.isArray(fieldValue)) {
    return fieldValue.length > 0
  }

  if (typeof fieldValue === 'string') {
    return fieldValue.trim().length > 0
  }

  if (typeof fieldValue === 'boolean') {
    return fieldValue !== emptyValue
  }

  if (typeof fieldValue === 'number') {
    return fieldValue !== emptyValue
  }

  return (
    fieldValue !== undefined && fieldValue !== null && fieldValue !== emptyValue
  )
}

function toStringArray(fieldValue: unknown): string[] {
  return Array.isArray(fieldValue)
    ? fieldValue.filter((item): item is string => typeof item === 'string')
    : []
}

function toRangeValue(
  fieldValue: unknown,
  field: RangeFilterField
): [number, number] {
  const fallback = field.defaultValue ?? [field.min, field.max]

  if (!Array.isArray(fieldValue) || fieldValue.length < 2) {
    return fallback
  }

  const start = typeof fieldValue[0] === 'number' ? fieldValue[0] : fallback[0]
  const end = typeof fieldValue[1] === 'number' ? fieldValue[1] : fallback[1]

  return [start, end]
}

function parseDate(value?: string) {
  if (!value) {
    return undefined
  }

  const [year, month, day] = value.split('-').map(Number)

  if (!year || !month || !day) {
    return undefined
  }

  return new Date(year, month - 1, day)
}

function formatDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getDatePart(value?: string) {
  return typeof value === 'string' ? value.split(' ')[0] || '' : ''
}

function getTimePart(
  value: unknown,
  field: DateTimeConfig,
  rangeSide: 'start' | 'end' = 'start'
) {
  if (!field.showTime) {
    return ''
  }

  const fallback = rangeSide === 'end' ? '23:59:59' : '00:00:00'
  const rawTime =
    typeof value === 'string' && value.includes(' ')
      ? value.split(' ')[1]
      : fallback

  return normalizeTime(rawTime, field)
}

function normalizeTime(value: string, field: DateTimeConfig) {
  const withSeconds = field.timeFormat === 'HH:mm:ss'
  const [hour = '00', minute = '00', second = '00'] = value.split(':')
  const normalized = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}`

  return withSeconds ? normalized : normalized.slice(0, 5)
}

function joinDateTime(date: string, time: string, field: DateTimeConfig) {
  return `${date} ${normalizeTime(time, field)}`
}

function toDateRange(value: string[]): DateRange | undefined {
  const from = parseDate(getDatePart(value[0]))
  const to = parseDate(getDatePart(value[1]))

  if (!from) {
    return undefined
  }

  return { from, to }
}
