import * as XLSX from 'xlsx'
import {
  datasetTypeLabels,
  type DatasetExportFormat,
  type DatasetItemRecord,
  type DatasetRecord,
} from '../types.ts'

const EXPORT_HEADERS: { label: string; key: keyof DatasetItemRecord }[] = [
  { label: 'id', key: 'id' },
  { label: 'status', key: 'status' },
  { label: 'input', key: 'input' },
  { label: 'expectedOutput', key: 'expectedOutput' },
  { label: 'metadata', key: 'metadata' },
  { label: 'sourceTraceId', key: 'sourceTraceId' },
  { label: 'sourceObservationId', key: 'sourceObservationId' },
  { label: 'createdAt', key: 'createdAt' },
  { label: 'updatedAt', key: 'updatedAt' },
]

export function getDatasetExportFileName(
  dataset: DatasetRecord,
  format: DatasetExportFormat,
  date = new Date()
) {
  const typeLabel = datasetTypeLabels[dataset.type] ?? dataset.type
  const safeDatasetName = sanitizeFileName(dataset.name || dataset.id)
  const stamp = formatDateStamp(date)

  return `【${typeLabel}】${safeDatasetName}${stamp}.${format}`
}

export function buildDatasetItemExportWorkbookBlob(items: DatasetItemRecord[]) {
  const workbook = XLSX.utils.book_new()
  const rows = [
    EXPORT_HEADERS.map((header) => header.label),
    ...items.map((item) =>
      EXPORT_HEADERS.map((header) => stringifyExportValue(item[header.key]))
    ),
  ]
  const worksheet = XLSX.utils.aoa_to_sheet(rows)

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Dataset Items')

  const buffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
  }) as ArrayBuffer

  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

function stringifyExportValue(value: unknown) {
  if (value === undefined || value === null) {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  return JSON.stringify(value)
}

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, '-').trim() || '数据集'
}

function formatDateStamp(date: Date) {
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}${month}${day}`
}
