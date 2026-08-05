import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, GitCompareArrows, Layers3 } from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useAPI } from '@/hooks/use-api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DataTable, DataTableBulkActions } from '@/components/common/data-table'
import { Loading } from '@/components/common/loading'
import {
  getExperimentReport,
  listAllDatasetExperimentReports,
  listAllProjectDatasets,
  listExperimentReportBaselines,
  setExperimentReportBaseline,
} from '../api/scene-experiment-api'
import { buildExperimentAnalysisHref } from '../lib/experiment-navigation'
import {
  canAggregateReports,
  canCompareReports,
  findMatchingBaseline,
} from '../lib/experiment-rules'
import {
  loadProjectExperimentSource,
  queryProjectExperimentReports,
  resolveExperimentReportSelection,
} from '../lib/project-experiment-reports'
import type { ExperimentReport, ProjectExperimentReport } from '../types'
import { ExperimentBaselineDialog } from './experiment-baseline-dialog'
import { createExperimentReportColumns } from './experiment-report-columns'

type ProjectExperimentReportsProps = {
  projectId: string
}

const statusFilterOptions = [
  { label: '排队中', value: 'QUEUED' },
  { label: '运行中', value: 'RUNNING' },
  { label: '评分中', value: 'SCORING' },
  { label: '已完成', value: 'COMPLETED' },
  { label: '失败', value: 'FAILED' },
]

