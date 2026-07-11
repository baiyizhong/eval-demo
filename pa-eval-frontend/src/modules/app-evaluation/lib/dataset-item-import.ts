import * as XLSX from 'xlsx'
import type {
  DatasetItemFormInput,
  DatasetItemStatus,
  DatasetRecord,
  JsonObject,
} from '../types'

export const DATASET_ITEM_IMPORT_FILE_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'text/plain',
  '.xlsx',
  '.xls',
  '.csv',
  '.txt',
]

export type DatasetItemImportFailure = {
  row: number
  field: string
  reason: string
}

export type ParsedDatasetItemImportResult = {
  items: DatasetItemFormInput[]
  itemRows: number[]
  failures: DatasetItemImportFailure[]
}

type ImportField =
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'input'
  | 'expectedOutput'
  | 'metadata'
  | 'status'
  | 'sourceTraceId'
  | 'sourceObservationId'

type HeaderDefinition = {
  field: ImportField
  label: string
  aliases: string[]
}

const IMPORT_HEADERS: HeaderDefinition[] = [
  {
    field: 'id',
    label: 'id',
    aliases: ['id', 'itemId', 'item id', '数据项 ID'],
  },
  {
    field: 'status',
    label: 'status',
    aliases: ['status', 'Status', '状态'],
  },
  {
    field: 'input',
    label: 'input',
    aliases: ['input', 'Input', '输入', '输入内容'],
  },
  {
    field: 'expectedOutput',
    label: 'expectedOutput',
    aliases: [
      'expectedOutput',
      'Expected Output',
      'expected output',
      'expected_output',
      'expected-output',
      '期望输出',
      '预期输出',
    ],
  },
  {
    field: 'metadata',
    label: 'metadata',
    aliases: ['metadata', 'Metadata', 'meta', '元数据'],
  },
  {
    field: 'sourceTraceId',
    label: 'sourceTraceId',
    aliases: [
      'sourceTraceId',
      'Source Trace ID',
      'source trace id',
      'source_trace_id',
      'traceId',
      'trace id',
      'trace_id',
      '来源 Trace ID',
    ],
  },
  {
    field: 'sourceObservationId',
    label: 'sourceObservationId',
    aliases: [
      'sourceObservationId',
      'Source Observation ID',
      'source observation id',
      'source_observation_id',
      'observationId',
      'observation id',
      'observation_id',
      '来源 Observation ID',
    ],
  },
  {
    field: 'createdAt',
    label: 'createdAt',
    aliases: ['createdAt', 'created at', 'created_at', '创建时间'],
  },
  {
    field: 'updatedAt',
    label: 'updatedAt',
    aliases: ['updatedAt', 'updated at', 'updated_at', '更新时间'],
  },
]

const REQUIRED_FIELDS: ImportField[] = ['input', 'expectedOutput']

export async function parseDatasetItemImportFile(
  file: File
): Promise<ParsedDatasetItemImportResult> {
  const fileName = file.name.toLowerCase()

  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    return parseDatasetItemImportRows(await readWorkbookRows(file))
  }

  const text = await file.text()
  const parsedText = parseDatasetItemJsonText(text)

  if (parsedText) {
    return parsedText
  }

  return parseDatasetItemImportRows(readTextRows(text))
}

export function parseDatasetItemImportRows(
  rows: unknown[][]
): ParsedDatasetItemImportResult {
  const normalizedRows = rows.filter((row) =>
    row.some((cell) => String(cell ?? '').trim().length > 0)
  )

  if (normalizedRows.length === 0) {
    return {
      items: [],
      itemRows: [],
      failures: [{ row: 1, field: 'file', reason: '导入文件内容为空' }],
    }
  }

  const headers = normalizedRows[0].map((cell) => String(cell ?? ''))
  const mapping = buildHeaderMapping(headers)
  const headerFailures = REQUIRED_FIELDS.flatMap((field) =>
    mapping[field] === undefined
      ? [
          {
            row: 1,
            field,
            reason: `缺少必填列 ${getHeaderLabel(field)}`,
          },
        ]
      : []
  )

  if (headerFailures.length > 0) {
    return { items: [], itemRows: [], failures: headerFailures }
  }

  const items: DatasetItemFormInput[] = []
  const itemRows: number[] = []
  const failures: DatasetItemImportFailure[] = []

  normalizedRows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2
    const rowFailures: DatasetItemImportFailure[] = []
    const input = parseJsonCell(
      row[mapping.input ?? -1],
      rowNumber,
      'input',
      true
    )
    const expectedOutput = parseJsonCell(
      row[mapping.expectedOutput ?? -1],
      rowNumber,
      'expectedOutput',
      true
    )
    const metadata = parseJsonCell(
      row[mapping.metadata ?? -1],
      rowNumber,
      'metadata',
      false,
      {}
    )
    const status = parseStatusCell(row[mapping.status ?? -1], rowNumber)
    const sourceTraceId = parseOptionalTextCell(
      row[mapping.sourceTraceId ?? -1]
    )
    const sourceObservationId = parseOptionalTextCell(
      row[mapping.sourceObservationId ?? -1]
    )

    rowFailures.push(...input.failures)
    rowFailures.push(...expectedOutput.failures)
    rowFailures.push(...metadata.failures)
    rowFailures.push(...status.failures)

    if (rowFailures.length > 0) {
      failures.push(...rowFailures)
      return
    }

    const item: DatasetItemFormInput = {
      input: input.value,
      expectedOutput: expectedOutput.value,
      metadata: ensureJsonObject(metadata.value),
    }

    if (status.value) {
      item.status = status.value
    }

    if (sourceTraceId) {
      item.sourceTraceId = sourceTraceId
    }

    if (sourceObservationId) {
      item.sourceObservationId = sourceObservationId
    }

    items.push(item)
    itemRows.push(rowNumber)
  })

  return { items, itemRows, failures }
}

