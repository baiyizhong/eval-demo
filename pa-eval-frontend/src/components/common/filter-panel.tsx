import { useMemo, useState, type ReactNode } from 'react'
import * as Accordion from '@radix-ui/react-accordion'
import * as Slider from '@radix-ui/react-slider'
import { ChevronDown, ChevronUp, Filter, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DateTimePicker } from '@/components/common/date-time/date-time-picker'
import { DateTimeRangePicker } from '@/components/common/date-time/date-time-range-picker'
import type { DateTimeConfig } from '@/components/common/date-time/date-time.types'

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

export type DateFilterField = BaseFilterField &
  DateTimeConfig & {
    type: 'date'
  }

export type DateRangeFilterField = BaseFilterField &
  DateTimeConfig & {
    type: 'dateRange'
    startPlaceholder?: string
    endPlaceholder?: string
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
        'w-[280px] overflow-x-hidden overflow-y-auto rounded-md border opacity-100 transition-[width,opacity,border-color] duration-300 ease-in-out',
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
        <div className='flex items-center gap-2'>
          <span className='bg-background text-foreground flex size-7 shrink-0 items-center justify-center rounded-md border'>
            <Filter size={16} />
          </span>
          <span className='text-sm font-semibold tracking-tight whitespace-nowrap'>
            {title}
          </span>
        </div>
        <Button type='button' variant='ghost' size='sm' onClick={clearAll}>
          清空
        </Button>
      </div>

      <div className='px-5 pb-4'>
        <div className='relative'>
          <Search
            className='text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2'
            size={16}
          />
          <Input
            type='text'
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className='pl-9'
          />
        </div>
      </div>

      <Separator />

      <Accordion.Root
        type='multiple'
        value={openGroups}
        onValueChange={setOpenGroups}
        className='divide-border divide-y'
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
                  <div className='text-foreground flex min-w-0 items-center gap-3'>
                    {group.icon ? (
                      <span className='text-muted-foreground shrink-0'>
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
                    <span className='text-muted-foreground'>
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
        <p className='text-muted-foreground px-5 py-4 text-sm'>
          没有匹配的筛选项
        </p>
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
            <div className='text-sm font-medium'>{field.label}</div>
            {field.description ? (
              <div className='text-muted-foreground mt-1 text-xs leading-5'>
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
  setFieldValue,
  clearFieldValue,
}: {
  group: FilterGroup
  field: FilterField
  values: FilterValues
  fieldValue: unknown
  renderers?: FilterRendererMap
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
        className='h-10 text-sm'
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
    const dateField = field as DateFilterField

    return (
      <DateTimePicker
        value={typeof fieldValue === 'string' ? fieldValue : ''}
        disabled={dateField.disabled}
        placeholder={dateField.placeholder}
        showTime={dateField.showTime}
        timeStep={dateField.timeStep}
        timeFormat={dateField.timeFormat}
        onChange={(nextValue) => setFieldValue(nextValue, 'date')}
      />
    )
  }

  if (field.type === 'dateRange') {
    const dateRangeField = field as DateRangeFilterField

    return (
      <DateTimeRangePicker
        value={toStringArray(fieldValue)}
        disabled={dateRangeField.disabled}
        placeholder={dateRangeField.placeholder}
        startPlaceholder={dateRangeField.startPlaceholder}
        endPlaceholder={dateRangeField.endPlaceholder}
        showTime={dateRangeField.showTime}
        timeStep={dateRangeField.timeStep}
        timeFormat={dateRangeField.timeFormat}
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
    <div className='text-muted-foreground rounded-md border border-dashed px-3 py-2 text-sm'>
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
              <Checkbox
                checked={value.includes(option.value)}
                disabled={field.disabled || option.disabled}
                onCheckedChange={(checked) =>
                  toggleOption(option.value, checked === true)
                }
                className='size-5'
              />
              <span className='text-muted-foreground group-hover:text-foreground truncate text-sm transition-colors'>
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
        <Slider.Track className='bg-muted relative h-2 w-full grow overflow-hidden rounded-md'>
          <Slider.Range className='bg-primary absolute h-full' />
        </Slider.Track>
        {value.map((_, index) => (
          <Slider.Thumb
            key={index}
            className='border-primary bg-background focus-visible:ring-ring hover:ring-ring/20 block size-4 rounded-md border shadow-sm transition-shadow hover:ring-4 focus:outline-none focus-visible:ring-4 disabled:pointer-events-none disabled:opacity-50'
          />
        ))}
      </Slider.Root>
      <div className='text-muted-foreground flex items-center justify-between text-xs'>
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
    <ToggleGroup
      type='multiple'
      value={value}
      onValueChange={onChange}
      disabled={field.disabled}
      className='flex flex-wrap gap-2'
      variant='outline'
      size='sm'
      spacing={2}
    >
      {field.options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          disabled={option.disabled}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
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
