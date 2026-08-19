import { useState, type ComponentProps } from 'react'
import { ExternalLink, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MixEditor } from '@/components/common/MixEditor'
import { BaseDetail } from '@/components/common/base-detail'
import { Drawer } from '@/components/common/drawer'
import {
  lifecycleStages,
  type BadcaseItem,
  type BadcasePrimaryTransitionInput,
  type BadcaseStage,
} from '../../lib/badcase-workbench-prototype'
import { BadcaseStageForm } from './badcase-stage-form'

type BadcaseDetailPanelProps = {
  item: BadcaseItem | undefined
  onPrimaryAction: (input: BadcasePrimaryTransitionInput) => void
  onSecondaryAction: (action: string) => void
}

export function BadcaseDetailPanel({
  item,
  onPrimaryAction,
  onSecondaryAction,
}: BadcaseDetailPanelProps) {
  const [sourceDrawerOpen, setSourceDrawerOpen] = useState(false)

  if (!item) {
    return (
      <section className='flex min-h-[560px] items-center justify-center p-6'>
        <div className='text-center'>
          <ShieldCheck className='text-muted-foreground mx-auto size-9' />
          <h2 className='mt-3 text-sm font-semibold'>没有可处理的 badcase</h2>
          <p className='text-muted-foreground mt-1 text-xs'>
            调整筛选条件或选择其他生命周期状态。
          </p>
        </div>
      </section>
    )
  }

  return (
    <>
      <section className='flex min-h-[560px] min-w-0 flex-col xl:min-h-0'>
        <div className='shrink-0 border-b p-4'>
          <div className='flex items-start justify-between gap-3'>
            <div className='min-w-0'>
              <div className='text-muted-foreground font-mono text-xs'>
                {item.id}
              </div>
              <h2 className='mt-1 line-clamp-2 text-base font-semibold'>
                {item.title}
              </h2>
            </div>
            <div className='flex shrink-0 gap-1.5'>
              <Badge
                variant='outline'
                className={cn(
                  item.priority === 'P0' && 'text-destructive',
                  item.priority === 'P1' && 'text-warning'
                )}
              >
                {item.priority}
              </Badge>
              <Badge variant='secondary'>{stageLabel(item.stage)}</Badge>
            </div>
          </div>
        </div>

        <Tabs defaultValue='form' className='min-h-0 flex-1 gap-0'>
          <div className='shrink-0 px-4 pt-2'>
            <TabsList className='h-10 w-full justify-start gap-5 overflow-x-auto rounded-none border-b bg-transparent p-0'>
              {detailTabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className='text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none'
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value='form' className='mt-0 min-h-0 overflow-auto p-4'>
            <BadcaseStageForm
              item={item}
              onSubmit={onPrimaryAction}
              onSecondaryAction={onSecondaryAction}
            />
          </TabsContent>
          <TabsContent
            value='context'
            className='mt-0 min-h-0 overflow-auto p-4'
          >
            <TraceContextTab
              item={item}
              onViewSource={() => setSourceDrawerOpen(true)}
            />
          </TabsContent>
          <TabsContent
            value='attribution'
            className='mt-0 min-h-0 overflow-auto p-4'
          >
            <AttributionTab item={item} />
          </TabsContent>
          <TabsContent
            value='fixRetest'
            className='mt-0 min-h-0 overflow-auto p-4'
          >
            <FixRetestTab item={item} />
          </TabsContent>
          <TabsContent
            value='history'
            className='mt-0 min-h-0 overflow-auto p-4'
          >
            <HistoryTab item={item} />
          </TabsContent>
        </Tabs>
      </section>

      <Drawer
        open={sourceDrawerOpen}
        onOpenChange={setSourceDrawerOpen}
        title={`Trace 详情 · ${item.sourceTraceId}`}
        mode='enhanced'
        showConfirm={false}
        cancelText='关闭'
      >
        <div className='grid gap-4'>
          <MixEditor
            title='Source'
            value={{
              traceId: item.sourceTraceId,
              observationId: item.sourceObservationId,
              badcaseId: item.id,
              source: `${item.sourceTraceId} / ${item.sourceObservationId}`,
            }}
            readOnly
            showEditButton={false}
          />
          <MixEditor
            title='Input'
            value={tracePayload(item).input}
            readOnly
            showEditButton={false}
          />
          <MixEditor
            title='Output'
            value={tracePayload(item).output}
            readOnly
            showEditButton={false}
          />
          <MixEditor
            title='Expected Output'
            value={tracePayload(item).expectedOutput}
            readOnly
            showEditButton={false}
          />
          <MixEditor
            title='Metadata'
            value={{
              badcaseId: item.id,
              stage: item.stage,
              priority: item.priority,
              failureType: item.failureType,
              traceId: item.sourceTraceId,
              observationId: item.sourceObservationId,
              regressionCandidate: item.regressionCandidate,
            }}
            readOnly
            showEditButton={false}
          />
        </div>
      </Drawer>
    </>
  )
}

const detailTabs = [
  { value: 'form', label: '表单填写' },
  { value: 'context', label: 'Trace 与上下文' },
  { value: 'attribution', label: '归因分析' },
  { value: 'fixRetest', label: '修复复测' },
  { value: 'history', label: '处理历史' },
]

function TraceContextTab({
  item,
  onViewSource,
}: {
  item: BadcaseItem
  onViewSource: () => void
}) {
  const payload = tracePayload(item)

  return (
    <div className='grid gap-3'>
      <ContextPreview title='Input' value={payload.input} />
      <ContextPreview title='Output' value={payload.output} />
      <ContextPreview title='Expected Output' value={payload.expectedOutput} />
      <BaseDetail
        columns={1}
        className='rounded-md border p-3'
        items={[
          {
            label: 'Source',
            value: (
              <Button
                type='button'
                variant='link'
                className='text-primary h-auto p-0 text-left font-mono text-xs'
                onClick={onViewSource}
              >
                {item.sourceTraceId} / {item.sourceObservationId}
                <ExternalLink data-icon='inline-end' />
              </Button>
            ),
          },
        ]}
      />
    </div>
  )
}

function AttributionTab({ item }: { item: BadcaseItem }) {
  if (!hasCompletedAttribution(item)) {
    return (
      <EmptyTab
        title='暂无归因分析'
        description='完成归因后，这里会沉淀失败类型、根因分类和证据摘要。'
      />
    )
  }

  const event = item.history.find((history) => history.to === 'FIXING')

  return (
    <BaseDetail
      columns={1}
      className='rounded-md border p-3'
      items={[
        { label: '失败类型', value: item.failureType },
        { label: '根因分类', value: inferRootCauseCategory(item) },
        { label: '根因摘要', value: item.rootCause },
        { label: '证据', value: item.evidence },
        { label: '期望修复时间', value: item.fixDueAt },
        { label: '处理时间', value: event?.occurredAt },
        { label: '处理人', value: event?.operator },
      ]}
    />
  )
}

function FixRetestTab({ item }: { item: BadcaseItem }) {
  const repairDone = hasRepairSnapshot(item)
  const retestDone = hasRetestSnapshot(item)

  if (!repairDone && !retestDone) {
    return (
      <EmptyTab
        title='暂无修复复测记录'
        description='提交修复或复测后，这里会展示当时填写的修复说明、复测方式和复测结论。'
      />
    )
  }

  return (
    <div className='grid gap-3'>
      {repairDone ? (
        <SnapshotSection
          title='修复记录'
          items={[
            { label: '修复说明', value: item.fixPlan },
            { label: '修复责任人', value: item.fixOwner },
            { label: '期望修复时间', value: item.fixDueAt },
            {
              label: '处理时间',
              value: findHistoryEvent(item, 'PENDING_RETEST')?.occurredAt,
            },
            {
              label: '处理人',
              value: findHistoryEvent(item, 'PENDING_RETEST')?.operator,
            },
          ]}
        />
      ) : null}
      {retestDone ? (
        <SnapshotSection
          title='复测记录'
          items={[
            { label: '复测方式', value: '评测试验自动复跑 / Trace 回放' },
            { label: '复测备注', value: item.retestResult },
            {
              label: '复测结论',
              value: item.stage === 'FIXING' ? '复测失败' : '通过',
            },
            {
              label: '处理时间',
              value: findHistoryEvent(item, 'PENDING_VERIFY')?.occurredAt,
            },
            {
              label: '处理人',
              value: findHistoryEvent(item, 'PENDING_VERIFY')?.operator,
            },
          ]}
        />
      ) : null}
    </div>
  )
}

function HistoryTab({ item }: { item: BadcaseItem }) {
  return (
    <ol className='grid gap-3'>
      {historyTimeline(item).map((event, index) => (
        <li
          key={`${event.occurredAt}-${event.to}-${index}`}
          className='flex gap-3'
        >
          <span className='border-primary bg-background mt-1 size-2.5 shrink-0 rounded-full border-2' />
          <div className='min-w-0 flex-1 rounded-md border p-3'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <span className='text-sm font-medium'>
                {stageLabel(event.to)}
              </span>
              <span className='text-muted-foreground text-xs'>
                {event.occurredAt}
              </span>
            </div>
            <div className='text-muted-foreground mt-2 grid gap-1 text-xs'>
              <span>处理人：{event.operator}</span>
              {event.reason ? (
                <span className='line-clamp-2'>说明：{event.reason}</span>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

function ContextPreview({ title, value }: { title: string; value: unknown }) {
  return (
    <section className='rounded-md border p-3'>
      <h3 className='text-sm font-semibold'>{title}</h3>
      <pre className='text-muted-foreground mt-2 line-clamp-5 font-mono text-xs leading-5 break-words whitespace-pre-wrap'>
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  )
}

function SnapshotSection({
  title,
  items,
}: {
  title: string
  items: ComponentProps<typeof BaseDetail>['items']
}) {
  return (
    <section>
      <h3 className='mb-2 text-sm font-semibold'>{title}</h3>
      <BaseDetail columns={1} className='rounded-md border p-3' items={items} />
    </section>
  )
}

function EmptyTab({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className='flex min-h-40 items-center justify-center rounded-md border border-dashed p-6 text-center'>
      <div>
        <h3 className='text-sm font-semibold'>{title}</h3>
        <p className='text-muted-foreground mt-1 text-xs'>{description}</p>
      </div>
    </div>
  )
}

function tracePayload(item: BadcaseItem) {
  return {
    input: {
      badcaseId: item.id,
      userMessage: item.summary,
      sourceTraceId: item.sourceTraceId,
      sourceObservationId: item.sourceObservationId,
    },
    output: {
      answer: item.lastAction,
      failureType: item.failureType,
      evidence: item.evidence,
    },
    expectedOutput: {
      expectation: item.verifyNote,
      rootCause: item.rootCause,
      regressionCandidate: item.regressionCandidate,
    },
  }
}

function hasCompletedAttribution(item: BadcaseItem) {
  return (
    item.history.some((event) => event.to === 'FIXING') ||
    item.stage === 'FIXING' ||
    item.stage === 'PENDING_RETEST' ||
    item.stage === 'PENDING_VERIFY' ||
    item.stage === 'CLOSED'
  )
}

function hasRepairSnapshot(item: BadcaseItem) {
  return (
    item.history.some((event) => event.to === 'PENDING_RETEST') ||
    item.stage === 'PENDING_RETEST' ||
    item.stage === 'PENDING_VERIFY' ||
    item.stage === 'CLOSED'
  )
}

function hasRetestSnapshot(item: BadcaseItem) {
  return (
    item.history.some((event) => event.to === 'PENDING_VERIFY') ||
    item.stage === 'PENDING_VERIFY' ||
    item.stage === 'CLOSED'
  )
}

function findHistoryEvent(item: BadcaseItem, stage: BadcaseStage) {
  return item.history.find((event) => event.to === stage)
}

function inferRootCauseCategory(item: BadcaseItem) {
  if (item.rootCause.includes('session')) return 'session_memory'
  if (item.rootCause.includes('cache')) return 'cache'
  if (item.rootCause.includes('检索') || item.rootCause.includes('知识')) {
    return 'retrieval'
  }
  return item.rootCause === '待补充根因分类和证据。' ? undefined : '业务规则'
}

function historyTimeline(item: BadcaseItem) {
  const initialStage = item.history[0]?.from ?? item.stage
  const events = item.history.map((event) => ({
    occurredAt: event.occurredAt,
    to: event.to,
    operator: event.operator,
    reason: event.reason,
  }))

  return [
    {
      occurredAt: '初始',
      to: initialStage,
      operator: item.history[0]?.operator ?? item.owner,
      reason: '加入 Badcase 集',
    },
    ...events,
  ]
}

function stageLabel(stage: BadcaseStage) {
  return lifecycleStages.find((item) => item.value === stage)?.label ?? stage
}
