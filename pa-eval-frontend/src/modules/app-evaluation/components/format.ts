export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function stringifyJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

export function parseJsonField(value: string, fieldName: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    throw new Error(`${fieldName} 必须是合法 JSON`)
  }
}

export function parseJsonValue(value: string, fieldName: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new Error(`${fieldName} 必须是合法 JSON`)
  }
}

export function downloadJson(fileName: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