export function buildDatasetItemImportTemplateBlob(
  dataset?: DatasetRecord | null
) {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet(buildTemplateRows(dataset))

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Dataset Items')

  const buffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
  }) as ArrayBuffer

  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export function getDatasetItemImportTemplateFileName(
  dataset?: DatasetRecord | null,
  projectName?: string | null,
  date = new Date()
) {
  const safeProjectName = sanitizeFileName(
    projectName || dataset?.projectId || '项目'
  )
  const safeDatasetName = sanitizeFileName(
    dataset?.name || dataset?.id || '数据集'
  )
  const stamp = formatDateStamp(date)

  return `${safeProjectName}-${safeDatasetName}-导入模板${stamp}.xlsx`
}

export function formatDatasetItemImportResultMessage(
  successCount: number,
  failures: DatasetItemImportFailure[]
) {
  if (failures.length === 0) {
    return `批量导入完成，成功新增 ${successCount} 条数据项`
  }

  const preview = failures
    .slice(0, 3)
    .map((failure) => `第 ${failure.row} 行：${failure.reason}`)
    .join('；')

  return `批量导入完成，成功 ${successCount} 条，失败 ${failures.length} 条。${preview}`
}

function buildTemplateRows(dataset?: DatasetRecord | null) {
  return [
    IMPORT_HEADERS.map((header) => header.label),
    [
      '',
      'ACTIVE',
      stringifyTemplateValue(
        sampleValueFromSchema(dataset?.inputSchema) ?? {
          question: '请输入问题',
        }
      ),
      stringifyTemplateValue(
        sampleValueFromSchema(dataset?.expectedOutputSchema) ?? {
          answer: '请输入期望输出',
        }
      ),
      stringifyTemplateValue({ source: 'manual-import' }),
      '',
      '',
      '',
      '',
      '',
    ],
  ]
}

function readWorkbookRows(file: File) {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: 'array' })
    const firstSheetName = workbook.SheetNames[0]

    if (!firstSheetName) {
      return []
    }

    const worksheet = workbook.Sheets[firstSheetName]

    return XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: '',
      raw: false,
    })
  })
}

function readTextRows(text: string) {
  const workbook = XLSX.read(text.replace(/^\uFEFF/, ''), { type: 'string' })
  const firstSheetName = workbook.SheetNames[0]

  if (!firstSheetName) {
    return []
  }

  return XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheetName], {
    header: 1,
    defval: '',
    raw: false,
  })
}

function parseDatasetItemJsonText(
  text: string
): ParsedDatasetItemImportResult | null {
  const normalizedText = text.replace(/^\uFEFF/, '').trim()

  if (!normalizedText.startsWith('{') && !normalizedText.startsWith('[')) {
    return null
  }

  try {
    const parsed = JSON.parse(normalizedText) as unknown
    const rows = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.items)
        ? parsed.items
        : [parsed]

    return parseJsonObjects(rows)
  } catch {
    const lines = normalizedText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    if (lines.length <= 1) {
      return null
    }

    const rows: unknown[] = []
    const failures: DatasetItemImportFailure[] = []

    lines.forEach((line, index) => {
      try {
        rows.push(JSON.parse(line))
      } catch {
        failures.push({
          row: index + 1,
          field: 'row',
          reason: 'TXT JSON 行不是合法 JSON',
        })
      }
    })

    const result = parseJsonObjects(rows)

    return {
      items: result.items,
      itemRows: result.itemRows,
      failures: [...failures, ...result.failures],
    }
  }
}

