import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type OnChangeFn,
  type PaginationState,
  type SortingState,
  type Table as ReactTable,
  type VisibilityState,
} from '@tanstack/react-table'
import { useSearchParams } from 'react-router'
import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  FilterPanel,
  type FilterGroup,
  type FilterPanelProps,
  type FilterRendererMap,
  type FilterValues,
} from '@/components/common/filter-panel'
import { getDataTableRootClassName } from './layout'
import { DataTablePagination } from './pagination'
import { DataTableProvider, useOptionalDataTableContext } from './provider'
import { DataTableToolbar } from './toolbar'

export type DataTableListResponse<TData> = {
  total: number
  datas: TData[]
}

export type DataTableQueryState = {
  page: number
  pageSize: number
  keyword: string
  filters: Record<string, unknown>
  sorting: SortingState
}

export type DataTableFilterBinding = {
  fieldId: string
  queryKey?: string
  columnId?: string
  type: 'string' | 'array' | 'json'
}

export type DataTableToolbarFilter = {
  columnId: string
  title: string
  options: {
    label: string
    value: string
    icon?: React.ComponentType<{ className?: string }>
  }[]
}

type DataTableRequestConfig<TData, TResponse> = {
  queryKey:
    readonly unknown[] | ((state: DataTableQueryState) => readonly unknown[])
  queryFn: (state: DataTableQueryState) => Promise<TResponse>
  enabled?: boolean
  selectRows?: (response: TResponse) => TData[]
  selectTotal?: (response: TResponse) => number
}

type DataTableUrlStateConfig = {
  pageKey?: string
  pageSizeKey?: string
  globalFilterKey?: string
  sortKey?: string
  defaultPageSize?: number
  filters?: DataTableFilterBinding[]
}

type DataTableFilterPanelConfig = {
  groups: FilterGroup[]
  renderers?: FilterRendererMap
  title?: string
  searchPlaceholder?: string
  width?: number | string
  maxHeight?: number | string
  collapsed?: boolean
  advanceFilterCollapsed?: boolean
  defaultOpenGroupIds?: string[]
  className?: string
}

type DataTableToolbarConfig = {
  searchPlaceholder?: string
  filters?: DataTableToolbarFilter[]
  columnLabels?: Record<string, string>
}

type DataTableProviderConfig<
  TAction extends string,
  TContext extends object,
> = {
  enabled?: boolean
  context?: TContext
  initialOpen?: TAction | null
}

export type DataTableProps<
  TData,
  TResponse = DataTableListResponse<TData>,
  TAction extends string = string,
  TContext extends object = Record<string, never>,
> = {
  columns: ColumnDef<TData>[]
  request: DataTableRequestConfig<TData, TResponse>
  urlState?: DataTableUrlStateConfig
  filterPanel?: DataTableFilterPanelConfig
  toolbar?: DataTableToolbarConfig
  provider?: DataTableProviderConfig<TAction, TContext>
  bulkActions?: (table: ReactTable<TData>) => ReactNode
  enableRowSelection?: boolean
  emptyText?: string
  errorText?: string
  loadingText?: ReactNode
  minTableWidth?: number | string
  className?: string
  tableClassName?: string
}

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_SIZE = 10

export function DataTable<
  TData,
  TResponse = DataTableListResponse<TData>,
  TAction extends string = string,
  TContext extends object = Record<string, never>,
>(props: DataTableProps<TData, TResponse, TAction, TContext>) {
  const existingProvider = useOptionalDataTableContext()

  if (props.provider?.enabled && !existingProvider) {
    return (
      <DataTableProvider<TData, TAction, TContext>
        context={props.provider.context}
        initialOpen={props.provider.initialOpen}
      >
        <DataTableContent {...props} />
      </DataTableProvider>
    )
  }

  return <DataTableContent {...props} />
}

function DataTableContent<
  TData,
  TResponse = DataTableListResponse<TData>,
  TAction extends string = string,
  TContext extends object = Record<string, never>,
