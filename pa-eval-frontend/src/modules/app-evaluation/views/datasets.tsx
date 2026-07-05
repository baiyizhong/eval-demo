import { useCallback, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { useAPI } from '@/hooks/use-api'
import { Page } from '@/components/common/page'
import {
  DataTable,
  type DataTableQueryState,
} from '@/components/common/data-table'
import { Loading } from '@/components/common/loading'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { listProjectDatasets } from '../api/dataset-api'
import { createDatasetColumns } from '../components/dataset-columns'
import { EvaluationPageNav } from '../components/evaluation-page-nav'
import {
  datasetTypeLabels,
  type DatasetRecord,
  type DatasetTypeFilter,
} from '../types'

const datasetTabs: { label: string; value: DatasetTypeFilter }[] = [
  { label: '全部', value: 'all' },
  { label: datasetTypeLabels.evaluation, value: 'evaluation' },
  { label: datasetTypeLabels.badcase, value: 'badcase' },
  { label: datasetTypeLabels.golden, value: 'golden' },
  { label: datasetTypeLabels.anomaly, value: 'anomaly' },
]

export function ProjectDatasets() {
  const { projectId = 'project_customer_agent' } = useParams()
  const $api = useAPI()
  const queryClient = useQueryClient()
  const [activeType, setActiveType] = useState<DatasetTypeFilter>('all')

  const invalidateDatasets = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: ['project-datasets', projectId],
      }),
    [projectId, queryClient]
  )

  const columns = useMemo(
    () =>
      createDatasetColumns({
        projectId,
        readOnly: true,
      }),
    [projectId]
  )

  const handleRefresh = async () => {
    await invalidateDatasets()
    toast.success('数据集已刷新')
  }

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <EvaluationPageNav
          buttonGroups={{
            buttons: [
              {
                id: 'refresh',
                label: '刷新',
                icon: RefreshCw,
                iconPosition: 'start',
                variant: 'outline',
                size: 'sm',
                onClick: () => void handleRefresh(),
              },
            ],
          }}
        />
        <Tabs
          value={activeType}
          onValueChange={(value) => setActiveType(value as DatasetTypeFilter)}
          className='min-h-0 flex-1'
        >
          <TabsList className='shrink-0'>
            {datasetTabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <section className='flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border bg-card p-4 text-card-foreground'>
            <DataTable<DatasetRecord>
              className='min-h-0 flex-1'
              columns={columns}
              request={{
                queryKey: (state: DataTableQueryState) => [
                  'project-datasets',
                  $api,
                  projectId,
                  activeType,
                  state,
                ],
                queryFn: (state) =>
                  listProjectDatasets($api, projectId, state, activeType),
              }}
              urlState={{
                defaultPageSize: 10,
                globalFilterKey: 'keyword',
              }}
              toolbar={{
                searchPlaceholder: '按数据集名称搜索',
                columnLabels: {
                  name: '名称',
                  description: '描述',
                  type: '类型',
                  itemCount: '数据量',
                  runCount: '运行数',
                  createdAt: '创建时间',
                  updatedAt: '更新时间',
                },
              }}
              loadingText={
                <Loading
                  text='加载数据集中...'
                  className='min-h-24 border-0 bg-transparent'
                />
              }
              emptyText='当前项目下暂无匹配的数据集'
              minTableWidth={1080}
            />
          </section>
        </Tabs>
      </div>
    </Page>
  )
}
