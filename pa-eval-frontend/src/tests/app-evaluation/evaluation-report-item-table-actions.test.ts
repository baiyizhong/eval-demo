import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(
  'src/modules/app-evaluation/components/evaluation-report-item-table.tsx',
  'utf8'
)
const badcaseSource = readFileSync(
  'src/modules/app-evaluation/components/evaluation-report-badcase-table.tsx',
  'utf8'
)

test('evaluation report item table does not show the all-data flowback button', () => {
  const fixedActionSection = source.match(
    /return \(\s*<section[\s\S]*?<DataTable<EvaluationReportItemRecord>/
  )?.[0]

  assert.ok(fixedActionSection)
  assert.equal(fixedActionSection.includes('回流评测数据'), false)
  assert.equal(source.includes('回流已选择'), true)
})

test('evaluation report badcase table does not show the all-badcase flowback button', () => {
  const fixedActionSection = badcaseSource.match(
    /return \(\s*<section[\s\S]*?<DataTable<EvaluationReportBadcaseRecord>/
  )?.[0]

  assert.ok(fixedActionSection)
  assert.equal(fixedActionSection.includes('回流 Badcase'), false)
  assert.equal(badcaseSource.includes('回流已选择'), true)
})
