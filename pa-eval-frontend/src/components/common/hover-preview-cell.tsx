import { cn } from '@/lib/utils'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'

export function HoverPreviewCell({
  label,
  value,
  detailValue,
  emptyValue = '-',
  triggerClassName,
  contentClassName,
  preClassName,
}: {
  label: string
  value?: string | null
  detailValue?: string | null
  emptyValue?: string
  triggerClassName?: string
  contentClassName?: string
  preClassName?: string
}) {
  const displayValue = value?.trim() || emptyValue
  const previewValue = detailValue?.trim() || displayValue

  return (
    <HoverCard openDelay={250} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type='button'
          className={cn(
            'hover:text-foreground text-muted-foreground block w-full truncate text-left text-xs',
            triggerClassName
          )}
          onClick={(event) => event.stopPropagation()}
        >
          {displayValue}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align='start'
        className={cn('w-[520px] p-3', contentClassName)}
      >
        <div className='text-xs font-medium'>{label}</div>
        <pre
          className={cn(
            'mt-2 max-h-80 overflow-auto font-mono text-xs leading-relaxed break-words whitespace-pre-wrap',
            preClassName
          )}
        >
          {previewValue}
        </pre>
      </HoverCardContent>
    </HoverCard>
  )
}
