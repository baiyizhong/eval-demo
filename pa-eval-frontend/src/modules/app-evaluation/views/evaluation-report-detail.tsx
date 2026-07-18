import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, RefreshCw } from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { confirm } from '@/lib/confirm'
import { useAPI } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loading } from '@/components/common/loading'
import { Page } from '@/components/common/page'
import { PageAction } from '@/components/common/page-action'
import {
  exportProjectEvaluationReport,
  getProjectEvaluationReport,
} from '../api/evaluation-report-api'
import { EvaluationReportAnalysis } from '../components/evaluation-report-analysis'
import { EvaluationReportBadcaseTable } from '../components/evaluation-report-badcase-table'
import { EvaluationReportSourceBadge } from '../components/evaluation-report-source-badge'
import { EvaluationReportStatusBadge } from '../components/evaluation-report-status-badge'
import { EvaluationReportSummary } from '../components/evaluation-report-summary'

export function ProjectEvaluationReportDetail() {
  const { projectId = 'project_customer_agent', reportId = '' } = useParams()
  const $api = useAPI()
  const { can } = usePermission({ type: 'project', projectId })
  const canEditReport = can('project:evaluation-report:edit')
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const reportQuery = useQuery({
    queryKey: ['project-evaluation-report', $api, projectId, reportId],
    queryFn: () => getProjectEvaluationReport($api, projectId, reportId),
    enabled: Boolean(reportId),
  })

  const invalidateReport = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['project-evaluation-report', projectId, reportId],
    })
    await queryClient.invalidateQueries({
      queryKey: ['project-evaluation-reports', projectId],
    })
    await queryClient.invalidateQueries({
      queryKey: ['project-evaluation-report-badcases', projectId, reportId],
    })
  }

  const report = reportQuery.data
  const activeTab = searchParams.get('tab') ?? 'overview'
  const sections = report?.reportTemplateSnapshot?.sections
  const showBadcases = sections?.badcases ?? true

  const handleExport = async () => {
    if (!report) return
    const exported = await exportProjectEvaluationReport(
      $api,
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

  const handleRegenerate = async () => {
    if (!canEditReport) return
    if (!report) return
    const confirmed = await confirm({
      title: '重新生成评测报告',
      desc: `将刷新「${report.title}」的报告数据。确定继续吗？`,
      confirmText: '重新生成',
    })
    if (!confirmed) return
    await invalidateReport()
    toast.success('评测报告已刷新')
  }

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-auto'>
        <PageAction
          showBackButton
          onBack={() => navigate(`/projects/${projectId}/evaluation/reports`)}
          buttonGroups={{
            buttons: [
              {
                id: 'export',
                label: '导出报告',
                icon: Download,
                iconPosition: 'start',
                variant: 'outline',
                size: 'sm',
                disabled: !report || report.status !== 'READY',
                onClick: () => void handleExport(),
              },
              ...(canEditReport
                ? [
                    {
                      id: 'regenerate',
                      label: '重新生成',
                      icon: RefreshCw,
                      iconPosition: 'start' as const,
                      variant: 'outline' as const,
                      size: 'sm' as const,
                      disabled: !report,
                      onClick: () => void handleRegenerate(),
                    },
                  ]
                : []),
            ],
          }}
        />
        {reportQuery.isLoading ? (
          <Loading text='加载评测报告中...' full />
        ) : report ? (
          <>
            <section className='bg-card text-card-foreground rounded-lg border p-4'>
              <div className='flex flex-wrap items-center gap-3'>
                <h1 className='text-xl font-semibold'>{report.title}</h1>
                <EvaluationReportSourceBadge sourceType={report.sourceType} />
                <EvaluationReportStatusBadge status={report.status} />
              </div>
              <p className='text-muted-foreground mt-2 text-sm'>
                来源任务：{report.sourceTaskName} · 样本 {report.sampleCount} ·
                Badcase {report.badcaseCount}
              </p>
            </section>
            <Tabs
              value={activeTab}
              onValueChange={(value) => setSearchParams({ tab: value })}
              className='min-h-0 flex-1'
            >
              <TabsList>
                <TabsTrigger value='overview'>概览</TabsTrigger>
                <TabsTrigger value='analysis'>分析</TabsTrigger>
                {showBadcases ? (
                  <TabsTrigger value='badcases'>Badcase</TabsTrigger>
                ) : null}
              </TabsList>
              <TabsContent value='overview'>
                <EvaluationReportSummary report={report} />
              </TabsContent>
              <TabsContent value='analysis'>
                <EvaluationReportAnalysis report={report} />
              </TabsContent>
              <TabsContent value='badcases' className='min-h-0'>
                <EvaluationReportBadcaseTable
                  projectId={projectId}
                  reportId={reportId}
                  reportTitle={report.title}
                  canEdit={canEditReport}
                />
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <section className='bg-card text-card-foreground rounded-lg border p-4'>
            评测报告不存在
          </section>
        )}
      </div>
    </Page>
  )
}
