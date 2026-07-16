import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

test('trace dataset create form defaults to evaluation dataset type', () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      'src/modules/app-observability/components/trace-dataset-dialog.tsx'
    ),
    'utf8'
  )

  assert.match(source, /datasetType:\s*'evaluation'/)
  assert.match(source, /buildDefaultTraceDatasetName\(\s*'evaluation'/)
  assert.doesNotMatch(source, /datasetType:\s*'badcase'/)
  assert.doesNotMatch(source, /buildDefaultTraceDatasetName\(\s*'badcase'/)
})

test('trace dataset dialog can show report data range selector', () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      'src/modules/app-observability/components/trace-dataset-dialog.tsx'
    ),
    'utf8'
  )

  assert.match(source, /type TraceDatasetDataRange = 'BADCASE_ONLY' \| 'ALL'/)
  assert.match(source, /dataRangeOptions/)
  assert.match(source, /onDataRangeChange/)
  assert.match(source, /<Label htmlFor=\{dataRangeSelectId\}>数据范围<\/Label>/)
  assert.doesNotMatch(source, /<FormLabel>数据范围<\/FormLabel>/)
  assert.match(source, /仅 Badcase/)
  assert.match(source, /全部数据/)
})

test('trace dataset dialog uses generic create dataset wording', () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      'src/modules/app-observability/components/trace-dataset-dialog.tsx'
    ),
    'utf8'
  )

  assert.match(source, /新建数据集/)
  assert.doesNotMatch(source, /新建评测集/)
})
