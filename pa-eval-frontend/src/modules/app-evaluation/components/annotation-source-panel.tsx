import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { MixEditor } from '@/components/common/MixEditor'
import type { AnnotationQueueItemRecord, AnnotationScoreRecord } from '../types'
import { AnnotationObjectTypeBadge } from './annotation-object-type-badge'
import { AnnotationStatusBadge } from './annotation-status-badge'
import { formatDateTime } from './format'

type AnnotationSourcePanelProps = {
  item: AnnotationQueueItemRecord
}

export function AnnotationSourcePanel({ item }: AnnotationSourcePanelProps) {
  const [summaryOpen, setSummaryOpen] = useState(true)
  const [contextOpen, setContextOpen] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(false)
  const hasOpenSection = summaryOpen || contextOpen || historyOpen

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col gap-3 pr-1',
        hasOpenSection
          ? 'overflow-x-hidden overflow-y-auto'
          : 'overflow-visible'
      )}
    >
      <Collapsible
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        className='shrink-0'
      >
        <AnnotationSourceSection
          title='源对象摘要'
          open={summaryOpen}
          action={
            <CollapsibleTrigger asChild>
              <Button size='sm' variant='ghost'>
                {summaryOpen ? '折叠' : '展开'}
              </Button>
            </CollapsibleTrigger>
          }
        >
          <CollapsibleContent>
            <div className='grid gap-3 px-3 pb-3 text-sm md:grid-cols-3'>
              <InfoItem label='Source ID' value={item.objectId} mono />
              <InfoItem
                label='类型'
                value={
                  <AnnotationObjectTypeBadge objectType={item.objectType} />
                }
              />
              <InfoItem
                label='状态'
                value={<AnnotationStatusBadge status={item.status} />}
              />
              <InfoItem
                label='Session'
                value={item.source.sessionId || '-'}
                mono
              />
              <InfoItem label='User' value={item.source.userId || '-'} mono />
              <InfoItem
                label='创建时间'
                value={formatDateTime(item.createdAt)}
              />
              <InfoItem label='Latency' value={`${item.source.latencyMs} ms`} />
              <InfoItem label='Cost' value={`$${item.source.costUsd}`} />
              <InfoItem label='标题' value={item.source.title} />
            </div>
          </CollapsibleContent>
        </AnnotationSourceSection>
      </Collapsible>

      <Collapsible
        open={contextOpen}
        onOpenChange={setContextOpen}
        className='shrink-0'
      >
        <AnnotationSourceSection
          title='上下文详情'
          open={contextOpen}
          className='flex min-h-0 flex-col'
          action={
            <CollapsibleTrigger asChild>
              <Button size='sm' variant='ghost'>
                {contextOpen ? '折叠' : '展开'}
              </Button>
            </CollapsibleTrigger>
          }
        >
          <CollapsibleContent className='min-h-0 flex-1'>
            <div className='grid min-h-0 grid-cols-1 gap-3 px-3 py-3 pb-3 md:grid-cols-2'>
              <MixEditor
                value={item.source.input}
                readOnly
                title='Input'
              />
              <MixEditor
                value={item.source.output}
                readOnly
                title='Output'
              />
              <MixEditor
                className='md:col-span-2'
                value={item.source.metadata}
                readOnly
                title='Metadata'
              />
            </div>
          </CollapsibleContent>
        </AnnotationSourceSection>
      </Collapsible>

      <Collapsible
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        className='shrink-0'
      >
        <AnnotationSourceSection
          title='历史人工评分'
          open={historyOpen}
          action={
            <CollapsibleTrigger asChild>
              <Button size='sm' variant='ghost'>
                {historyOpen ? '折叠' : '展开'}
              </Button>
            </CollapsibleTrigger>
          }
        >
          <CollapsibleContent>
            <div className='flex flex-col gap-2 px-3 pb-3 text-sm'>
              {item.scores.length ? (
                item.scores.map((score) => (
                  <div
                    key={score.id}
                    className='grid gap-1 rounded-md border bg-muted/20 px-2.5 py-2'
                  >
                    <div className='flex min-w-0 items-center justify-between gap-2'>
                      <div className='truncate font-medium'>{score.name}</div>
                      <div className='text-muted-foreground shrink-0 text-xs'>
                        {formatAnnotationScoreDisplay(score)}
                      </div>
                    </div>
                    <div className='text-muted-foreground line-clamp-2 text-xs'>
                      {score.comment || '无备注'}
                    </div>
                  </div>
                ))
              ) : (
                <div className='text-muted-foreground'>暂无历史人工评分</div>
              )}
            </div>
          </CollapsibleContent>
        </AnnotationSourceSection>
      </Collapsible>
    </div>
  )
}

function AnnotationSourceSection({
  title,
  open,
  action,
  className,
  children,
}: {
  title: string
  open: boolean
  action: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section
      className={cn(
        'rounded-md border bg-card text-card-foreground',
        className
      )}
    >
      <div
        className={cn(
          'flex items-center justify-between gap-3 px-3 py-2',
          open && 'border-b'
        )}
      >
        <h2 className='text-sm font-semibold'>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function formatAnnotationScoreDisplay(score: AnnotationScoreRecord) {
  if (score.dataType === 'BOOLEAN') {
    if (score.value === 1 || score.stringValue === 'true') return '是'
    if (score.value === 0 || score.stringValue === 'false') return '否'
  }
  if (score.dataType === 'TEXT') {
    return score.stringValue || '-'
  }
  if (score.dataType === 'CATEGORICAL') {
    return score.stringValue || String(score.value ?? '-')
  }
  return score.value == null ? '-' : String(score.value)
}

function InfoItem({
  label,
  value,
  mono,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className='min-w-0'>
      <div className='text-muted-foreground text-xs'>{label}</div>
      <div className={mono ? 'truncate font-mono text-xs' : 'truncate'}>
        {value}
      </div>
    </div>
  )
}
