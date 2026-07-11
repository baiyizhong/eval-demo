import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { cn } from '@/lib/utils'

export function JsonPreviewCell({
  label,
  value,
  className,
}: {
  label: string
  value: unknown
  className?: string
}) {
  const brief = stringifyBrief(value)
  const pretty = stringifyPretty(value)

  return (
    <HoverCard openDelay={250} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type='button'
          className={cn(
            'hover:text-foreground block max-w-64 truncate text-left font-mono text-xs text-muted-foreground',
            className
          )}
        >
          {brief || '-'}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align='start'
        className='w-[560px] max-w-[calc(100vw-2rem)] p-3'
      >
        <div className='text-xs font-medium'>{label}</div>
        <pre className='mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed'>
          {pretty || '-'}
        </pre>
      </HoverCardContent>
    </HoverCard>
  )
}

export function SourcePreviewCell({
  sourceTraceId,
  onOpenTrace,
}: {
  sourceTraceId?: string
  onOpenTrace?: (traceId: string) => void
}) {
  const traceId = sourceTraceId?.trim() ?? ''

  if (!traceId) {
    return <span className='text-muted-foreground font-mono text-xs'>-</span>
  }

  return (
    <HoverCard openDelay={250} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type='button'
          className='hover:text-foreground block max-w-[320px] break-all text-left font-mono text-xs text-muted-foreground'
          onClick={() => onOpenTrace?.(traceId)}
        >
          {traceId}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align='start'
        className='w-[520px] max-w-[calc(100vw-2rem)] p-3'
      >
        <div className='text-xs font-medium'>Source</div>
        <dl className='mt-2 flex flex-col gap-2 font-mono text-xs'>
          <div>
            <dt className='text-muted-foreground'>Trace ID</dt>
            <dd className='mt-1 break-all'>{traceId}</dd>
          </div>
        </dl>
      </HoverCardContent>
    </HoverCard>
  )
}

function stringifyBrief(value: unknown) {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function stringifyPretty(value: unknown) {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value !== 'string') return JSON.stringify(value, null, 2)

  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}