export function ProjectExperimentReports({
  projectId,
}: ProjectExperimentReportsProps) {
  const $api = useAPI()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [baselineReport, setBaselineReport] =
    useState<ProjectExperimentReport | null>(null)
  const sourceQuery = useQuery({
    queryKey: ['project-experiment-source', $api, projectId],
    queryFn: () =>
      loadProjectExperimentSource({
        loadDatasets: () => listAllProjectDatasets($api, projectId),
        loadReports: (datasetId) =>
          listAllDatasetExperimentReports($api, projectId, datasetId),
        loadBaselines: (datasetId) =>
          listExperimentReportBaselines($api, projectId, datasetId),
      }),
    refetchInterval: (query) =>
      query.state.data?.reports.some((report) =>
        ['QUEUED', 'RUNNING', 'SCORING'].includes(report.status)
      )
        ? 1500
        : false,
  })
  const source = sourceQuery.data
  const baselines = useMemo(() => source?.baselines ?? [], [source?.baselines])
  const baselineFailureDatasetIds = useMemo(
    () =>
      new Set(
        (source?.failedDatasets ?? [])
          .filter((failure) => failure.resource === 'baselines')
          .map((failure) => failure.datasetId)
      ),
    [source?.failedDatasets]
  )
  const currentBaseline = baselineReport
    ? findMatchingBaseline(baselines, baselineReport)
    : undefined
  const currentBaselineReportQuery = useQuery({
    queryKey: ['experiment-report', $api, projectId, currentBaseline?.reportId],
    queryFn: () =>
      getExperimentReport($api, projectId, currentBaseline!.reportId),
    enabled: Boolean(
      baselineReport &&
      currentBaseline &&
      currentBaseline.reportId !== baselineReport.id
    ),
  })
  const baselineMutation = useMutation({
    mutationFn: (report: ExperimentReport) =>
      setExperimentReportBaseline($api, projectId, report.id),
    onSuccess: async () => {
      const wasReplacing = Boolean(
        currentBaseline && currentBaseline.reportId !== baselineReport?.id
      )
      setBaselineReport(null)
      toast.success(wasReplacing ? '基线替换成功' : '基线设置成功')
      await queryClient.invalidateQueries({
        queryKey: ['project-experiment-source', $api, projectId],
      })
    },
  })
  const columns = useMemo(
    () =>
      createExperimentReportColumns<ProjectExperimentReport>({
        projectId,
        source: 'project',
        baselines,
        showDataset: true,
        getDatasetName: (report) => report.datasetName,
        getBaselineUnavailableReason: (report) =>
          baselineFailureDatasetIds.has(report.datasetId)
            ? '基线不可用'
            : undefined,
        onSetBaseline: setBaselineReport,
        onCompareBaseline: (report, baseline) => {
          navigate(
            buildExperimentAnalysisHref({
              type: 'compare',
              projectId,
              datasetId: report.datasetId,
              reportIds: [baseline.reportId, report.id],
              source: 'project',
            })
          )
        },
      }),
    [baselineFailureDatasetIds, baselines, navigate, projectId]
  )

  if (sourceQuery.isPending) {
    return <Loading text='加载项目试验报告中...' className='min-h-24' />
  }

  if (sourceQuery.isError || !source) {
    return (
      <Alert variant='destructive'>
        <AlertTriangle />
        <AlertTitle>项目试验报告加载失败</AlertTitle>
        <AlertDescription>
          当前项目的试验报告无法加载，请点击页面刷新后重试。
        </AlertDescription>
      </Alert>
    )
  }

  const reportFailures = source.failedDatasets.filter(
    (failure) => failure.resource === 'reports'
  )
  const allReportsFailed =
    source.datasets.length > 0 &&
    reportFailures.length === source.datasets.length
  const hasPartialFailures =
    !allReportsFailed && source.failedDatasets.length > 0
  const datasetFilterOptions = source.datasets.map((dataset) => ({
    label: dataset.name,
    value: dataset.id,
  }))

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-4'>
      {allReportsFailed ? (
        <Alert variant='destructive'>
          <AlertTriangle />
          <AlertTitle>项目试验报告加载失败</AlertTitle>
          <AlertDescription>
            当前项目全部数据集的试验报告均加载失败，请点击页面刷新后重试。
          </AlertDescription>
        </Alert>
      ) : null}

      {hasPartialFailures ? (
        <Alert>
          <AlertTriangle />
          <AlertTitle>部分数据集报告加载失败</AlertTitle>
          <AlertDescription>
            已保留成功加载的数据，部分数据集的试验报告或基线暂未加载成功。
          </AlertDescription>
        </Alert>
      ) : null}

      {!allReportsFailed ? (
        <DataTable<ProjectExperimentReport>
          className='min-h-0 flex-1'
          columns={columns}
          request={{
            queryKey: (state) => [
              'project-experiment-report-view',
              projectId,
              sourceQuery.dataUpdatedAt,
              source.reports,
              state,
            ],
            queryFn: async (state) =>
              queryProjectExperimentReports(source.reports, state),
            enabled: sourceQuery.isSuccess,
          }}
          urlState={{
            pageKey: 'experimentPage',
            pageSizeKey: 'experimentPageSize',
            globalFilterKey: 'experimentKeyword',
            sortKey: 'experimentSort',
            defaultPageSize: 10,
            filters: [
              { fieldId: 'datasetId', type: 'array' },
              { fieldId: 'status', type: 'array' },
            ],
          }}
          toolbar={{
            searchPlaceholder: '搜索试验、场景、服务或数据集',
            filters: [
              {
                fieldId: 'datasetId',
                title: '数据集',
                options: datasetFilterOptions,
              },
              {
                fieldId: 'status',
                title: '状态',
                options: statusFilterOptions,
              },
            ],
            columnLabels: {
              name: '试验名称',
              datasetName: '数据集',
              service: '远程运行服务',
              status: '状态',
              rounds: '执行轮次',
              scores: '评分结果',
              completedAt: '完成时间',
            },
          }}
          bulkActions={(table, selection) => {
            const selectedReports = table
              .getFilteredSelectedRowModel()
              .rows.map((row) => row.original)
            const resolveReports = () =>
              resolveExperimentReportSelection({
                selectedReports,
                selection,
                loadAllMatching: async (queryState, totalRowCount) =>
                  queryProjectExperimentReports(source.reports, {
                    ...queryState,
                    page: 1,
                    pageSize: Math.max(1, totalRowCount),
                  }).datas,
              })

            return (
              <DataTableBulkActions
                table={table}
                selection={selection}
                entityName='试验报告'
              >
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  onClick={() => {
                    void resolveReports()
                      .then((reports) => {
                        if (!canAggregateReports(reports)) {
                          toast.error(
                            '聚合报告需选择同一数据集、同一次试验的至少两份已完成报告'
                          )
                          return
                        }
                        navigate(
                          buildExperimentAnalysisHref({
                            type: 'aggregate',
                            projectId,
                            datasetId: reports[0].datasetId,
                            reportIds: reports.map((report) => report.id),
                            source: 'project',
                          })
                        )
                      })
                      .catch(() => {
                        toast.error('试验报告选择加载失败，请重试')
                      })
                  }}
                >
                  <Layers3 data-icon='inline-start' />
                  聚合报告
                </Button>
                <Button
                  type='button'
                  size='sm'
                  onClick={() => {
                    void resolveReports()
                      .then((reports) => {
                        const candidates = reports.map((report) => ({
                          status: report.status,
                          datasetId: report.datasetId,
                          sceneId: report.sceneId,
                          serviceFamily: report.webhookSnapshot.serviceFamily,
                        }))
                        if (!canCompareReports(candidates)) {
                          toast.error(
                            '对比分析需选择同一数据集、同一场景、同一服务系列的至少两份已完成报告'
                          )
                          return
                        }
                        navigate(
                          buildExperimentAnalysisHref({
                            type: 'compare',
                            projectId,
                            datasetId: reports[0].datasetId,
                            reportIds: reports.map((report) => report.id),
                            source: 'project',
                          })
                        )
                      })
                      .catch(() => {
                        toast.error('试验报告选择加载失败，请重试')
                      })
                  }}
                >
                  <GitCompareArrows data-icon='inline-start' />
                  对比分析
                </Button>
              </DataTableBulkActions>
            )
          }}
          loadingText={
            <Loading
              text='加载项目试验报告中...'
              className='min-h-24 border-0 bg-transparent'
            />
          }
          emptyText='当前项目暂无场景试验报告'
        />
      ) : null}

      <ExperimentBaselineDialog
        open={Boolean(baselineReport)}
        report={baselineReport}
        currentBaselineReport={currentBaselineReportQuery.data}
        hasCurrentBaseline={Boolean(
          currentBaseline && currentBaseline.reportId !== baselineReport?.id
        )}
        currentBaselinePending={currentBaselineReportQuery.isLoading}
        currentBaselineError={currentBaselineReportQuery.isError}
        pending={baselineMutation.isPending}
        onOpenChange={(open) => {
          if (!open && !baselineMutation.isPending) setBaselineReport(null)
        }}
        onConfirm={() => {
          if (
            baselineReport &&
            !baselineFailureDatasetIds.has(baselineReport.datasetId) &&
            (!currentBaseline ||
              currentBaseline.reportId === baselineReport.id ||
              currentBaselineReportQuery.isSuccess)
          ) {
            baselineMutation.mutate(baselineReport)
          } else if (baselineReport) {
            toast.error('基线加载失败，暂时无法设置基线')
          }
        }}
      />
    </div>
  )
}
