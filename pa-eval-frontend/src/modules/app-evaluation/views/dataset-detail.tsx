import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { useAPI } from '@/hooks/use-api'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { PageAction } from '@/components/common/page-action'
import { Page } from '@/components/common/page'
import {
  DataTable,
  type DataTableFilterBinding,
  type DataTableToolbarFilter,
} from '@/components/common/data-table'
import { Loading } from '@/components/common/loading'
import {
  getProjectDataset,
  getProjectDatasetMetricSummary,
  listProjectDatasetItems,
} from '../api/dataset-api'
import { createDatasetItemColumns } from '../components/dataset-item-columns'
import { DatasetTypeBadge } from '../components/dataset-type-badge'
import { formatDateTime } from '../components/format'
import type { DatasetItemRecord } from '../types'

const itemUrlFilters: DataTableFilterBinding[] = [
  { fieldId: 'status', type: 'array' },
]

const itemToolbarFilters: DataTableToolbarFilter[] = [
  {
    columnId: 'status',
    title: '状态',
    options: [
      { label: 'ACTIVE', value: 'ACTIVE' },
      { label: 'ARCHIVED', value: 'ARCHIVED' },
    ],
  },
]

export function ProjectDatasetDetail() {
  const navigate = useNavigate()
  const $api = useAPI()
  const {
    projectId = 'project_customer_agent',
    datasetId = '',
  } = useParams()

  const datasetQuery = useQuery({
    queryKey: ['project-dataset', $api, projectId, datasetId],
    queryFn: () => getProjectDataset($api, projectId, datasetId),
    enabled: Boolean(datasetId),
  })
  const metricQuery = useQuery({
    queryKey: ['project-dataset-metrics', $api, projectId, datasetId],
    queryFn: () => getProjectDatasetMetricSummary($api, projectId, datasetId),
    enabled: Boolean(datasetId),
  })

  const columns = useMemo(
    () =>
      createDatasetItemColumns({
        readOnly: true,
      }),
    []
  )

  const dataset = datasetQuery.data
  const metrics = metricQuery.data

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <PageAction
          showBackButton
          onBack={() => navigate(`/projects/${projectId}/evaluation/datasets`)}
        >
          {dataset ? (
            <div className='flex min-w-0 flex-wrap items-center gap-2'>
              <span className='truncate text-sm font-medium'>{dataset.name}</span>
              <DatasetTypeBadge type={dataset.type} />
            </div>
          ) : null}
        </PageAction>

        {datasetQuery.isLoading || metricQuery.isLoading ? (
          <Loading text='加载数据集详情中...' className='flex-1' />
        ) : null}

        {dataset && metrics ? (
          <>
            <section className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
              <MetricCard title='总数据量' value={String(metrics.total)} />
              <MetricCard title='ACTIVE 数量' value={String(metrics.active)} />
              <MetricCard
                title='ARCHIVED 数量'
                value={String(metrics.archived)}
              />
              <MetricCard
                title='最近更新时间'
                value={formatDateTime(metrics.updatedAt)}
              />
            </section>
            <section className='rounded-lg border bg-card p-4 text-card-foreground'>
              <div className='flex flex-wrap items-center gap-x-8 gap-y-3 text-sm'>
                <InfoItem label='名称' value={dataset.name} />
                <InfoItem label='描述' value={dataset.description || '-'} wide />
                <InfoItem
                  label='类型'
                  value={<DatasetTypeBadge type={dataset.type} />}
                />
                <InfoItem label='运行数' value={String(dataset.runCount)} />
                <InfoItem
                  label='创建时间'
                  value={formatDateTime(dataset.createdAt)}
                />
              </div>
            </section>
          </>
        ) : null}

        <section className='flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border bg-card p-4 text-card-foreground'>
          <DataTable<DatasetItemRecord>
            className='min-h-0 flex-1'
            columns={columns}
            request={{
              queryKey: (state) => [
                'project-dataset-items',
                $api,
                projectId,
                datasetId,
                state,
              ],
              queryFn: (state) =>
                listProjectDatasetItems($api, projectId, datasetId, state),
              enabled: Boolean(datasetId),
            }}
            urlState={{
              defaultPageSize: 10,
              globalFilterKey: 'keyword',
              filters: itemUrlFilters,
            }}
            toolbar={{
              searchPlaceholder: '搜索 item id / JSON 内容',
              filters: itemToolbarFilters,
              columnLabels: {
                id: 'Item ID',
                status: '状态',
                input: 'Input',
                expectedOutput: 'Expected Output',
                metadata: 'Metadata',
                sourceTraceId: 'Source',
                createdAt: '创建时间',
              },
            }}
            enableRowSelection={false}
            loadingText={
              <Loading
                text='加载数据项中...'
                className='min-h-24 border-0 bg-transparent'
              />
            }
            emptyText='当前筛选条件下暂无数据项'
            minTableWidth={1280}
          />
        </section>
      </div>
    </Page>
  )
}

function MetricCard({
  title,
  value,
}: {
  title: string
  value: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-muted-foreground text-sm font-normal'>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='text-xl font-semibold'>{value}</div>
      </CardContent>
    </Card>
  )
}

function InfoItem({
  label,
  value,
  wide,
}: {
  label: string
  value: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className={wide ? 'flex min-w-64 max-w-xl items-center gap-2' : 'flex items-center gap-2'}>
      <span className='text-muted-foreground shrink-0'>{label}</span>
      <span className='min-w-0 truncate font-medium'>{value}</span>
    </div>
  )
}
