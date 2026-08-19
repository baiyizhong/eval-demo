import type { ColumnDef, Table } from '@tanstack/react-table'
import { AlertTriangle, UsersRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DataTable,
  DataTableBulkActions,
  DataTableColumnHeader,
  type DataTableListResponse,
  type DataTableQueryState,
  type DataTableSelectionState,
} from '@/components/common/data-table'
import type { FilterGroup } from '@/components/common/filter-panel'
import { Loading } from '@/components/common/loading'
import {
  filterBadcaseItems,
  type BadcaseDatasetCandidate,
  type BadcaseItem,
  type BadcaseStage,
  lifecycleStages,
} from '../../lib/badcase-workbench-prototype'

type BadcaseListPanelProps = {
  dataset: BadcaseDatasetCandidate
  items: BadcaseItem[]
  activeStage: BadcaseStage | 'all'
  selectedItemId: string
  onItemSelect: (itemId: string) => void
  onRetestAction: (item: BadcaseItem) => void | Promise<void>
  onBatchAction: (action: string, itemIds: string[]) => void | Promise<void>
}

const priorityClassName = {
  P0: 'border-destructive/30 bg-destructive/10 text-destructive',
  P1: 'border-warning/30 bg-warning/10 text-warning',
  P2: 'border-info/30 bg-info/10 text-info',
} satisfies Record<BadcaseItem['priority'], string>

const stageClassName = {
  PENDING_CONFIRM: 'border-info/30 bg-info/10 text-info',
  PENDING_ROOT_CAUSE: 'border-warning/30 bg-warning/10 text-warning',
  FIXING: 'border-primary/30 bg-primary/10 text-primary',
  PENDING_RETEST: 'border-muted-foreground/30 bg-muted text-muted-foreground',
  PENDING_VERIFY: 'border-success/30 bg-success/10 text-success',
  CLOSED: 'border-border bg-muted text-muted-foreground',
} satisfies Record<BadcaseStage, string>

export function BadcaseListPanel({
  dataset,
  items,
  activeStage,
  selectedItemId,
  onItemSelect,
  onRetestAction,
  onBatchAction,
}: BadcaseListPanelProps) {
  const columns = buildBadcaseColumns(
    selectedItemId,
    onItemSelect,
    onRetestAction
  )
  const owners = [...new Set(items.map((item) => item.owner))]
  const failureTypes = [...new Set(items.map((item) => item.failureType))]
  const stageOptions = lifecycleStages.map((stage) => ({
    label: stage.label,
    value: stage.value,
  }))
  const filterGroups: FilterGroup[] = [
    {
      id: 'ownership',
      label: '责任与优先级',
      defaultOpen: true,
      fields: [
        {
          id: 'priority',
          type: 'checkbox',
          label: '优先级',
          options: ['P0', 'P1', 'P2'].map((value) => ({
            label: value,
            value,
          })),
        },
        {
          id: 'owner',
          type: 'checkbox',
          label: '责任人',
          options: owners.map((value) => ({ label: value, value })),
        },
      ],
    },
    {
      id: 'classification',
      label: '状态与问题分类',
      defaultOpen: true,
      fields: [
        {
          id: 'stage',
          type: 'checkbox',
          label: '生命周期状态',
          options: stageOptions,
        },
        {
          id: 'failureType',
          type: 'checkbox',
          label: '失败类型',
          options: failureTypes.map((value) => ({ label: value, value })),
        },
        {
          id: 'overdue',
          type: 'tags',
          label: 'SLA 状态',
          options: [{ label: '只看逾期', value: 'true' }],
        },
        {
          id: 'regression',
          type: 'tags',
          label: '回归候选',
          options: [{ label: '已加入回归候选', value: 'true' }],
        },
      ],
    },
  ]

  return (
    <section className='flex min-h-[560px] min-w-0 flex-1 flex-col p-4 xl:min-h-0'>
      <div className='mb-4'>
        <h2 className='text-base font-semibold'>Badcase 列表</h2>
      </div>

      <DataTable<BadcaseItem, DataTableListResponse<BadcaseItem>>
        className='min-h-0 flex-1'
        columns={columns}
        minTableWidth={860}
        request={{
          queryKey: (state) => [
            'badcase-workbench-items',
            dataset.id,
            activeStage,
            items,
            state,
          ],
          queryFn: (state) => listBadcases(items, activeStage, state),
        }}
        urlState={{
          defaultPageSize: 10,
          globalFilterKey: 'keyword',
          filters: [
            { fieldId: 'priority', type: 'array' },
            { fieldId: 'stage', type: 'array' },
            { fieldId: 'owner', type: 'array' },
            { fieldId: 'failureType', type: 'array' },
            { fieldId: 'overdue', type: 'array' },
            { fieldId: 'regression', type: 'array' },
          ],
        }}
        filterPanel={{
          title: 'Badcase 筛选',
          groups: filterGroups,
          width: 300,
          advanceFilterCollapsed: true,
        }}
        toolbar={{
          searchPlaceholder: '搜索 ID、Trace、标题或根因',
          filters: [
            {
              fieldId: 'priority',
              title: '优先级',
              options: ['P0', 'P1', 'P2'].map((value) => ({
                label: value,
                value,
              })),
            },
            {
              fieldId: 'stage',
              title: '状态',
              options: stageOptions,
            },
            {
              fieldId: 'owner',
              title: '责任人',
              options: owners.map((value) => ({ label: value, value })),
            },
          ],
          columnLabels: {
            select: '选择',
            title: 'Badcase',
            priority: '优先级',
            stage: '状态',
            owner: '责任人',
            fixDueAt: 'SLA',
            updatedAt: '更新时间',
            actions: '操作',
          },
        }}
        bulkActions={(table, selection) => (
          <BadcaseBulkActions
            table={table}
            selection={selection}
            onAction={onBatchAction}
          />
        )}
        loadingText={
          <Loading
            text='加载 badcase 中...'
            className='min-h-24 border-0 bg-transparent'
          />
        }
        emptyText='当前条件下没有 badcase'
      />
    </section>
  )
}

