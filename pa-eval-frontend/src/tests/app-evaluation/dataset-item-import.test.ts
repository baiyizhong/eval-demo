import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as XLSX from 'xlsx'
import {
  buildDatasetItemImportTemplateBlob,
  getDatasetItemImportTemplateFileName,
  parseDatasetItemImportRows,
} from '../../modules/app-evaluation/lib/dataset-item-import.ts'
import type { DatasetRecord } from '../../modules/app-evaluation/types.ts'

test('dataset item import parses tabular rows with JSON model fields', () => {
  const result = parseDatasetItemImportRows([
    [
      'id',
      'status',
      'input',
      'expectedOutput',
      'metadata',
      'sourceTraceId',
      'sourceObservationId',
      'createdAt',
      'updatedAt',
    ],
    [
      'item-1',
      'ACTIVE',
      '{"question":"怎么退款？"}',
      '{"answer":"在订单详情申请退款"}',
      '{"source":"manual"}',
      'trace-1',
      'observation-1',
      '2026-07-11T00:00:00.000Z',
      '2026-07-11T00:00:00.000Z',
    ],
  ])

  assert.deepEqual(result.failures, [])
  assert.deepEqual(result.itemRows, [2])
  assert.deepEqual(result.items, [
    {
      input: { question: '怎么退款？' },
      expectedOutput: { answer: '在订单详情申请退款' },
      metadata: { source: 'manual' },
      status: 'ACTIVE',
      sourceTraceId: 'trace-1',
      sourceObservationId: 'observation-1',
    },
  ])
})

test('dataset item import reports invalid JSON by source row', () => {
  const result = parseDatasetItemImportRows([
    ['Input', 'Expected Output', 'Metadata'],
    ['not-json', '{"answer":"ok"}', '{}'],
    ['{"question":"ok"}', '{"answer":"ok"}', '{}'],
  ])

  assert.equal(result.items.length, 1)
  assert.deepEqual(result.itemRows, [3])
  assert.deepEqual(result.failures, [
    {
      row: 2,
      field: 'input',
      reason: 'input 必须是合法 JSON',
    },
  ])
})

test('dataset item import template uses dataset schemas and safe file name', async () => {
  const dataset: DatasetRecord = {
    id: 'dataset-1',
    projectId: 'project-1',
    name: '回流/评测集',
    description: '',
    type: 'evaluation',
    metadata: { type: 'evaluation' },
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
      },
    },
    expectedOutputSchema: {
      type: 'object',
      properties: {
        answer: { type: 'string' },
      },
    },
    itemCount: 0,
    runCount: 0,
    createdAt: '',
    updatedAt: '',
  }

  const blob = await buildDatasetItemImportTemplateBlob(dataset)

  assert.equal(
    blob.type,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
  assert.match(
    getDatasetItemImportTemplateFileName(
      dataset,
      'lhx 默认项目',
      new Date('2027-07-11T00:00:00.000Z')
    ),
    /^数据集导入模板v1\.0\.xlsx$/
  )

  const workbook = XLSX.read(await blob.arrayBuffer(), { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  assert.ok(sheetName)
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    raw: false,
  })

  assert.deepEqual(rows[0], [
    'id',
    'status',
    'input',
    'expectedOutput',
    'metadata',
    'sourceTraceId',
    'sourceObservationId',
    'createdAt',
    'updatedAt',
  ])
})
