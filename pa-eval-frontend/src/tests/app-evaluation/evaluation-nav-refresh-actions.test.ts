import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const autoEvaluationsSource = readFileSync(
  'src/modules/app-evaluation/views/auto-evaluations.tsx',
  'utf8'
)
const annotationQueuesSource = readFileSync(
  'src/modules/app-evaluation/views/annotation-queues.tsx',
  'utf8'
)
const datasetsSource = readFileSync(
  'src/modules/app-evaluation/views/datasets.tsx',
  'utf8'
)
const evaluatorsSource = readFileSync(
  'src/modules/tasks/views/evaluators.tsx',
  'utf8'
)

test('evaluation navigation pages place refresh before create actions', () => {
  for (const source of [
    autoEvaluationsSource,
    annotationQueuesSource,
    datasetsSource,
    evaluatorsSource,
  ]) {
    assert.match(source, /icon: RefreshCw/)
    assert.match(source, /label: '刷新'[\s\S]*label: '新建/)
    assert.match(source, /onClick: \(\) => void handleRefresh\(\)/)
  }
})

