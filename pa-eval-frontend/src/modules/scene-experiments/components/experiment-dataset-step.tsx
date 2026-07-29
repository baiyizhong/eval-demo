import { useCallback, useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import {
  getProjectDataset,
  listProjectDatasets,
} from '@/modules/app-evaluation/api/dataset-api'
import { DatasetTypeBadge } from '@/modules/app-evaluation/components/dataset-type-badge'
import { formatDateTime } from '@/modules/app-evaluation/components/format'
import {
  datasetTypeLabels,
  type DatasetRecord,
  type DatasetTypeFilter,
} from '@/modules/app-evaluation/types'
import { Database, ExternalLink, LockKeyhole } from 'lucide-react'
import { toast } from 'sonner'
import { useAPI } from '@/hooks/use-api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  DataTable,
  DataTableColumnHeader,
  type DataTableToolbarFilter,
} from '@/components/common/data-table'
import { Loading } from '@/components/common/loading'
import { resolveDatasetSelection } from '../lib/experiment-run'

export type LockedExperimentDataset = {
  dataset: DatasetRecord
  activeItemCount: number
}

type ExperimentDatasetStepProps = {
  projectId: string
  selectedDatasetId: string
  lockedDataset?: LockedExperimentDataset
  onSelect: (dataset: DatasetRecord) => void
  onNavigateToDatasetManagement: () => void
}

const datasetTypeFilter: DataTableToolbarFilter = {
  columnId: 'type',
  title: '数据集类型',
  selectionMode: 'single',
  options: [
    { label: datasetTypeLabels.evaluation, value: 'evaluation' },
    { label: datasetTypeLabels.badcase, value: 'badcase' },
    { label: datasetTypeLabels.golden, value: 'golden' },
    { label: datasetTypeLabels.anomaly, value: 'anomaly' },
  ],
}

const datasetColumnLabels = {
  select: '选择',
  name: '名称',
  description: '描述',
  type: '类型',
  itemCount: '数据量',
  updatedAt: '更新时间',
}

export function ExperimentDatasetStep({
  projectId,
  selectedDatasetId,
  lockedDataset,
  onSelect,
  onNavigateToDatasetManagement,
}: ExperimentDatasetStepProps) {
  const $api = useAPI()
  const [selectionStore] = useState(() =>
    createDatasetSelectionStore(selectedDatasetId)
  )
  const handleExplicitSelect = useCallback(
    (dataset: DatasetRecord) => {
      selectionStore.setLatestSelectionId(dataset.id)
      onSelect(dataset)
    },
    [onSelect, selectionStore]
  )
  const columns = useMemo(
    () => createDatasetSelectionColumns(handleExplicitSelect),
    [handleExplicitSelect]
  )

  if (lockedDataset) {
    return <LockedDatasetSummary lockedDataset={lockedDataset} />
  }

  const handleSelectId = async (datasetId: string) => {
    selectionStore.setLatestSelectionId(datasetId)
    try {
      const dataset = await resolveDatasetSelection({
        datasetId,
        currentDatasets: selectionStore.getCurrentDatasets(),
        loadDataset: (id) => getProjectDataset($api, projectId, id),
        isLatestSelection: selectionStore.isLatestSelection,
      })
      if (dataset) onSelect(dataset)
    } catch {
      if (selectionStore.isLatestSelection(datasetId)) {
        toast.error('数据集详情加载失败，请重试')
      }
    }
  }

  return (
    <section className='flex min-w-0 flex-col gap-4'>
      <div>
        <h3 className='font-semibold'>选择数据集</h3>
        <p className='text-muted-foreground mt-1 text-sm'>
          从当前项目中选择一个数据集作为本次试验的数据来源。
        </p>
      </div>
      <RadioGroup value={selectedDatasetId} onValueChange={handleSelectId}>
        <DataTable<DatasetRecord>
          columns={columns}
          enableRowSelection={false}
          request={{
            queryKey: (state) => [
              'experiment-dataset-picker',
              $api,
              projectId,
              selectionStore,
              state,
            ],
            queryFn: async (state) => {
              const result = await listProjectDatasets(
                $api,
                projectId,
                state,
                ((state.filters.type as string[] | undefined)?.[0] ??
                  'all') as DatasetTypeFilter
              )
              selectionStore.setCurrentDatasets(
                new Map(result.datas.map((dataset) => [dataset.id, dataset]))
              )
              return result
            },
          }}
          urlState={{
            pageKey: 'datasetPickerPage',
            pageSizeKey: 'datasetPickerPageSize',
            globalFilterKey: 'datasetPickerKeyword',
            sortKey: 'datasetPickerSort',
            defaultPageSize: 5,
            filters: [
              {
                fieldId: 'type',
                queryKey: 'datasetPickerType',
                type: 'array',
              },
            ],
          }}
          toolbar={{
            searchPlaceholder: '搜索数据集名称或描述',
            filters: [datasetTypeFilter],
            columnLabels: datasetColumnLabels,
          }}
          loadingText={
            <Loading
              text='加载数据集中...'
              className='min-h-24 border-0 bg-transparent'
            />
          }
          emptyText='当前项目暂无数据集'
          errorText='数据集加载失败，请重试'
          minTableWidth={760}
        />
      </RadioGroup>
      <div className='flex justify-end'>
        <Button
          type='button'
          size='sm'
          variant='outline'
          onClick={onNavigateToDatasetManagement}
        >
          <ExternalLink data-icon='inline-start' />
          前往数据集管理
        </Button>
      </div>
    </section>
  )
}

