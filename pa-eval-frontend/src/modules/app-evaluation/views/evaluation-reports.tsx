import { useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { useAPI } from '@/hooks/use-api'
import {
  DataTable,
  type DataTableFilterBinding,
  type DataTableToolbarFilter,
} from '@/components/common/data-table'
import { Loading } from '@/components/common/loading'
import { Page } from '@/components/common/page'
import {
  deleteProjectEvaluationReport,
  exportProjectEvaluationReport,
  listProjectEvaluationReports,
} from '../api/evaluation-report-api'
import { EvaluationPageNav } from '../components/evaluation-page-nav'
import { createEvaluationReportColumns } from '../components/evaluation-report-columns'
import type { EvaluationReportRecord } from '../types'

const reportUrlFilters: DataTableFilterBinding[] = [
  { fieldId: 'sourceType', type: 'array' },
  { fieldId: 'status', type: 'array' },
  { fieldId: 'hasBadcase', type: 'array' },
]

const reportToolbarFilters: DataTableToolbarFilter[] = [
  {
    columnId: 'sourceType',
    title: '来源类型',
    options: [
      { label: '自动评测', value: 'AUTO_EVAL' },
      { label: '人工标注', value: 'MANUAL_ANNOTATION' },
    ],
  },
  {
    columnId: 'status',
    title: '报告状态',
    options: [
      { label: '生成中', value: 'GENERATING' },
      { label: '已生成', value: 'READY' },
      { label: '生成失败', value: 'FAILED' },
    ],
  },
  {
    columnId: 'hasBadcase',
    title: 'Badcase',
    options: [
      { label: '存在 badcase', value: 'true' },
      { label: '无 badcase', value: 'false' },
    ],
  },
]

export function ProjectEvaluationReports() {
  const { projectId = 'project_customer_agent' } = useParams()
  const $api = useAPI()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const invalidateReports = useCallback(async () => {
    await queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'project-evaluation-reports' &&
        query.queryKey.includes(projectId),
    })
    await queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'project-auto-evaluation' &&
        query.queryKey.includes(projectId),
    })
    await queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'project-auto-evaluation-latest-report' &&
        query.queryKey.includes(projectId),
    })
  }, [projectId, queryClient])

  const columns = useMemo(
    () =>
      createEvaluationReportColumns({
        projectId,
        onExport: (report) => void handleExport($api, projectId, report),
        onRegenerate: (report) =>
          void handleRegenerate(report, invalidateReports),
        onFlowback: (report) =>
          navigate(
            `/projects/${projectId}/evaluation/reports/${report.id}?tab=badcases`
          ),
        onViewUnavailable: (report) =>
          toast.warning(
            report.status === 'GENERATING'
              ? '报告仍在生成中，请稍后刷新'
              : '报告生成失败，重新生成后再查看'
          ),
        onDelete: (report) =>
          void handleDelete($api, projectId, report, invalidateReports),
      }),
    [$api, invalidateReports, navigate, projectId]
  )

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        <EvaluationPageNav />
        <section className='bg-card text-card-foreground flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border p-4'>
          <DataTable<EvaluationReportRecord>
            className='min-h-0 flex-1'
            columns={columns}
            request={{
              queryKey: (state) => [
                'project-evaluation-reports',
                $api,
                projectId,
                state,
              ],
              queryFn: (state) =>
                listProjectEvaluationReports($api, projectId, state),
            }}
            urlState={{
              defaultPageSize: 10,
              globalFilterKey: 'keyword',
              filters: reportUrlFilters,
            }}
            toolbar={{
              searchPlaceholder: '搜索报告标题或来源任务',
              filters: reportToolbarFilters,
              columnLabels: {
                title: '报告标题',
                sourceType: '来源',
                sourceTaskName: '来源任务',
                status: '状态',
                sampleCount: '样本数',
                badcaseCount: 'Badcase',
                flowbackCount: '已回流',
                generatedAt: '生成时间',
              },
            }}
            loadingText={
              <Loading
                text='加载评测报告中...'
                className='min-h-24 border-0 bg-transparent'
              />
            }
            emptyText='当前项目下暂无匹配的评测报告'
            minTableWidth={1200}
          />
        </section>
      </div>
    </Page>
  )
}

async function handleExport(
  api: Parameters<typeof exportProjectEvaluationReport>[0],
  projectId: string,
  report: EvaluationReportRecord
) {
  const exported = await exportProjectEvaluationReport(
    api,
    projectId,
    report.id,
    'markdown'
  )
  const blob = new Blob([exported.content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = exported.filename
  link.click()
  URL.revokeObjectURL(url)
  toast.success(`已导出报告：${report.title}`)
}

async function handleRegenerate(
  report: EvaluationReportRecord,
  onCompleted: () => Promise<unknown>
) {
  const confirmed = await confirm({
    title: '重新生成评测报告',
    desc: `将基于 mock 报告数据重新生成「${report.title}」。确定继续吗？`,
    confirmText: '重新生成',
  })
  if (!confirmed) return
  await onCompleted()
  toast.success('评测报告已刷新')
}

async function handleDelete(
  api: Parameters<typeof deleteProjectEvaluationReport>[0],
  projectId: string,
  report: EvaluationReportRecord,
  onCompleted: () => Promise<unknown>
) {
  const confirmed = await confirm({
    title: '删除评测报告',
    desc: `删除后将隐藏「${report.title}」及其关联明细和 Badcase，不会删除原始数据集和评测任务。确定继续吗？`,
    confirmText: '删除',
    destructive: true,
  })
  if (!confirmed) return
  await deleteProjectEvaluationReport(api, projectId, report.id)
  await onCompleted()
  toast.success('评测报告已删除')
}
