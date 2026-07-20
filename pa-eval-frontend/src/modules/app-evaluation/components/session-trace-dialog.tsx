import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { TraceLogRow } from '@/modules/app-observability/types'
import { buildTraceListQuery } from '@/modules/app-observability/views/trace-logs-query'
import { Copy, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAPI } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loading } from '@/components/common/loading'
import {
  buildSessionTraceListQuery,
  formatSessionTracePreview,
  SESSION_TRACE_PAGE_SIZE,
} from './session-trace-dialog-utils'

type SessionTraceDialogProps = {
  projectId: string
  sessionId: string
  highlightTraceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

type SessionTraceRow = TraceLogRow & {
  input?: unknown
  output?: unknown
}

type SessionTraceListResponse = {
  total: number
  page?: number
  datas: SessionTraceRow[]
}

const EMPTY_SESSION_TRACES: SessionTraceRow[] = []

export function SessionTraceDialog({
  projectId,
  sessionId,
  highlightTraceId,
  open,
  onOpenChange,
}: SessionTraceDialogProps) {
  const $api = useAPI()
  const [page, setPage] = useState<number | null>(null)
  const highlightedRowRef = useRef<HTMLTableRowElement>(null)
  const normalizedSessionId = sessionId.trim()
  const normalizedHighlightTraceId = highlightTraceId.trim()
  const requestedPage = page ?? 1
  const shouldLocateAnchor =
    page === null && Boolean(normalizedHighlightTraceId)
  const tracesQuery = useQuery({
    queryKey: [
      'annotation-session-traces',
      $api,
      projectId,
      normalizedSessionId,
      normalizedHighlightTraceId,
      requestedPage,
      shouldLocateAnchor,
    ],
    queryFn: () =>
      $api.listProjectTraces<SessionTraceListResponse>({
        path: { projectId },
        query: buildTraceListQuery(
          buildSessionTraceListQuery(
            normalizedSessionId,
            requestedPage,
            shouldLocateAnchor ? normalizedHighlightTraceId : ''
          ),
          projectId
        ),
      }),
    enabled: open && Boolean(normalizedSessionId),
  })
  const resolvedTraces = tracesQuery.data?.datas ?? EMPTY_SESSION_TRACES
  const total = tracesQuery.data?.total ?? 0
  const currentPage = Math.max(1, tracesQuery.data?.page ?? requestedPage)
  const pageCount = Math.max(1, Math.ceil(total / SESSION_TRACE_PAGE_SIZE))
  const isLoading = tracesQuery.isLoading

  useEffect(() => {
    if (isLoading || !highlightedRowRef.current) return
    highlightedRowRef.current.scrollIntoView({ block: 'center' })
  }, [isLoading, resolvedTraces])
  const copySessionId = async () => {
    if (!normalizedSessionId) {
      return
    }

    await navigator.clipboard.writeText(normalizedSessionId)
    toast.success('已复制')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[82vh] flex-col overflow-hidden sm:max-w-6xl'>
        <DialogHeader>
          <DialogTitle>会话 Trace 日志</DialogTitle>
          <DialogDescription className='flex min-w-0 items-center gap-1'>
            <span>Session ID：</span>
            <span className='min-w-0 truncate font-mono'>
              {normalizedSessionId || '-'}
            </span>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='size-7 shrink-0'
              aria-label='复制 Session ID'
              disabled={!normalizedSessionId}
              onClick={() => {
                void copySessionId()
              }}
            >
              <Copy />
            </Button>
          </DialogDescription>
        </DialogHeader>
        <div className='flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border'>
          {isLoading ? (
            <Loading
              text='加载会话 Trace 中...'
              className='min-h-32 flex-1 border-0'
            />
          ) : null}
          {!isLoading ? (
            <div className='min-h-0 flex-1 overflow-x-auto overflow-y-auto'>
              <Table className='w-full table-fixed'>
                <TableHeader className='bg-card sticky top-0'>
                  <TableRow>
                    <TableHead className='w-[136px]'>会话 ID</TableHead>
                    <TableHead className='w-[168px]'>Trace ID</TableHead>
                    <TableHead>Input</TableHead>
                    <TableHead>Output</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resolvedTraces.map((trace) => {
                    const isHighlighted =
                      Boolean(normalizedHighlightTraceId) &&
                      trace.traceId === normalizedHighlightTraceId

                    return (
                      <TableRow
                        key={trace.traceId}
                        ref={isHighlighted ? highlightedRowRef : undefined}
                        className={cn(
                          isHighlighted && 'bg-accent/60 hover:bg-accent/60'
                        )}
                        aria-current={isHighlighted ? 'true' : undefined}
                      >
                        <SessionTracePreviewCell
                          label='会话 ID'
                          value={trace.sessionId}
                          className='w-[136px]'
                          mono
                        />
                        <SessionTracePreviewCell
                          label='Trace ID'
                          value={trace.traceId}
                          className='w-[168px]'
                          mono
                        />
                        <SessionTracePreviewCell
                          label='Input'
                          value={trace.input}
                        />
                        <SessionTracePreviewCell
                          label='Output'
                          value={trace.output}
                        />
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              {!resolvedTraces.length ? (
                <div className='text-muted-foreground p-6 text-center text-sm'>
                  当前会话下暂无 Trace 日志
                </div>
              ) : null}
            </div>
          ) : null}
          <div className='flex shrink-0 flex-wrap items-center justify-between gap-2 border-t p-2 text-xs'>
            <div className='text-muted-foreground min-w-0'>
              共 {total} 条，第 {currentPage} / {pageCount} 页
              <span className='ml-3'>
                注：数据按照 Trace 日志创建时间升序排序后分页返回。
              </span>
            </div>
            <div className='flex items-center gap-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={isLoading || currentPage <= 1}
                onClick={() => setPage(Math.max(1, currentPage - 1))}
              >
                <ChevronLeft data-icon='inline-start' />
                上一页
              </Button>
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={isLoading || currentPage >= pageCount}
                onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
              >
                下一页
                <ChevronRight data-icon='inline-end' />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SessionTracePreviewCell({
  label,
  value,
  className,
  mono,
}: {
  label: string
  value: unknown
  className?: string
  mono?: boolean
}) {
  const preview = formatSessionTracePreview(value)

  return (
    <TableCell className={cn('align-top', className)}>
      <HoverCard openDelay={250} closeDelay={100}>
        <HoverCardTrigger asChild>
          <Button
            type='button'
            variant='ghost'
            className='text-muted-foreground h-auto w-full min-w-0 justify-start p-0 text-left hover:bg-transparent'
          >
            <span
              className={
                mono
                  ? 'min-w-0 truncate font-mono text-xs'
                  : 'line-clamp-2 min-w-0 text-xs leading-relaxed break-words whitespace-normal'
              }
            >
              {preview}
            </span>
          </Button>
        </HoverCardTrigger>
        <HoverCardContent
          align='start'
          className='w-[min(760px,calc(100vw-3rem))] p-3'
        >
          <div className='text-xs font-medium'>{label}</div>
          <pre className='mt-2 max-h-80 overflow-auto font-mono text-xs leading-relaxed break-words whitespace-pre-wrap'>
            {preview}
          </pre>
        </HoverCardContent>
      </HoverCard>
    </TableCell>
  )
}