>({
  columns,
  request,
  urlState,
  filterPanel,
  toolbar,
  bulkActions,
  enableRowSelection = true,
  emptyText = '暂无结果。',
  errorText = '数据加载失败。',
  loadingText = '正在加载数据...',
  minTableWidth = 900,
  className,
  tableClassName,
}: DataTableProps<TData, TResponse, TAction, TContext>) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [filterPanelCollapsed, setFilterPanelCollapsed] = useState(
    filterPanel?.advanceFilterCollapsed ?? true
  )
  const [rowSelection, setRowSelection] = useState({})
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})

  const pageKey = urlState?.pageKey ?? 'page'
  const pageSizeKey = urlState?.pageSizeKey ?? 'pageSize'
  const globalFilterKey = urlState?.globalFilterKey ?? 'filter'
  const sortKey = urlState?.sortKey ?? 'sort'
  const defaultPageSize = urlState?.defaultPageSize ?? DEFAULT_PAGE_SIZE
  const filterBindings = useMemo(
    () => urlState?.filters ?? [],
    [urlState?.filters]
  )
  const page = parsePositiveInt(searchParams.get(pageKey), DEFAULT_PAGE)
  const pageSize = parsePositiveInt(
    searchParams.get(pageSizeKey),
    defaultPageSize
  )
  const keyword = searchParams.get(globalFilterKey) ?? ''
  const sorting = useMemo(
    () => parseSorting(searchParams.get(sortKey)),
    [searchParams, sortKey]
  )
  const filters = useMemo(
    () => readFiltersFromSearchParams(searchParams, filterBindings),
    [filterBindings, searchParams]
  )
  const columnFilters = useMemo<ColumnFiltersState>(
    () => buildColumnFilters(filters, filterBindings),
    [filterBindings, filters]
  )
  const pagination = useMemo<PaginationState>(
    () => ({ pageIndex: page - 1, pageSize }),
    [page, pageSize]
  )
  const filterPanelValue = useMemo<FilterValues>(
    () => ({
      [globalFilterKey]: keyword,
      ...filters,
    }),
    [filters, globalFilterKey, keyword]
  )
  const queryState = useMemo<DataTableQueryState>(
    () => ({
      page,
      pageSize,
      keyword,
      filters,
      sorting,
    }),
    [filters, keyword, page, pageSize, sorting]
  )
  const queryKey = useMemo(
    () =>
      typeof request.queryKey === 'function'
        ? request.queryKey(queryState)
        : [...request.queryKey, queryState],
    [queryState, request]
  )
  const query = useQuery({
    queryKey,
    queryFn: () => request.queryFn(queryState),
    enabled: request.enabled ?? true,
    placeholderData: keepPreviousData,
  })

  useEffect(() => {
    setRowSelection({})
  }, [page, pageSize])

  const rows = useMemo(
    () => selectResponseRows(query.data, request.selectRows),
    [query.data, request.selectRows]
  )
  const total = useMemo(
    () => selectResponseTotal(query.data, request.selectTotal),
    [query.data, request.selectTotal]
  )
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  const updateSearchParams = (
    updater: (nextParams: URLSearchParams) => void
  ) => {
    const nextParams = new URLSearchParams(searchParams)
    updater(nextParams)
    setSearchParams(nextParams, { replace: true })
  }

  const resetPage = (nextParams: URLSearchParams) => {
    nextParams.delete(pageKey)
  }

  const onGlobalFilterChange: OnChangeFn<unknown> = (updater) => {
    const nextValue = typeof updater === 'function' ? updater(keyword) : updater
    updateSearchParams((nextParams) => {
      updateStringParam(nextParams, globalFilterKey, nextValue)
      resetPage(nextParams)
    })
  }

  const onColumnFiltersChange: OnChangeFn<ColumnFiltersState> = (updater) => {
    const next =
      typeof updater === 'function' ? updater(columnFilters) : updater
    updateSearchParams((nextParams) => {
      filterBindings.forEach((binding) => {
        const queryKey = binding.queryKey ?? binding.fieldId
        const columnId = binding.columnId ?? binding.fieldId
        const filter = next.find((item) => item.id === columnId)

        if (binding.type === 'array') {
          updateListParam(nextParams, queryKey, filter?.value)
          return
        }
        if (binding.type === 'json') {
          updateJsonParam(nextParams, queryKey, filter?.value)
          return
        }

        updateStringParam(nextParams, queryKey, filter?.value)
      })
      resetPage(nextParams)
    })
  }

  const onPaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const next = typeof updater === 'function' ? updater(pagination) : updater
    updateSearchParams((nextParams) => {
      updateNumberParam(nextParams, pageKey, next.pageIndex + 1, DEFAULT_PAGE)
      updateNumberParam(nextParams, pageSizeKey, next.pageSize, defaultPageSize)
    })
  }

  const onSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater
    updateSearchParams((nextParams) => {
      updateStringParam(nextParams, sortKey, serializeSorting(next))
      resetPage(nextParams)
    })
  }

  const handleFilterPanelChange: FilterPanelProps['onChange'] = (
    nextValues
  ) => {
    updateSearchParams((nextParams) => {
      updateStringParam(
        nextParams,
        globalFilterKey,
        nextValues[globalFilterKey]
      )
      filterBindings.forEach((binding) => {
        const queryKey = binding.queryKey ?? binding.fieldId
        const value = nextValues[binding.fieldId]

        if (binding.type === 'array') {
          updateListParam(nextParams, queryKey, value)
          return
        }
        if (binding.type === 'json') {
          updateJsonParam(nextParams, queryKey, value)
          return
        }

        updateStringParam(nextParams, queryKey, value)
      })
      resetPage(nextParams)
    })
  }

  const handleResetFilters = () => {
    updateSearchParams((nextParams) => {
      nextParams.delete(globalFilterKey)
      filterBindings.forEach((binding) => {
        nextParams.delete(binding.queryKey ?? binding.fieldId)
      })
      resetPage(nextParams)
    })
  }

  const table = useReactTable({
    data: rows,
    columns,
    pageCount,
    state: {
      rowSelection,
      columnVisibility,
      columnFilters,
      globalFilter: keyword,
      pagination,
      sorting,
    },
    enableRowSelection,
    manualPagination: true,
    manualFiltering: true,
    manualSorting: true,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnFiltersChange,
    onGlobalFilterChange,
    onPaginationChange,
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  const isFilterPanelCollapsed = filterPanel?.collapsed ?? filterPanelCollapsed

  return (
    <div
      className={cn(
        getDataTableRootClassName({
          hasFilterPanel: Boolean(filterPanel),
          isFilterPanelCollapsed,
        }),
        className
      )}
    >
      {filterPanel ? (
        <FilterPanel
          groups={filterPanel.groups}
          value={filterPanelValue}
          onChange={handleFilterPanelChange}
          renderers={filterPanel.renderers}
          title={filterPanel.title}
          searchPlaceholder={filterPanel.searchPlaceholder}
          width={filterPanel.width}
          maxHeight={filterPanel.maxHeight}
          collapsed={isFilterPanelCollapsed}
          defaultOpenGroupIds={filterPanel.defaultOpenGroupIds}
          className={cn('shrink-0', filterPanel.className)}
        />
      ) : null}

      <div
        className={cn(
          'max-sm:has-[div[role="toolbar"]]:mb-16',
          'flex min-h-0 min-w-0 flex-1 flex-col gap-4'
        )}
      >
        <DataTableToolbar
          table={table}
          searchPlaceholder={toolbar?.searchPlaceholder}
          filterPanelCollapsed={isFilterPanelCollapsed}
          onToggleFilterPanel={
            filterPanel
              ? () => setFilterPanelCollapsed((collapsed) => !collapsed)
              : undefined
          }
          onReset={handleResetFilters}
          filters={toolbar?.filters}
          columnLabels={toolbar?.columnLabels}
        />

        <div className='min-h-0 flex-1 overflow-x-auto rounded-md border'>
          <Table
            className={cn(tableClassName)}
            style={{ minWidth: normalizeWidth(minTableWidth) }}
          >
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      className={cn(
                        header.column.columnDef.meta?.className,
                        header.column.columnDef.meta?.thClassName
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {query.isLoading ? (
                <TableMessage colSpan={columns.length}>
                  {loadingText}
                </TableMessage>
              ) : query.isError ? (
                <TableMessage colSpan={columns.length}>
                  {errorText}
                </TableMessage>
              ) : table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          cell.column.columnDef.meta?.className,
                          cell.column.columnDef.meta?.tdClassName
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableMessage colSpan={columns.length}>
                  {emptyText}
                </TableMessage>
              )}
            </TableBody>
          </Table>
        </div>

        <DataTablePagination table={table} className='mt-auto' />
        {bulkActions ? bulkActions(table) : null}
      </div>
    </div>
  )
}

function TableMessage({
  colSpan,
  children,
}: {
  colSpan: number
  children: ReactNode
}) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className='h-24 text-center'>
        {children}
      </TableCell>
    </TableRow>
  )
}

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function readFiltersFromSearchParams(
  searchParams: URLSearchParams,
  bindings: DataTableFilterBinding[]
) {
  return bindings.reduce<Record<string, unknown>>((filters, binding) => {
    const queryKey = binding.queryKey ?? binding.fieldId
    if (binding.type === 'array') {
      filters[binding.fieldId] = searchParams.getAll(queryKey)
      return filters
    }
    if (binding.type === 'json') {
      filters[binding.fieldId] = parseJsonFilterParam(searchParams.get(queryKey))
      return filters
    }
    filters[binding.fieldId] = searchParams.get(queryKey) ?? ''
    return filters
  }, {})
}

