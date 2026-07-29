import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, GitCompareArrows, Lightbulb } from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { cn } from '@/lib/utils'
import { useAPI } from '@/hooks/use-api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loading } from '@/components/common/loading'
import { Page } from '@/components/common/page'
import { PageAction } from '@/components/common/page-action'
import { compareExperimentReports } from '../api/scene-experiment-api'
import { buildExperimentReturnHref } from '../lib/experiment-navigation'

const SCORE_DIFFERENCE_THRESHOLD = 0.03

export function ExperimentCompare() {
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
  const compareQuery = useQuery({
    queryKey: ['experiment-compare', $api, projectId, reportIds],
    queryFn: () => compareExperimentReports($api, projectId, reportIds),
    enabled: reportIds.length >= 2,
  })
  const result = compareQuery.data

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-auto'>
        <PageAction showBackButton onBack={() => navigate(returnHref)}>
          <span className='font-medium'>对比分析</span>
        </PageAction>

        {reportIds.length < 2 ? (
          <Alert variant='destructive'>
            <AlertTriangle />
            <AlertTitle>缺少报告</AlertTitle>
            <AlertDescription>
              请返回列表选择同一服务系列的至少两个版本。
            </AlertDescription>
          </Alert>
        ) : null}
        {compareQuery.isLoading ? (
          <Loading text='生成对比分析中...' full />
        ) : null}
        {compareQuery.isError ? (
          <Alert variant='destructive'>
            <AlertTriangle />
            <AlertTitle>无法对比所选报告</AlertTitle>
            <AlertDescription>
              对比分析要求报告均已完成，并属于同一场景和同一服务系列。
            </AlertDescription>
          </Alert>
        ) : null}

        {result ? (
          <>
            <section className='bg-card rounded-lg border p-5'>
              <div className='flex flex-wrap items-start justify-between gap-4'>
                <div>
                  <div className='flex items-center gap-2'>
                    <GitCompareArrows />
                    <h1 className='text-xl font-semibold'>{result.title}</h1>
                  </div>
                  <p className='text-muted-foreground mt-2 text-sm'>
                    横向对比 {result.reports.length} 个版本；相对最佳值差异超过
                    0.03 时高亮差异。
                  </p>
                </div>
                <Badge variant='outline'>同一服务系列</Badge>
              </div>
            </section>

            <section className='bg-card rounded-lg border p-4'>
              <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
                <div>
                  <h2 className='text-sm font-semibold'>Score 横向矩阵</h2>
                  <p className='text-muted-foreground mt-1 text-xs'>
                    高亮差异表示该版本较当前维度最佳值低超过 0.03。
                  </p>
                </div>
                <div className='flex items-center gap-3 text-xs'>
                  <span className='flex items-center gap-1.5'>
                    <span className='bg-success/15 size-3 rounded-sm border' />
                    最佳
                  </span>
                  <span className='flex items-center gap-1.5'>
                    <span className='bg-destructive/10 size-3 rounded-sm border' />
                    高亮差异
                  </span>
                </div>
              </div>
              <Table className='min-w-[760px]'>
                <TableHeader>
                  <TableRow>
                    <TableHead className='min-w-64'>评分维度</TableHead>
                    {result.reports.map((report) => (
                      <TableHead key={report.id} className='min-w-44'>
                        <div className='flex flex-col gap-1 py-2'>
                          <span>{report.webhookSnapshot.name}</span>
                          <span className='text-muted-foreground text-xs font-normal'>
                            v{report.webhookSnapshot.version} ·{' '}
                            {report.runParameters.rounds} 轮
                          </span>
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.scoreRows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell>
                        <p className='font-medium'>{row.label}</p>
                        <p className='text-muted-foreground mt-1 text-xs'>
                          {row.evaluatorName} ·{' '}
                          {row.key.split(':')[row.key.split(':').length - 1]}
                        </p>
                      </TableCell>
                      {result.reports.map((report) => {
                        const value = row.values[report.id] ?? 0
                        const difference = row.bestValue - value
                        const isBest = difference === 0
                        const hasDifference =
                          difference > SCORE_DIFFERENCE_THRESHOLD
                        return (
                          <TableCell
                            key={report.id}
                            className={cn(
                              'font-medium',
                              isBest && 'bg-success/15',
                              hasDifference &&
                                'bg-destructive/10 text-destructive'
                            )}
                          >
                            <div className='flex items-center justify-between gap-3'>
                              <span>{value.toFixed(3)}</span>
                              {hasDifference ? (
                                <Badge variant='destructive'>
                                  -{difference.toFixed(3)}
                                </Badge>
                              ) : isBest ? (
                                <Badge variant='secondary'>最佳</Badge>
                              ) : null}
                            </div>
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>

            <section className='bg-card rounded-lg border p-5'>
              <div className='flex items-center gap-2'>
                <Lightbulb />
                <h2 className='text-sm font-semibold'>对比结论</h2>
              </div>
              <div className='mt-4 grid gap-3 lg:grid-cols-3'>
                {result.insight.map((insight, index) => (
                  <div
                    key={insight}
                    className='bg-muted/40 rounded-lg border p-4 text-sm'
                  >
                    <span className='text-muted-foreground text-xs'>
                      发现 {index + 1}
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
