import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as XLSX from 'xlsx'
import {
  buildDatasetItemExportWorkbookBlob,
  getDatasetExportFileName,
} from '../../modules/app-evaluation/lib/dataset-item-export.ts'
import type {
  DatasetItemRecord,
  DatasetRecord,
} from '../../modules/app-evaluation/types.ts'

const dataset: DatasetRecord = {
  id: 'dataset-1',
  projectId: 'project-1',
  name: '客服/黄金集',
  description: '',
  type: 'golden',
  metadata: { type: 'golden' },
  inputSchema: {},
  expectedOutputSchema: {},
  itemCount: 1,
  runCount: 0,
  createdAt: '',
  updatedAt: '',
}

const item: DatasetItemRecord = {
  id: 'item-1',
  projectId: 'project-1',
  datasetId: 'dataset-1',
  status: 'ACTIVE',
  input: { question: '怎么退款？' },
  expectedOutput: { answer: '在订单详情申请退款' },
  metadata: { source: 'manual' },
  sourceTraceId: 'trace-1',
  sourceObservationId: 'observation-1',
  createdAt: '2026-07-19T08:00:00.000Z',
  updatedAt: '2026-07-19T09:00:00.000Z',
}

test('dataset export file name uses bracketed type, dataset name, and date', () => {
  assert.equal(
    getDatasetExportFileName(dataset, 'xlsx', new Date('2026-07-19T00:00:00')),
    '【黄金集】客服-黄金集20260719.xlsx'
  )
})

test('selected dataset item export builds an Excel workbook', async () => {
  const blob = await buildDatasetItemExportWorkbookBlob([item])

  assert.equal(
    blob.type,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
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
  assert.deepEqual(rows[1], [
    'item-1',
    'ACTIVE',
    '{"question":"怎么退款？"}',
    '{"answer":"在订单详情申请退款"}',
    '{"source":"manual"}',
    'trace-1',
    'observation-1',
    '2026-07-19T08:00:00.000Z',
    '2026-07-19T09:00:00.000Z',
  ])
})