function buildBadcaseColumns(
  selectedItemId: string,
  onItemSelect: (itemId: string) => void,
  onRetestAction: (item: BadcaseItem) => void | Promise<void>
): ColumnDef<BadcaseItem>[] {
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label='选择当前页全部 badcase'
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={`选择 ${row.original.id}`}
        />
      ),
      enableSorting: false,
      enableHiding: false,
      meta: { className: 'w-10' },
    },
    {
      id: 'title',
      accessorKey: 'title',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Badcase' />
      ),
      cell: ({ row }) => (
        <Button
          variant='link'
          className={cn(
            'h-auto max-w-80 flex-col items-start gap-1 px-0 text-left',
            selectedItemId === row.original.id && 'font-semibold'
          )}
          onClick={() => onItemSelect(row.original.id)}
        >
          <span className='w-full truncate'>{row.original.title}</span>
          <span className='text-muted-foreground font-mono text-xs font-normal'>
            {row.original.id}
          </span>
        </Button>
      ),
    },
    {
      accessorKey: 'priority',
      header: '优先级',
      cell: ({ row }) => (
        <Badge
          variant='outline'
          className={priorityClassName[row.original.priority]}
        >
          {row.original.priority}
        </Badge>
      ),
    },
    {
      accessorKey: 'stage',
      header: '状态',
      cell: ({ row }) => (
        <Badge variant='outline' className={stageClassName[row.original.stage]}>
          {stageLabel(row.original.stage)}
        </Badge>
      ),
    },
    {
      accessorKey: 'owner',
      header: '责任人',
      cell: ({ row }) => (
        <span className='inline-flex items-center gap-1.5 whitespace-nowrap'>
          <UsersRound className='text-muted-foreground size-3.5' />
          {row.original.owner}
        </span>
      ),
    },
    {
      accessorKey: 'fixDueAt',
      header: 'SLA',
      cell: ({ row }) =>
        row.original.overdueMinutes > 0 ? (
          <span className='text-destructive inline-flex items-center gap-1 whitespace-nowrap'>
            <AlertTriangle className='size-3.5' />
            逾期 {row.original.overdueMinutes}m
          </span>
        ) : (
          <span className='whitespace-nowrap'>{row.original.fixDueAt}</span>
        ),
    },
    {
      accessorKey: 'updatedAt',
      header: '更新时间',
      cell: ({ row }) => (
        <span className='whitespace-nowrap'>{row.original.updatedAt}</span>
      ),
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => (
        <Button
          variant='outline'
          size='sm'
          className='h-8 whitespace-nowrap'
          onClick={() => void onRetestAction(row.original)}
        >
          发起复测
        </Button>
      ),
      enableSorting: false,
      enableHiding: false,
      meta: { className: 'w-24' },
    },
  ]
}

function BadcaseBulkActions({
  table,
  selection,
  onAction,
}: {
  table: Table<BadcaseItem>
  selection: DataTableSelectionState<BadcaseItem>
  onAction: (action: string, itemIds: string[]) => void | Promise<void>
}) {
  const itemIds = table
    .getFilteredSelectedRowModel()
    .rows.map((row) => row.original.id)

  const runAction = async (action: string) => {
    await onAction(action, itemIds)
    selection.clearSelection()
  }

  return (
    <DataTableBulkActions
      table={table}
      selection={selection}
      entityName='Badcase'
    >
      <Button
        variant='outline'
        size='sm'
        onClick={() => void runAction('批量指派')}
      >
        批量指派
      </Button>
      <Button
        variant='outline'
        size='sm'
        onClick={() => void runAction('加入回归候选')}
      >
        加入回归
      </Button>
    </DataTableBulkActions>
  )
}

async function listBadcases(
  items: BadcaseItem[],
  activeStage: BadcaseStage | 'all',
  state: DataTableQueryState
): Promise<DataTableListResponse<BadcaseItem>> {
  const stageFilters = normalizeArray(state.filters.stage) as BadcaseStage[]
  const filtered = filterBadcaseItems(items, {
    keyword: state.keyword,
    stage: activeStage,
    priorities: normalizeArray(
      state.filters.priority
    ) as BadcaseItem['priority'][],
    owners: normalizeArray(state.filters.owner),
    failureTypes: normalizeArray(state.filters.failureType),
    overdueOnly: normalizeArray(state.filters.overdue).includes('true'),
  }).filter(
    (item) =>
      (!stageFilters.length || stageFilters.includes(item.stage)) &&
      (!normalizeArray(state.filters.regression).includes('true') ||
        item.regressionCandidate)
  )
  const start = (state.page - 1) * state.pageSize

  return {
    total: filtered.length,
    datas: filtered.slice(start, start + state.pageSize),
  }
}

function normalizeArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string' && value) return [value]
  return []
}

function stageLabel(stage: BadcaseStage) {
  return lifecycleStages.find((item) => item.value === stage)?.label ?? stage
}
