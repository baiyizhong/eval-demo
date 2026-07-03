export function formatLatency(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return '-'
  }

  if (value < 1000) {
    return `${Math.round(value)}ms`
  }

  return `${(value / 1000).toFixed(2)}s`
}

export function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return '-'
  }

  if (value === 0) {
    return '0%'
  }

  return `${(value * 100).toFixed(1)}%`
}

export function formatDateTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function stringifyJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}