function buildColumnFilters(
  filters: Record<string, unknown>,
  bindings: DataTableFilterBinding[]
) {
  return bindings.reduce<ColumnFiltersState>((columnFilters, binding) => {
    const value = filters[binding.fieldId]
    const columnId = binding.columnId ?? binding.fieldId

    if (binding.type === 'array') {
      if (Array.isArray(value) && value.length > 0) {
        columnFilters.push({ id: columnId, value })
      }
      return columnFilters
    }

    if (typeof value === 'string' && value.trim() !== '') {
      columnFilters.push({ id: columnId, value })
    }

    return columnFilters
  }, [])
}

function updateStringParam(
  searchParams: URLSearchParams,
  key: string,
  value: unknown
) {
  const nextValue = typeof value === 'string' ? value.trim() : ''

  if (nextValue) {
    searchParams.set(key, nextValue)
    return
  }

  searchParams.delete(key)
}

function updateListParam(
  searchParams: URLSearchParams,
  key: string,
  value: unknown
) {
  searchParams.delete(key)

  if (!Array.isArray(value)) {
    return
  }

  value
    .filter((item): item is string => typeof item === 'string' && item !== '')
    .forEach((item) => searchParams.append(key, item))
}

function updateJsonParam(
  searchParams: URLSearchParams,
  key: string,
  value: unknown
) {
  if (value === undefined || value === null || value === '') {
    searchParams.delete(key)
    return
  }

  if (Array.isArray(value) && value.length === 0) {
    searchParams.delete(key)
    return
  }

  searchParams.set(key, JSON.stringify(value))
}

