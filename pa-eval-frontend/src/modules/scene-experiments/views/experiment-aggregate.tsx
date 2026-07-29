import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Award, Lightbulb, Rows3 } from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useAPI } from '@/hooks/use-api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Loading } from '@/components/common/loading'
import { Page } from '@/components/common/page'
import { PageAction } from '@/components/common/page-action'
import { aggregateExperimentReports } from '../api/scene-experiment-api'
import { buildExperimentReturnHref } from '../lib/experiment-navigation'

export function ExperimentAggregate() {
  const $api = useAPI()
  const navigate = useNavigate()
  const { projectId = 'proj_a', datasetId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const returnHref = buildExperimentReturnHref({
    projectId,
    datasetId,
    source: searchParams.get('source'),
  })
  const reportIds = useMemo(
    () =>
      (searchParams.get('reportIds') ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    [searchParams]
  )
  const aggregateQuery = useQuery({
    queryKey: ['experiment-aggregate', $api, projectId, reportIds],
    queryFn: () => aggregateExperimentReports($api, projectId, reportIds),
    enabled: reportIds.length >= 2,
  })
  const result = aggregateQuery.data
  const scoreKeys = useMemo(
    () =>
      Array.from(
        new Set(
          result?.reports.flatMap((report) =>
            report.scoreResults.map((score) => score.key)
          ) ?? []
        )
      ),
    [result]
  )

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-auto'>
        <PageAction showBackButton onBack={() => navigate(returnHref)}>
          <span className='font-medium'>聚合报告</span>
        </PageAction>

        {reportIds.length < 2 ? (
          <Alert variant='destructive'>
            <AlertTriangle />
            <AlertTitle>缺少报告</AlertTitle>
            <AlertDescription>
              请返回列表选择同一次试验的至少两份已完成报告。
            </AlertDescription>
          </Alert>
        ) : null}
        {aggregateQuery.isLoading ? (
          <Loading text='生成聚合报告中...' full />
        ) : null}
        {aggregateQuery.isError ? (
          <Alert variant='destructive'>
            <AlertTriangle />
            <AlertTitle>无法聚合所选报告</AlertTitle>
            <AlertDescription>
              聚合报告要求所选结果均已完成并属于同一次试验。
            </AlertDescription>
          </Alert>
        ) : null}

        {result ? (
          <>
            <section className='bg-card rounded-lg border p-5'>
              <div className='flex flex-wrap items-start justify-between gap-4'>
                <div>
                  <h1 className='text-xl font-semibold'>{result.title}</h1>
                  <p className='text-muted-foreground mt-2 text-sm'>
                    聚合 {result.reports.length} 个 Webhook 服务的完整试验结果
                  </p>
                </div>
                <Badge variant='outline'>同一试验组</Badge>
              </div>
            </section>

            <section className='grid gap-3 sm:grid-cols-3'>
              <Metric
                icon={<Rows3 />}
                label='服务数量'
                value={`${result.reports.length} 个`}
              />
              <Metric
                icon={<Award />}
                label='最佳服务'
                value={
                  result.reports.find(
                    (report) => report.id === result.bestReportId
                  )?.webhookSnapshot.name ?? '-'
                }
              />
              <Metric
                icon={<AlertTriangle />}
                label='差异样本'
                value={`${result.differenceItemCount} 条`}
              />
            </section>

            <section className='bg-card rounded-lg border p-5'>
              <div className='mb-4'>
                <h2 className='text-sm font-semibold'>服务综合评分</h2>
                <p className='text-muted-foreground mt-1 text-xs'>
                  评分为所选评估器输出变量的均值。
                </p>
              </div>
              <div className='grid gap-3 lg:grid-cols-2 xl:grid-cols-3'>
                {result.reports.map((report) => {
                  const average = averageReportScore(report.scoreResults)
                  const best = report.id === result.bestReportId
                  return (
                    <div key={report.id} className='rounded-lg border p-4'>
                      <div className='flex items-start justify-between gap-3'>
                        <div>
                          <p className='font-medium'>
                            {report.webhookSnapshot.name}
                          </p>
                          <p className='text-muted-foreground mt-1 text-xs'>
                            v{report.webhookSnapshot.version} ·{' '}
                            {report.runParameters.rounds} 轮
                          </p>
                        </div>
                        {best ? <Badge>最佳</Badge> : null}
                      </div>
                      <p className='mt-5 text-3xl font-semibold'>
                        {average.toFixed(3)}
                      </p>
                      <div className='bg-muted mt-3 h-2 overflow-hidden rounded-full'>
                        <div
                          className='bg-primary h-full rounded-full'
                          style={{ width: `${average * 100}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className='bg-card rounded-lg border p-5'>
              <h2 className='text-sm font-semibold'>Score 维度分布</h2>
              <div className='mt-4 flex flex-col gap-5'>
                {scoreKeys.map((key) => {
                  const score = result.reports
                    .flatMap((report) => report.scoreResults)
                    .find((item) => item.key === key)
                  return (
                    <div key={key}>
                      <div className='mb-2'>
                        <p className='font-medium'>{score?.scoreName ?? key}</p>
                        <p className='text-muted-foreground text-xs'>
                          {score?.evaluatorName} · {score?.variableName}
                        </p>
                      </div>
                      <div className='grid gap-2'>
                        {result.reports.map((report) => {
                          const value =
                            report.scoreResults.find((item) => item.key === key)
                              ?.value ?? 0
                          return (
                            <div
                              key={report.id}
                              className='grid items-center gap-2 sm:grid-cols-[12rem_minmax(0,1fr)_3.5rem]'
                            >
                              <span className='truncate text-xs'>
                                {report.webhookSnapshot.name}
                              </span>
                              <div className='bg-muted h-2 overflow-hidden rounded-full'>
                                <div
                                  className='bg-primary h-full rounded-full'
                                  style={{ width: `${value * 100}%` }}
                                />
                              </div>
                              <span className='text-right text-xs font-medium'>
                                {value.toFixed(3)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className='bg-card rounded-lg border p-5'>
              <div className='flex items-center gap-2'>
                <Lightbulb />
                <h2 className='text-sm font-semibold'>智能聚合结论</h2>
              </div>
              <div className='mt-4 grid gap-3 lg:grid-cols-3'>
                {result.insight.map((insight, index) => (
                  <div
                    key={insight}
                    className='bg-muted/40 rounded-lg border p-4 text-sm'
                  >
                    <span className='text-muted-foreground text-xs'>
                      结论 {index + 1}
                    </span>
                    <p className='mt-2 leading-6'>{insight}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </Page>
  )
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className='bg-card rounded-lg border p-4'>
      <div className='text-muted-foreground flex items-center gap-2 text-xs'>
        {icon}
        {label}
      </div>
      <p className='mt-2 truncate text-lg font-semibold'>{value}</p>
    </div>
  )
}

function averageReportScore(scores: { value: number }[]) {
  if (!scores.length) return 0
  return scores.reduce((sum, score) => sum + score.value, 0) / scores.length
}
