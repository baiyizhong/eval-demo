import { useState } from 'react'
import type { JsonData } from 'json-edit-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { JsonEditorPanel } from '@/components/common/json-editor'
import { formatDateTime } from './format'
import { AnnotationObjectTypeBadge } from './annotation-object-type-badge'
import { AnnotationStatusBadge } from './annotation-status-badge'
import type { AnnotationQueueItemRecord } from '../types'

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
        hasOpenSection ? 'overflow-y-auto overflow-x-hidden' : 'overflow-visible'
      )}
    >
      <Collapsible
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        className='shrink-0'
      >
        <Card>
          <CardHeader className='flex flex-row items-center justify-between'>
            <CardTitle className='text-sm'>源对象摘要</CardTitle>
            <CollapsibleTrigger asChild>
              <Button size='sm' variant='ghost'>
                {summaryOpen ? '折叠' : '展开'}
              </Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className='grid gap-3 text-sm md:grid-cols-3'>
              <InfoItem label='Source ID' value={item.objectId} mono />
              <InfoItem
                label='类型'
                value={<AnnotationObjectTypeBadge objectType={item.objectType} />}
              />
              <InfoItem
                label='状态'
                value={<AnnotationStatusBadge status={item.status} />}
              />
              <InfoItem label='Session' value={item.source.sessionId || '-'} mono />
              <InfoItem label='User' value={item.source.userId || '-'} mono />
              <InfoItem label='创建时间' value={formatDateTime(item.createdAt)} />
              <InfoItem label='Latency' value={`${item.source.latencyMs} ms`} />
              <InfoItem label='Cost' value={`$${item.source.costUsd}`} />
              <InfoItem label='标题' value={item.source.title} />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Collapsible
        open={contextOpen}
        onOpenChange={setContextOpen}
        className='shrink-0'
      >
        <Card className='flex min-h-0 flex-col'>
          <CardHeader className='flex flex-row items-center justify-between'>
            <CardTitle className='text-sm'>上下文详情</CardTitle>
            <CollapsibleTrigger asChild>
              <Button size='sm' variant='ghost'>
                {contextOpen ? '折叠' : '展开'}
              </Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent className='min-h-0 flex-1'>
            <CardContent className='grid min-h-0 grid-cols-1 gap-3 md:grid-cols-2'>
              <JsonEditorPanel
                data={item.source.input as JsonData}
                readOnly
                searchable={false}
                title='Input'
                rootName='input'
                height={256}
              />
              <JsonEditorPanel
                data={item.source.output as JsonData}
                readOnly
                searchable={false}
                title='Output'
                rootName='output'
                height={256}
              />
              <JsonEditorPanel
                className='md:col-span-2'
                data={item.source.metadata as JsonData}
                readOnly
                searchable={false}
                title='Metadata'
                rootName='metadata'
                height={160}
              />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Collapsible
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        className='shrink-0'
      >
        <Card>
          <CardHeader className='flex flex-row items-center justify-between'>
            <CardTitle className='text-sm'>历史人工评分</CardTitle>
            <CollapsibleTrigger asChild>
              <Button size='sm' variant='ghost'>
                {historyOpen ? '折叠' : '展开'}
              </Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className='flex flex-col gap-2 text-sm'>
              {item.scores.length ? (
                item.scores.map((score) => (
                  <div key={score.id} className='rounded-md border p-2'>
                    <div className='font-medium'>{score.name}</div>
                    <div className='text-muted-foreground'>
                      {String(score.value ?? (score.stringValue || '-'))}
                    </div>
                    <div>{score.comment || '-'}</div>
                  </div>
                ))
              ) : (
                <div className='text-muted-foreground'>暂无历史人工评分</div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  )
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
