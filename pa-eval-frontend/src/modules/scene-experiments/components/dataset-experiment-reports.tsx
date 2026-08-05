import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GitCompareArrows, Layers3 } from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useAPI } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { DataTable, DataTableBulkActions } from '@/components/common/data-table'
import { Loading } from '@/components/common/loading'
import {
  getExperimentReport,
  listAllMatchingDatasetExperimentReports,
  listDatasetExperimentReports,
  listExperimentReportBaselines,
  setExperimentReportBaseline,
} from '../api/scene-experiment-api'
import { buildExperimentAnalysisHref } from '../lib/experiment-navigation'
import {
  canAggregateReports,
  canCompareReports,
  findMatchingBaseline,
} from '../lib/experiment-rules'
import { resolveExperimentReportSelection } from '../lib/project-experiment-reports'
import type { ExperimentReport } from '../types'
import { ExperimentBaselineDialog } from './experiment-baseline-dialog'
import { createExperimentReportColumns } from './experiment-report-columns'

type DatasetExperimentReportsProps = {
  projectId: string
  datasetId: string
}

export function DatasetExperimentReports({
  projectId,
  datasetId,
}: DatasetExperimentReportsProps) {
  const $api = useAPI()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [baselineReport, setBaselineReport] = useState<ExperimentReport | null>(
    null
  )
  const baselinesQuery = useQuery({
    queryKey: ['experiment-report-baselines', $api, projectId, datasetId],
    queryFn: () => listExperimentReportBaselines($api, projectId, datasetId),
    enabled: Boolean(datasetId),
  })
  const baselines = useMemo(
    () => baselinesQuery.data ?? [],
    [baselinesQuery.data]
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
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['experiment-report-baselines', $api, projectId, datasetId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['dataset-experiment-reports', $api, projectId, datasetId],
        }),
      ])
    },
  })
  const columns = useMemo(
    () =>
      createExperimentReportColumns<ExperimentReport>({
        projectId,
        source: 'dataset',
        baselines,
        getBaselineUnavailableReason: () =>
          baselinesQuery.isPending
            ? '基线加载中'
            : baselinesQuery.isError
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
              source: 'dataset',
            })
          )
        },
      }),
    [
      baselines,
      baselinesQuery.isError,
      baselinesQuery.isPending,
      navigate,
      projectId,
    ]
  )

  return (
    <>
      <DataTable<ExperimentReport>
        className='min-h-0 flex-1'
        columns={columns}
        request={{
          queryKey: (state) => [
            'dataset-experiment-reports',
            $api,
            projectId,
            datasetId,
            state,
          ],
          queryFn: (state) =>
            listDatasetExperimentReports($api, projectId, datasetId, state),
          enabled: Boolean(datasetId),
          refetchInterval: 1500,
        }}
        urlState={{
          pageKey: 'reportPage',
          pageSizeKey: 'reportPageSize',
          globalFilterKey: 'reportKeyword',
          defaultPageSize: 10,
        }}
        toolbar={{
          searchPlaceholder: '搜索试验名称或远程运行服务',
          columnLabels: {
            name: '试验名称',
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
              loadAllMatching: (queryState, totalRowCount) =>
                listAllMatchingDatasetExperimentReports(
                  $api,
                  projectId,
                  datasetId,
                  queryState,
                  totalRowCount
                ),
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
                          '聚合报告需选择同一次试验的至少两份已完成报告'
                        )
                        return
                      }
                      navigate(
                        buildExperimentAnalysisHref({
                          type: 'aggregate',
                          projectId,
                          datasetId,
                          reportIds: reports.map((report) => report.id),
                          source: 'dataset',
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
                          '对比分析需选择同一场景、同一服务系列的至少两份已完成报告'
                        )
                        return
                      }
                      navigate(
                        buildExperimentAnalysisHref({
                          type: 'compare',
                          projectId,
                          datasetId,
                          reportIds: reports.map((report) => report.id),
                          source: 'dataset',
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
            text='加载试验报告中...'
            className='min-h-24 border-0 bg-transparent'
          />
        }
        emptyText='当前数据集暂无试验报告'
      />
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
          if (baselinesQuery.isError) {
            toast.error('基线加载失败，暂时无法设置基线')
            return
          }
          if (
            baselineReport &&
            (!currentBaseline ||
              currentBaseline.reportId === baselineReport.id ||
              currentBaselineReportQuery.isSuccess)
          ) {
            baselineMutation.mutate(baselineReport)
          }
        }}
      />
    </>
  )
}
