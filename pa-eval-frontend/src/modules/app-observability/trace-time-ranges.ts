import type { TraceListQuery } from './types'

export type TraceQuickTimeRange = NonNullable<TraceListQuery['timeRange']>

export const DEFAULT_TRACE_QUICK_TIME_RANGE: TraceQuickTimeRange = '1d'

export const TRACE_QUICK_TIME_RANGE_OPTIONS: {
  label: string
  value: TraceQuickTimeRange
}[] = [
  { label: '最近 1 天', value: '1d' },
  { label: '最近 3 天', value: '3d' },
  { label: '最近 7 天', value: '7d' },
  { label: '最近 14 天', value: '14d' },
]

const TRACE_QUICK_TIME_RANGES = new Set<TraceQuickTimeRange>(
  TRACE_QUICK_TIME_RANGE_OPTIONS.map((option) => option.value)
)

export function normalizeTraceQuickTimeRange(
  value: unknown
): TraceQuickTimeRange {
  return typeof value === 'string' &&
    TRACE_QUICK_TIME_RANGES.has(value as TraceQuickTimeRange)
    ? (value as TraceQuickTimeRange)
    : DEFAULT_TRACE_QUICK_TIME_RANGE
}

export function normalizeTraceTimeFilterValues(
  nextFilters: Record<string, unknown>,
  change: { fieldId: string }
) {
  const normalized = { ...nextFilters }

  if (change.fieldId === 'timeRange') {
    normalized.createdAtRange = []
    return normalized
  }

  if (
    change.fieldId === 'createdAtRange' &&
    hasCustomTraceTimeRange(normalized)
  ) {
    normalized.timeRange = ''
  }

  return normalized
}

export function getTraceQuickTimeRangeToolbarDefault(
  filterValues: Record<string, unknown>
): TraceQuickTimeRange | undefined {
  return hasCustomTraceTimeRange(filterValues) ||
    hasActiveTraceNonTimeFilter(filterValues)
    ? undefined
    : DEFAULT_TRACE_QUICK_TIME_RANGE
}

export function getExplicitTraceQuickTimeRange(
  value: unknown
): TraceQuickTimeRange | undefined {
  return typeof value === 'string' &&
    TRACE_QUICK_TIME_RANGES.has(value as TraceQuickTimeRange)
    ? (value as TraceQuickTimeRange)
    : undefined
}

export function hasActiveTraceNonTimeFilter(
  filterValues: Record<string, unknown>
) {
  return Object.entries(filterValues).some(([key, value]) => {
    if (key === 'timeRange' || key === 'createdAtRange') {
      return false
    }

    return hasActiveTraceFilterValue(value)
  })
}

function hasCustomTraceTimeRange(filterValues: Record<string, unknown>) {
  const createdAtRange = filterValues.createdAtRange
  return Array.isArray(createdAtRange) && createdAtRange.length > 0
}

function hasActiveTraceFilterValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0
  }
  if (typeof value === 'string') {
    return value.trim().length > 0
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).length > 0
  }
  return Boolean(value)
}
