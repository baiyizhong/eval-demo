import type { DataTableQueryState } from '@/components/common/data-table'

export const SESSION_TRACE_PAGE_SIZE = 20

export function buildSessionTraceListQuery(
  sessionId: string,
  page = 1
): DataTableQueryState {
  return {
    page: Math.max(1, page),
    pageSize: SESSION_TRACE_PAGE_SIZE,
    keyword: '',
    filters: {
      sessionId,
      fields: 'core,io',
    },
    sorting: [],
  }
}

export function formatSessionTracePreview(value: unknown) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'string') return value || '-'
  return JSON.stringify(value, null, 2)
}