function parseJsonObjects(rows: unknown[]): ParsedDatasetItemImportResult {
  const items: DatasetItemFormInput[] = []
  const itemRows: number[] = []
  const failures: DatasetItemImportFailure[] = []

  rows.forEach((row, index) => {
    const rowNumber = index + 1

    if (!isRecord(row)) {
      failures.push({
        row: rowNumber,
        field: 'row',
        reason: 'JSON 行必须是对象',
      })
      return
    }

    const input = row.input
    const expectedOutput = row.expectedOutput

    if (input === undefined) {
      failures.push({
        row: rowNumber,
        field: 'input',
        reason: '缺少必填字段 Input',
      })
      return
    }

    if (expectedOutput === undefined) {
      failures.push({
        row: rowNumber,
        field: 'expectedOutput',
        reason: '缺少必填字段 Expected Output',
      })
      return
    }

    items.push({
      input,
      expectedOutput,
      metadata: ensureJsonObject(row.metadata),
      status: parseJsonStatus(row.status),
      sourceTraceId: parseOptionalTextCell(row.sourceTraceId),
      sourceObservationId: parseOptionalTextCell(row.sourceObservationId),
    })
    itemRows.push(rowNumber)
  })

  return { items, itemRows, failures }
}

function buildHeaderMapping(headers: string[]) {
  const normalizedHeaders = headers.map(normalizeHeader)

  return IMPORT_HEADERS.reduce<Partial<Record<ImportField, number>>>(
    (mapping, header) => {
      const index = normalizedHeaders.findIndex((value) =>
        header.aliases.some((alias) => normalizeHeader(alias) === value)
      )

      if (index >= 0) {
        mapping[header.field] = index
      }

      return mapping
    },
    {}
  )
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
}

function getHeaderLabel(field: ImportField) {
  return IMPORT_HEADERS.find((header) => header.field === field)?.label ?? field
}

function parseJsonCell(
  value: unknown,
  row: number,
  field: ImportField,
  required: boolean,
  fallback?: unknown
): { value: unknown; failures: DatasetItemImportFailure[] } {
  const text = String(value ?? '').trim()

  if (!text) {
    if (!required) {
      return { value: fallback, failures: [] }
    }

    return {
      value: undefined,
      failures: [{ row, field, reason: `${getHeaderLabel(field)} 不能为空` }],
    }
  }

  try {
    return { value: JSON.parse(text), failures: [] }
  } catch {
    return {
      value: undefined,
      failures: [
        {
          row,
          field,
          reason: `${getHeaderLabel(field)} 必须是合法 JSON`,
        },
      ],
    }
  }
}

function parseStatusCell(
  value: unknown,
  row: number
): { value?: DatasetItemStatus; failures: DatasetItemImportFailure[] } {
  const text = String(value ?? '')
    .trim()
    .toUpperCase()

  if (!text) {
    return { failures: [] }
  }

  if (text === 'ACTIVE' || text === 'ARCHIVED') {
    return { value: text, failures: [] }
  }

  return {
    failures: [
      {
        row,
        field: 'status',
        reason: 'Status 仅支持 ACTIVE 或 ARCHIVED',
      },
    ],
  }
}

function parseJsonStatus(value: unknown) {
  const status = String(value ?? '')
    .trim()
    .toUpperCase()

  if (status === 'ACTIVE' || status === 'ARCHIVED') {
    return status
  }

  return undefined
}

function parseOptionalTextCell(value: unknown) {
  const text = String(value ?? '').trim()
  return text || undefined
}

function ensureJsonObject(value: unknown): JsonObject {
  if (isRecord(value)) {
    return value
  }

  return {}
}

function stringifyTemplateValue(value: unknown) {
  return JSON.stringify(value)
}

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, '-').trim() || '未命名'
}

function formatDateStamp(date: Date) {
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}${month}${day}`
}

function sampleValueFromSchema(schema: unknown): unknown {
  if (!isRecord(schema)) {
    return undefined
  }

  if (schema.example !== undefined) {
    return schema.example
  }

  if (schema.default !== undefined) {
    return schema.default
  }

  if (schema.type === 'object' && isRecord(schema.properties)) {
    return Object.fromEntries(
      Object.entries(schema.properties).map(([key, property]) => [
        key,
        sampleValueFromSchema(property) ?? '',
      ])
    )
  }

  if (schema.type === 'array') {
    return [sampleValueFromSchema(schema.items) ?? '']
  }

  if (schema.type === 'number' || schema.type === 'integer') {
    return 0
  }

  if (schema.type === 'boolean') {
    return true
  }

  if (schema.type === 'string') {
    return ''
  }

  return undefined
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
