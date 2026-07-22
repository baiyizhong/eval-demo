import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  buildSessionTraceListQuery,
  formatSessionTracePreview,
} from '../../modules/app-evaluation/components/session-trace-dialog-utils.ts'

const queueDetailSource = readFileSync(
  'src/modules/app-evaluation/views/annotation-queue-detail.tsx',
  'utf8'
)
const queueItemColumnsSource = readFileSync(
  'src/modules/app-evaluation/components/annotation-queue-item-columns.tsx',
  'utf8'
)
const batchSource = readFileSync(
  'src/modules/app-evaluation/views/annotation-batch.tsx',
  'utf8'
)
const mockObservabilitySource = readFileSync('mock/observability.ts', 'utf8')
const sessionTraceDialogUtilsSource = readFileSync(
  'src/modules/app-evaluation/components/session-trace-dialog-utils.ts',
  'utf8'
)
const sessionTraceDialogSource = readFileSync(
  'src/modules/app-evaluation/components/session-trace-dialog.tsx',
  'utf8'
)
const traceTypesSource = readFileSync(
  'src/modules/app-observability/types.ts',
  'utf8'
)
const traceQuerySource = readFileSync(
  'src/modules/app-observability/views/trace-logs-query.ts',
  'utf8'
)

test('manual annotation detail and batch pages expose clickable session id traces', () => {
  assert.match(queueDetailSource, /SessionTraceDialog/)
  assert.match(queueItemColumnsSource, /accessorKey: 'sessionId'/)
  assert.match(queueItemColumnsSource, /title='会话 ID'/)
  assert.match(queueItemColumnsSource, /onOpenSession/)
  assert.match(queueItemColumnsSource, /item\.source\.sessionId/)
  assert.match(
    queueItemColumnsSource,
    /onOpenSession\?: \(sessionId: string, traceId: string\) => void/
  )
  assert.match(
    queueItemColumnsSource,
    /onOpenSession\?\.\(sessionId, traceId\)/
  )

  assert.match(batchSource, /sessionId: '会话 ID'/)
  assert.match(batchSource, /columnVisibility\.sessionId/)
  assert.match(batchSource, /SessionTraceDialog/)
  assert.match(batchSource, /onOpenSession/)
  assert.match(batchSource, /item\.source\.sessionId/)
  assert.match(
    batchSource,
    /onOpenSession\(item\.source\.sessionId,\s*traceId\)/
  )
  assert.match(queueDetailSource, /highlightTraceId=/)
  assert.match(batchSource, /highlightTraceId=/)
})

test('session trace dialog queries traces by exact session id', () => {
  assert.deepEqual(buildSessionTraceListQuery('session_001'), {
    page: 1,
    pageSize: 20,
    keyword: '',
    filters: {
      sessionId: 'session_001',
      fields: 'core,io',
    },
    sorting: [],
  })
  assert.deepEqual(buildSessionTraceListQuery('session_001', 3), {
    page: 3,
    pageSize: 20,
    keyword: '',
    filters: {
      sessionId: 'session_001',
      fields: 'core,io',
    },
    sorting: [],
  })
  assert.deepEqual(buildSessionTraceListQuery('session_001', 1, 'trace-25'), {
    page: 1,
    pageSize: 20,
    keyword: '',
    filters: {
      sessionId: 'session_001',
      fields: 'core,io',
      anchorTraceId: 'trace-25',
    },
    sorting: [],
  })
  assert.match(traceTypesSource, /anchorTraceId\?: string/)
  assert.match(
    traceQuerySource,
    /anchorTraceId: optionalString\(state\.filters\.anchorTraceId\)/
  )
  assert.match(
    mockObservabilitySource,
    /trace\.sessionId === req\.query\?\.sessionId/
  )
})

test('session trace preview formats structured values for hover display', () => {
  assert.equal(
    formatSessionTracePreview({ question: '如何重置密码？' }),
    '{\n  "question": "如何重置密码？"\n}'
  )
  assert.equal(formatSessionTracePreview('plain text'), 'plain text')
  assert.equal(formatSessionTracePreview(null), '-')
})

