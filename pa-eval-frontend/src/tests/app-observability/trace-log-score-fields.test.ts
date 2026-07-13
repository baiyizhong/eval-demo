import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import {
  createTraceScoreColumns,
  formatTraceScoreValue,
  getTraceScoreColumnNames,
} from '../../modules/app-observability/components/trace-log-columns.tsx'

test('trace log row type and table expose Langfuse score fields', () => {
  const typeSource = readFileSync(
    resolve(process.cwd(), 'src/modules/app-observability/types.ts'),
    'utf8'
  )
  const columnsSource = readFileSync(
    resolve(
      process.cwd(),
      'src/modules/app-observability/components/trace-log-columns.tsx'
    ),
    'utf8'
  )
  const viewSource = readFileSync(
    resolve(
      process.cwd(),
      'src/modules/app-observability/views/trace-logs.tsx'
    ),
    'utf8'
  )

  assert.match(typeSource, /export type TraceScore =/)
  assert.match(typeSource, /scores\?: TraceScore\[\]/)
  assert.match(typeSource, /scoreSummary\?: string/)
  assert.match(columnsSource, /createTraceScoreColumns/)
  assert.doesNotMatch(columnsSource, /accessorKey: 'scoreSummary'/)
  assert.doesNotMatch(viewSource, /scoreSummary: 'Score'/)
})

test('trace log score fields expand each score name into a stable column', () => {
  const rows = [
    {
      traceId: 'trace-1',
      scores: [
        { id: 'score-1', name: 'answer-quality-evaluator', value: 0.82 },
        { id: 'score-2', name: 'toxicity', value: 0 },
      ],
    },
    {
      traceId: 'trace-2',
      scores: [
        { id: 'score-3', name: 'answer-quality-evaluator', value: 0.91 },
        { id: 'score-4', name: '主观质量评价', stringValue: '通过' },
      ],
    },
  ]

  assert.deepEqual(getTraceScoreColumnNames(rows), [
    'answer-quality-evaluator',
    'toxicity',
    '主观质量评价',
  ])

  const columns = createTraceScoreColumns(rows)
  assert.deepEqual(
    columns.map((column) => column.id),
    [
      'score:answer-quality-evaluator',
      'score:toxicity',
      'score:主观质量评价',
    ]
  )
})

test('trace log score field displays label value before numeric value', () => {
  assert.equal(
    formatTraceScoreValue({
      id: 'score-1',
      name: 'answer-quality-evaluator',
      value: 1,
      stringValue: '主观质量评价',
    }),
    '主观质量评价'
  )
  assert.equal(
    formatTraceScoreValue({
      id: 'score-2',
      name: 'answer-quality-evaluator',
      value: 0.5,
      longStringValue: '内容完整',
    }),
    '内容完整'
  )
  assert.equal(
    formatTraceScoreValue({
      id: 'score-3',
      name: 'answer-quality-evaluator',
      value: 0.82,
    }),
    '0.82'
  )
})

test('observability api registry contains observation detail endpoint', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/modules/app-observability/api/index.ts'),
    'utf8'
  )

  assert.match(source, /getProjectTraceObservation/)
  assert.match(source, /\/projects\/:projectId\/traces\/:traceId\/observations\/:observationId/)
})
