import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const columnsSource = readFileSync(
  'src/modules/scheduled-jobs/components/scheduled-job-columns.tsx',
  'utf8'
)

test('scheduled job row actions display semantic icons', () => {
  assert.match(
    columnsSource,
    /<Pencil data-icon='inline-start' \/>[\s\S]*?查看\/编辑/
  )
  assert.match(columnsSource, /<Pause data-icon='inline-start' \/>[\s\S]*?暂停/)
  assert.match(columnsSource, /<Play data-icon='inline-start' \/>[\s\S]*?恢复/)
  assert.match(
    columnsSource,
    /<RefreshCw data-icon='inline-start' \/>[\s\S]*?手动执行/
  )
  assert.match(
    columnsSource,
    /<Zap data-icon='inline-start' \/>[\s\S]*?模拟 JOB 触发/
  )
  assert.match(
    columnsSource,
    /<Trash2 data-icon='inline-start' \/>[\s\S]*?删除/
  )
})
