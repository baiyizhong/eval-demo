import { useQuery } from '@tanstack/react-query'
import { formatDateTime } from '@/modules/app-evaluation/components/format'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ServerCog,
} from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MixEditor } from '@/components/common/MixEditor'
import { Loading } from '@/components/common/loading'
import { Page } from '@/components/common/page'
import { PageAction } from '@/components/common/page-action'
import { getExperimentReport } from '../api/scene-experiment-api'
import { ExperimentStatusBadge } from '../components/experiment-status-badge'
import { buildExperimentReturnHref } from '../lib/experiment-navigation'
import type { ExperimentReport } from '../types'

export function ExperimentReportDetail() {
  const $api = useAPI()
  const navigate = useNavigate()
  const { projectId = 'proj_a', datasetId = '', reportId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const returnHref = buildExperimentReturnHref({
    projectId,
    datasetId,
    source: searchParams.get('source'),
  })
  const reportQuery = useQuery({
    queryKey: ['experiment-report', $api, projectId, reportId],
    queryFn: () => getExperimentReport($api, projectId, reportId),
    enabled: Boolean(reportId),
    refetchInterval: (query) =>
      ['QUEUED', 'RUNNING', 'SCORING'].includes(query.state.data?.status ?? '')
        ? 1500
        : false,
  })
  const report = reportQuery.data

  return (
    <Page fixed fluid className='flex min-h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-auto'>
        <PageAction showBackButton onBack={() => navigate(returnHref)}>
          <span className='font-medium'>服务级试验报告</span>
        </PageAction>

        {reportQuery.isLoading ? (
          <Loading text='加载试验报告中...' full />
        ) : null}
        {reportQuery.isError ? (
          <Alert variant='destructive'>
            <AlertTriangle />
            <AlertTitle>报告加载失败</AlertTitle>
            <AlertDescription>请返回报告列表后重试。</AlertDescription>
          </Alert>
        ) : null}

        {report ? (
          <>
            <ReportHero report={report} />
            <OverviewMetrics report={report} />

            <Tabs defaultValue='scores' className='min-h-0'>
              <TabsList>
                <TabsTrigger value='scores'>评分结果</TabsTrigger>
                <TabsTrigger value='rounds'>多轮稳定性</TabsTrigger>
                <TabsTrigger value='items'>样本结果</TabsTrigger>
                <TabsTrigger value='failures'>失败调用</TabsTrigger>
              </TabsList>
              <TabsContent value='scores'>
                <ScoreResults report={report} />
              </TabsContent>
              <TabsContent value='rounds'>
                <RoundStability report={report} />
              </TabsContent>
              <TabsContent value='items'>
                <ItemResults report={report} />
              </TabsContent>
              <TabsContent value='failures'>
                <FailureResults report={report} />
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </div>
    </Page>
  )
}

function ReportHero({ report }: { report: ExperimentReport }) {
  return (
    <section className='bg-card rounded-lg border p-5'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <h1 className='text-xl font-semibold'>{report.name}</h1>
            <ExperimentStatusBadge status={report.status} />
          </div>
          <p className='text-muted-foreground mt-2 text-sm'>
            {report.sceneSnapshot.name} · {report.webhookSnapshot.name} · v
            {report.webhookSnapshot.version}
          </p>
        </div>
        <div className='text-muted-foreground text-right text-xs'>
          <p>创建于 {formatDateTime(report.createdAt)}</p>
          <p className='mt-1'>报告 ID：{report.id}</p>
        </div>
      </div>
      {report.status === 'FAILED' && report.failureReason ? (
        <Alert variant='destructive' className='mt-4'>
          <AlertTriangle />
          <AlertTitle>试验执行失败</AlertTitle>
          <AlertDescription>{report.failureReason}</AlertDescription>
        </Alert>
      ) : null}
      {['QUEUED', 'RUNNING', 'SCORING'].includes(report.status) ? (
        <div className='mt-4 flex flex-col gap-2'>
          <div className='flex items-center justify-between gap-3 text-xs'>
            <span className='text-muted-foreground'>当前进度</span>
            <span className='font-medium'>{report.progress}%</span>
          </div>
          <div
            className='bg-muted h-2 overflow-hidden rounded-full'
            role='progressbar'
            aria-label='场景试验执行进度'
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={report.progress}
          >
            <div
              className='bg-primary h-full rounded-full transition-[width]'
              style={{ width: `${report.progress}%` }}
            />
          </div>
        </div>
      ) : null}
    </section>
  )
}

function OverviewMetrics({ report }: { report: ExperimentReport }) {
  const averageScore = report.scoreResults.length
    ? report.scoreResults.reduce((sum, score) => sum + score.value, 0) /
      report.scoreResults.length
    : 0
  const metrics = [
    {
      label: '综合评分',
      value: report.status === 'COMPLETED' ? averageScore.toFixed(3) : '-',
      icon: Activity,
    },
    {
      label: '执行轮次',
      value: `${report.runParameters.rounds} 轮`,
      icon: Clock3,
    },
    {
      label: '成功样本',
      value: `${report.successfulItemCount} / ${report.itemCount}`,
      icon: CheckCircle2,
    },
    {
      label: 'Webhook',
      value: report.webhookSnapshot.name,
      icon: ServerCog,
    },
  ]

  return (
    <section className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
      {metrics.map(({ label, value, icon: Icon }) => (
        <div key={label} className='bg-card rounded-lg border p-4'>
          <div className='text-muted-foreground flex items-center gap-2 text-xs'>
            <Icon />
            {label}
          </div>
          <p className='mt-2 truncate text-lg font-semibold'>{value}</p>
        </div>
      ))}
    </section>
  )
}

function ScoreResults({ report }: { report: ExperimentReport }) {
  return (
    <section className='bg-card rounded-lg border p-4'>
      <div className='grid gap-3 lg:grid-cols-2 xl:grid-cols-3'>
        {report.scoreResults.map((score) => (
          <div key={score.key} className='rounded-lg border p-4'>
            <div className='flex items-start justify-between gap-3'>
              <div className='min-w-0'>
                <p className='truncate font-medium'>{score.scoreName}</p>
                <p className='text-muted-foreground mt-1 text-xs'>
                  {score.evaluatorName} · {score.variableName}
                </p>
              </div>
              <Badge variant='outline'>
                σ {score.standardDeviation.toFixed(3)}
              </Badge>
            </div>
            <p className='mt-5 text-3xl font-semibold'>
              {score.value.toFixed(3)}
            </p>
            <div className='bg-muted mt-3 h-1.5 overflow-hidden rounded-full'>
              <div
                className='bg-primary h-full rounded-full'
                style={{
                  width: `${Math.max(0, Math.min(100, score.value * 100))}%`,
                }}
              />
            </div>
          </div>
        ))}
        {report.scoreResults.length === 0 ? (
          <p className='text-muted-foreground text-sm'>评分结果尚未生成。</p>
        ) : null}
      </div>
    </section>
  )
}

function RoundStability({ report }: { report: ExperimentReport }) {
  return (
    <section className='bg-card rounded-lg border p-4'>
      <div className='mb-4'>
        <h2 className='text-sm font-semibold'>多轮稳定性</h2>
        <p className='text-muted-foreground mt-1 text-xs'>
          每轮评分均值用于观察执行波动，最终分取有效轮次均值。
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>执行轮次</TableHead>
            <TableHead>成功 / 失败</TableHead>
            {report.scoreResults.map((score) => (
              <TableHead key={score.key}>{score.scoreName}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.roundResults.map((round) => (
            <TableRow key={round.round}>
              <TableCell className='font-medium'>第 {round.round} 轮</TableCell>
              <TableCell>
                {round.successCount} / {round.failureCount}
              </TableCell>
              {report.scoreResults.map((score) => (
                <TableCell key={score.key}>
                  {(round.scores[score.key] ?? 0).toFixed(3)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {report.roundResults.length === 0 ? (
        <p className='text-muted-foreground py-8 text-center text-sm'>
          轮次结果尚未生成。
        </p>
      ) : null}
    </section>
  )
}

function ItemResults({ report }: { report: ExperimentReport }) {
  return (
    <section className='flex flex-col gap-3'>
      {report.itemResults.map((item) => (
        <div key={item.itemId} className='bg-card rounded-lg border p-4'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div className='flex items-center gap-2'>
              <span className='font-medium'>{item.itemId}</span>
              <Badge
                variant={item.status === 'PASSED' ? 'secondary' : 'destructive'}
              >
                {item.status === 'PASSED' ? '成功' : '失败'}
              </Badge>
            </div>
            <div className='flex flex-wrap gap-1.5'>
              {report.scoreResults.map((score) => (
                <Badge key={score.key} variant='outline'>
                  {score.scoreName} {(item.scores[score.key] ?? 0).toFixed(3)}
                </Badge>
              ))}
            </div>
          </div>
          <div className='mt-4 grid gap-3 lg:grid-cols-3'>
            <MixEditor
              title='Input'
              value={item.input}
              readOnly
              showEditButton={false}
              editorMinHeight={140}
              editorMaxHeight={240}
            />
            <MixEditor
              title='Expected Output'
              value={item.expectedOutput}
              readOnly
              showEditButton={false}
              editorMinHeight={140}
              editorMaxHeight={240}
            />
            <MixEditor
              title='Webhook Output'
              value={item.output}
              readOnly
              showEditButton={false}
              editorMinHeight={140}
              editorMaxHeight={240}
            />
          </div>
        </div>
      ))}
      {report.itemResults.length === 0 ? (
        <section className='bg-card text-muted-foreground rounded-lg border p-8 text-center text-sm'>
          样本结果尚未生成。
        </section>
      ) : null}
    </section>
  )
}

function FailureResults({ report }: { report: ExperimentReport }) {
  const failedItems = report.itemResults.filter(
    (item) => item.status === 'FAILED'
  )
  return (
    <section className='bg-card rounded-lg border p-4'>
      <h2 className='text-sm font-semibold'>失败调用</h2>
      <div className='mt-3 flex flex-col gap-3'>
        {failedItems.map((item) => (
          <Alert key={item.itemId} variant='destructive'>
            <AlertTriangle />
            <AlertTitle>{item.itemId}</AlertTitle>
            <AlertDescription>
              {item.failureReason || '调用失败'}
            </AlertDescription>
          </Alert>
        ))}
        {failedItems.length === 0 ? (
          <div className='text-muted-foreground flex items-center gap-2 py-6 text-sm'>
            <CheckCircle2 />
            本次试验没有失败调用。
          </div>
        ) : null}
      </div>
    </section>
  )
}