function createDatasetSelectionStore(initialSelectionId: string) {
  let latestSelectionId = initialSelectionId
  let currentDatasets = new Map<string, DatasetRecord>()

  return {
    getCurrentDatasets: () => currentDatasets,
    setCurrentDatasets: (datasets: Map<string, DatasetRecord>) => {
      currentDatasets = datasets
    },
    setLatestSelectionId: (datasetId: string) => {
      latestSelectionId = datasetId
    },
    isLatestSelection: (datasetId: string) => latestSelectionId === datasetId,
  }
}

function createDatasetSelectionColumns(
  onSelect: (dataset: DatasetRecord) => void
): ColumnDef<DatasetRecord>[] {
  return [
    {
      id: 'select',
      header: '选择',
      enableHiding: false,
      cell: ({ row }) => (
        <RadioGroupItem
          id={`experiment-dataset-${row.original.id}`}
          value={row.original.id}
          aria-label={`选择数据集 ${row.original.name}`}
        />
      ),
      meta: { className: 'w-14' },
    },
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='名称' />
      ),
      cell: ({ row }) => (
        <button
          type='button'
          className='block max-w-52 truncate text-left font-medium underline-offset-4 hover:underline'
          onClick={() => onSelect(row.original)}
        >
          {row.original.name}
        </button>
      ),
      enableHiding: false,
      meta: { className: 'w-52 max-w-52' },
    },
    {
      accessorKey: 'description',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='描述' />
      ),
      cell: ({ row }) => (
        <span className='text-muted-foreground block max-w-64 truncate text-xs'>
          {row.original.description?.trim() || '-'}
        </span>
      ),
      meta: { className: 'w-64 max-w-64' },
    },
    {
      accessorKey: 'type',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='类型' />
      ),
      cell: ({ row }) => <DatasetTypeBadge type={row.original.type} />,
    },
    {
      accessorKey: 'itemCount',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='数据量' />
      ),
      cell: ({ row }) => row.original.itemCount,
    },
    {
      accessorKey: 'updatedAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='更新时间' />
      ),
      cell: ({ row }) => formatDateTime(row.original.updatedAt),
    },
  ]
}

function LockedDatasetSummary({
  lockedDataset,
}: {
  lockedDataset: LockedExperimentDataset
}) {
  const { dataset, activeItemCount } = lockedDataset

  return (
    <section className='flex flex-col gap-4'>
      <Alert>
        <LockKeyhole />
        <AlertTitle>当前数据集已锁定</AlertTitle>
        <AlertDescription>
          从数据集详情发起试验时，数据来源固定为当前数据集。
        </AlertDescription>
      </Alert>
      <div className='grid gap-4 rounded-lg border p-5 sm:grid-cols-2'>
        <div className='flex min-w-0 items-start gap-3 sm:col-span-2'>
          <Database className='text-muted-foreground mt-0.5 size-5 shrink-0' />
          <div className='min-w-0'>
            <p className='truncate font-semibold'>{dataset.name}</p>
            <p className='text-muted-foreground mt-1 text-sm'>
              {dataset.description?.trim() || '暂无描述'}
            </p>
          </div>
        </div>
        <DatasetMetric label='类型'>
          <DatasetTypeBadge type={dataset.type} />
        </DatasetMetric>
        <DatasetMetric label='有效数据项' value={`${activeItemCount} 条`} />
        <DatasetMetric label='总数据量' value={`${dataset.itemCount} 条`} />
        <DatasetMetric
          label='最近更新时间'
          value={formatDateTime(dataset.updatedAt)}
        />
      </div>
    </section>
  )
}

function DatasetMetric({
  label,
  value,
  children,
}: {
  label: string
  value?: string
  children?: React.ReactNode
}) {
  return (
    <div className='flex items-center justify-between gap-3 text-sm'>
      <span className='text-muted-foreground'>{label}</span>
      {children ?? <span className='font-medium'>{value}</span>}
    </div>
  )
}
