import { useState } from 'react'
import { Cross2Icon } from '@radix-ui/react-icons'
import { type Table } from '@tanstack/react-table'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DataTableFacetedFilter } from './faceted-filter'
import { getSearchInputCommitValue } from './ime'
import { DataTableViewOptions } from './view-options'

type DataTableToolbarProps<TData> = {
  table: Table<TData>
  searchPlaceholder?: string
  searchKey?: string
  filterPanelCollapsed?: boolean
  onToggleFilterPanel?: () => void
  onReset?: () => void
  columnLabels?: Record<string, string>
  filters?: {
    columnId?: string
    fieldId?: string
    title: string
    selectionMode?: 'single' | 'multiple'
    defaultValue?:
      | string
      | string[]
      | ((
          filterValues: Record<string, unknown>
        ) => string | string[] | undefined)
    options: {
      label: string
      value: string
      icon?: React.ComponentType<{ className?: string }>
    }[]
    optionCounts?: Record<string, number>
  }[]
  filterValues?: Record<string, unknown>
  onFilterValueChange?: (fieldId: string, value: unknown) => void
}

export function DataTableToolbar<TData>({
  table,
  searchPlaceholder = '筛选...',
  searchKey,
  filterPanelCollapsed,
  onToggleFilterPanel,
  onReset,
  columnLabels,
  filters = [],
  filterValues = {},
  onFilterValueChange,
}: DataTableToolbarProps<TData>) {
  const committedSearchValue = searchKey
    ? ((table.getColumn(searchKey)?.getFilterValue() as string) ?? '')
    : ((table.getState().globalFilter as string | undefined) ?? '')
  const [searchDraft, setSearchDraft] = useState({
    committedValue: committedSearchValue,
    value: committedSearchValue,
  })
  const [isSearchComposing, setIsSearchComposing] = useState(false)
  const isFiltered =
    table.getState().columnFilters.length > 0 || table.getState().globalFilter

  let searchInputValue = searchDraft.value
  if (
    !isSearchComposing &&
    searchDraft.committedValue !== committedSearchValue
  ) {
    searchInputValue = committedSearchValue
    setSearchDraft({
      committedValue: committedSearchValue,
      value: committedSearchValue,
    })
  }

  const commitSearchValue = (value: string) => {
    if (searchKey) {
      table.getColumn(searchKey)?.setFilterValue(value)
      return
    }

    table.setGlobalFilter(value)
  }
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchDraft((current) => ({
      ...current,
      value: event.target.value,
    }))
  }
  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const nativeEvent = event.nativeEvent as KeyboardEvent & {
      isComposing?: boolean
    }

    const commitValue = getSearchInputCommitValue({
      eventType: 'keydown',
      key: event.key,
      value: event.currentTarget.value,
      isComposing: isSearchComposing || Boolean(nativeEvent.isComposing),
    })

    if (commitValue !== null) {
      event.preventDefault()
      commitSearchValue(commitValue)
    }
  }
  const handleSearchCompositionStart = (
    _event: React.CompositionEvent<HTMLInputElement>
  ) => {
    setIsSearchComposing(true)
  }
  const handleSearchCompositionEnd = (
    event: React.CompositionEvent<HTMLInputElement>
  ) => {
    const nextValue = event.currentTarget.value

    setIsSearchComposing(false)
    setSearchDraft((current) => ({
      ...current,
      value: nextValue,
    }))
  }
  const handleSearchSubmit = () => {
    const commitValue = getSearchInputCommitValue({
      eventType: 'submit',
      value: searchInputValue,
      isComposing: isSearchComposing,
    })

    if (commitValue !== null) {
      commitSearchValue(commitValue)
    }
  }
  const handleSearchClear = () => {
    const commitValue = getSearchInputCommitValue({
      eventType: 'clear',
      value: searchInputValue,
      isComposing: false,
    })

    setIsSearchComposing(false)
    setSearchDraft({
      committedValue: '',
      value: '',
    })
    commitSearchValue(commitValue ?? '')
  }

  return (
    <div className='flex items-center justify-between'>
      <div className='flex flex-1 flex-col-reverse items-start gap-2 sm:flex-row sm:items-center'>
        {onToggleFilterPanel ? (
          <Button
            type='button'
            variant='outline'
            size='sm'
            aria-expanded={!filterPanelCollapsed}
            onClick={onToggleFilterPanel}
          >
            <SlidersHorizontal data-icon='inline-start' />
            高级筛选
          </Button>
        ) : null}
        <div className='flex items-center gap-1'>
          <div className='relative'>
            <Input
              placeholder={searchPlaceholder}
              value={searchInputValue}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
              onCompositionStart={handleSearchCompositionStart}
              onCompositionEnd={handleSearchCompositionEnd}
              className='h-8 w-[150px] pe-8 lg:w-[260px]'
            />
            {searchInputValue ? (
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='absolute top-1/2 right-1 size-6 -translate-y-1/2'
                aria-label='清空搜索'
                onMouseDown={(event) => event.preventDefault()}
                onClick={handleSearchClear}
              >
                <X />
              </Button>
            ) : null}
          </div>
          <Button
            type='button'
            variant='outline'
            size='icon'
            className='size-8'
            aria-label='搜索'
            onClick={handleSearchSubmit}
          >
            <Search />
          </Button>
        </div>
        <div className='flex gap-x-2'>
          {filters.map((filter) => {
            const column = filter.columnId
              ? table.getColumn(filter.columnId)
              : undefined
            const fieldId = filter.fieldId ?? filter.columnId
            if (column) {
              return (
                <DataTableFacetedFilter
                  key={fieldId}
                  column={column}
                  title={filter.title}
                  options={filter.options}
                  optionCounts={filter.optionCounts}
                  selectionMode={filter.selectionMode}
                />
              )
            }
            if (!fieldId || !onFilterValueChange) return null
            return (
              <DataTableFacetedFilter
                key={fieldId}
                title={filter.title}
                options={filter.options}
                optionCounts={filter.optionCounts}
                selectionMode={filter.selectionMode}
                selectedValues={normalizeToolbarFilterValue(
                  filterValues[fieldId],
                  resolveToolbarFilterDefaultValue(
                    filter.defaultValue,
                    filterValues
                  )
                )}
                onSelectedValuesChange={(values) =>
                  onFilterValueChange(
                    fieldId,
                    filter.selectionMode === 'single' ? (values[0] ?? '') : values
                  )
                }
              />
            )
          })}
        </div>
        {isFiltered && (
          <Button
            variant='ghost'
            onClick={() => {
              if (onReset) {
                onReset()
                return
              }

              table.resetColumnFilters()
              table.setGlobalFilter('')
              setSearchDraft({
                committedValue: '',
                value: '',
              })
              setIsSearchComposing(false)
            }}
            className='h-8 px-2 lg:px-3'
          >
            重置
            <Cross2Icon className='ms-2 h-4 w-4' />
          </Button>
        )}
      </div>
      <DataTableViewOptions table={table} columnLabels={columnLabels} />
    </div>
  )
}

function normalizeToolbarFilterValue(
  value: unknown,
  defaultValue?: string | string[]
) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  if (typeof value === 'string' && value) {
    return [value]
  }
  if (Array.isArray(defaultValue)) {
    return defaultValue
  }
  if (typeof defaultValue === 'string' && defaultValue) {
    return [defaultValue]
  }
  return []
}

function resolveToolbarFilterDefaultValue(
  defaultValue:
    | string
    | string[]
    | ((filterValues: Record<string, unknown>) => string | string[] | undefined)
    | undefined,
  filterValues: Record<string, unknown>
) {
  return typeof defaultValue === 'function'
    ? defaultValue(filterValues)
    : defaultValue
}
