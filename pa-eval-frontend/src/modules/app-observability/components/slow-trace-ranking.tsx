import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateTime, formatLatency } from '../lib/format'
import type { TraceLogRow } from '../types'
import { StatusBadge } from './status-badge'

type SlowTraceRankingProps = {
  rows: TraceLogRow[]
  onOpenTrace: (traceId: string) => void
}

export function SlowTraceRanking({ rows, onOpenTrace }: SlowTraceRankingProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>慢 Trace 排名</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-2'>
        {rows.map((row) => (
          <div
            key={row.traceId}
            className='grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border p-3'
          >
            <div className='min-w-0'>
              <Button
                type='button'
                variant='link'
                className='h-auto max-w-full justify-start p-0'
                onClick={() => onOpenTrace(row.traceId)}
              >
                <span className='truncate'>{row.traceId}</span>
              </Button>
              <p className='text-muted-foreground truncate text-sm'>
                {row.sessionId} · {formatDateTime(row.createdAt)}
              </p>
            </div>
            <div className='flex items-center gap-2'>
              <StatusBadge status={row.status} />
              <span className='font-medium tabular-nums'>
                {formatLatency(row.latency)}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
