import { useState } from 'react'
import { Cross2Icon } from '@radix-ui/react-icons'
import { type Table } from '@tanstack/react-table'
import { SlidersHorizontal } from 'lucide-react'
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
    columnId: string
    title: string
    options: {
      label: string
      value: string
      icon?: React.ComponentType<{ className?: string }>
    }[]
  }[]
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
}: DataTableToolbarProps<TData>) {
  const committedSearchValue = searchKey
    ? ((table.getColumn(searchKey)?.getFilterValue() as string) ?? '')
    : ((table.getState().globalFilter as string | undefined) ?? '')
  const [compositionValue, setCompositionValue] = useState<string | null>(null)
  const searchInputValue = compositionValue ?? committedSearchValue
  const isFiltered =
    table.getState().columnFilters.length > 0 || table.getState().globalFilter
  const commitSearchValue = (value: string) => {
    if (searchKey) {
      table.getColumn(searchKey)?.setFilterValue(value)
      return
    }

    table.setGlobalFilter(value)
  }
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value
    const nativeEvent = event.nativeEvent as Event & {
      isComposing?: boolean
    }

    const commitValue = getSearchInputCommitValue({
      eventType: 'change',
      value: nextValue,
      isComposing: Boolean(nativeEvent.isComposing),
    })

    if (commitValue !== null) {
      commitSearchValue(commitValue)
      return
    }

    setCompositionValue(nextValue)
  }
  const handleSearchCompositionStart = (
    event: React.CompositionEvent<HTMLInputElement>
  ) => {
    setCompositionValue(event.currentTarget.value)
  }
  const handleSearchCompositionEnd = (
    event: React.CompositionEvent<HTMLInputElement>
  ) => {
    const nextValue = event.currentTarget.value
    const commitValue = getSearchInputCommitValue({
      eventType: 'compositionend',
      value: nextValue,
      isComposing: false,
    })

    setCompositionValue(null)
    if (commitValue !== null) {
      commitSearchValue(commitValue)
    }
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
        {searchKey ? (
          <Input
            placeholder={searchPlaceholder}
            value={searchInputValue}
            onChange={handleSearchChange}
            onCompositionStart={handleSearchCompositionStart}
            onCompositionEnd={handleSearchCompositionEnd}
            className='h-8 w-[150px] lg:w-[250px]'
          />
        ) : (
          <Input
            placeholder={searchPlaceholder}
            value={searchInputValue}
            onChange={handleSearchChange}
            onCompositionStart={handleSearchCompositionStart}
            onCompositionEnd={handleSearchCompositionEnd}
            className='h-8 w-[150px] lg:w-[250px]'
          />
        )}
        <div className='flex gap-x-2'>
          {filters.map((filter) => {
            const column = table.getColumn(filter.columnId)
            if (!column) return null
            return (
              <DataTableFacetedFilter
                key={filter.columnId}
                column={column}
                title={filter.title}
                options={filter.options}
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
              setCompositionValue(null)
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