test('session trace dialog prioritizes payload preview width without forcing horizontal scroll', () => {
  const dialogSource = readFileSync(
    'src/modules/app-evaluation/components/session-trace-dialog.tsx',
    'utf8'
  )

  assert.match(dialogSource, /overflow-x-auto/)
  assert.match(dialogSource, /w-full table-fixed/)
  assert.match(dialogSource, /w-\[136px\].*会话 ID/s)
  assert.match(dialogSource, /w-\[168px\].*Trace ID/s)
  assert.doesNotMatch(dialogSource, /min-w-\[1320px\]/)
  assert.match(dialogSource, /line-clamp-2/)
  assert.match(dialogSource, /HoverCardContent/)
  assert.match(dialogSource, /w-\[min\(760px,calc\(100vw-3rem\)\)\]/)
  assert.match(dialogSource, /whitespace-pre-wrap/)
})

test('session trace dialog keeps pagination visible while trace rows scroll', () => {
  const dialogSource = readFileSync(
    'src/modules/app-evaluation/components/session-trace-dialog.tsx',
    'utf8'
  )

  assert.match(
    dialogSource,
    /DialogContent className='flex max-h-\[82vh\] flex-col overflow-hidden/
  )
  assert.match(
    dialogSource,
    /className='flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border'/
  )
  assert.match(
    dialogSource,
    /className='min-h-0 flex-1 overflow-x-auto overflow-y-auto'/
  )
  assert.match(
    dialogSource,
    /className='flex shrink-0 flex-wrap items-center justify-between gap-2 border-t p-2 text-xs'/
  )
  assert.match(
    dialogSource,
    /共 \{total\} 条，第 \{currentPage\} \/ \{pageCount\} 页[\s\S]*<span className='ml-3'>[\s\S]*注：数据按照 Trace 日志创建时间升序排序后分页返回。[\s\S]*<\/span>/
  )
  assert.doesNotMatch(dialogSource, /flex-col gap-1/)
})

test('session trace dialog exposes a session id copy action', () => {
  const dialogSource = readFileSync(
    'src/modules/app-evaluation/components/session-trace-dialog.tsx',
    'utf8'
  )

  assert.match(dialogSource, /import \{ Copy/)
  assert.match(
    dialogSource,
    /copyTextToClipboard\(normalizedSessionId\)/
  )
  assert.match(dialogSource, /toast\.success\('已复制'\)/)
  assert.match(dialogSource, /aria-label='复制 Session ID'/)
  assert.match(dialogSource, /disabled=\{!normalizedSessionId\}/)
  assert.doesNotMatch(dialogSource, /TooltipContent/)
})

test('session trace dialog paginates large sessions and requests io fields without trace detail fan-out', () => {
  const dialogSource = readFileSync(
    'src/modules/app-evaluation/components/session-trace-dialog.tsx',
    'utf8'
  )

  assert.match(sessionTraceDialogUtilsSource, /SESSION_TRACE_PAGE_SIZE = 20/)
  assert.match(dialogSource, /setPage\(Math\.max\(1, currentPage - 1\)\)/)
  assert.match(
    dialogSource,
    /setPage\(Math\.min\(pageCount, currentPage \+ 1\)\)/
  )
  assert.match(dialogSource, /共 \{total\} 条/)
  assert.match(sessionTraceDialogUtilsSource, /fields: 'core,io'/)
  assert.doesNotMatch(dialogSource, /useQueries/)
  assert.doesNotMatch(dialogSource, /getProjectTrace/)
  assert.doesNotMatch(dialogSource, /tracesMissingPayload/)
  assert.doesNotMatch(dialogSource, /pageSize: 50/)
})

test('session trace dialog locates and highlights the originating trace without reordering', () => {
  assert.match(sessionTraceDialogSource, /highlightTraceId: string/)
  assert.match(sessionTraceDialogSource, /page === null/)
  assert.match(sessionTraceDialogSource, /tracesQuery\.data\?\.page/)
  assert.match(sessionTraceDialogSource, /bg-accent\/60 hover:bg-accent\/60/)
  assert.match(sessionTraceDialogSource, /aria-current=/)
  assert.match(
    sessionTraceDialogSource,
    /scrollIntoView\(\{ block: 'center' \}\)/
  )
  assert.doesNotMatch(sessionTraceDialogSource, /sort\(/)
})