function parseJsonFilterParam(value: string | null) {
  if (!value) {
    return []
  }
  try {
    return JSON.parse(value)
  } catch {
    return []
  }
}

function updateNumberParam(
  searchParams: URLSearchParams,
  key: string,
  value: number,
  defaultValue: number
) {
  if (value === defaultValue) {
    searchParams.delete(key)
    return
  }

  searchParams.set(key, String(value))
}

function parseSorting(value: string | null): SortingState {
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map((item) => {
      const [id, direction] = item.split(':')
      if (!id) {
        return null
      }
      return { id, desc: direction === 'desc' }
    })
    .filter((item): item is SortingState[number] => Boolean(item))
}

function serializeSorting(sorting: SortingState) {
  return sorting
    .map((item) => `${item.id}:${item.desc ? 'desc' : 'asc'}`)
    .join(',')
}

function normalizeWidth(width: number | string) {
  return typeof width === 'number' ? `${width}px` : width
}

function selectResponseRows<TData, TResponse>(
  response: TResponse | undefined,
  selectRows?: (response: TResponse) => TData[]
) {
  if (!response) {
    return []
  }

  if (selectRows) {
    return selectRows(response)
  }

  return ((response as unknown as DataTableListResponse<TData>).datas ??
    []) as TData[]
}

function selectResponseTotal<TResponse>(
  response: TResponse | undefined,
  selectTotal?: (response: TResponse) => number
) {
  if (!response) {
    return 0
  }

  if (selectTotal) {
    return selectTotal(response)
  }

  return (response as unknown as DataTableListResponse<unknown>).total ?? 0
}
