import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const evaluatorsSource = readFileSync(
  'src/modules/tasks/views/evaluators.tsx',
  'utf8'
)

test('评估器新建和详情统一使用抽屉组件', () => {
  assert.match(
    evaluatorsSource,
    /import \{ Drawer \} from '@\/components\/common\/drawer'/
  )
  assert.equal(evaluatorsSource.includes('FormDialog'), false)
  assert.equal((evaluatorsSource.match(/<Drawer\b/g) ?? []).length, 2)
})

test('新建评估器抽屉在内容区右下角展示操作按钮', () => {
  assert.match(evaluatorsSource, /actions=\{null\}/)
  assert.match(
    evaluatorsSource,
    /className='[^']*sticky[^']*bottom-0[^']*justify-end[^']*'/
  )
  assert.match(evaluatorsSource, /form=\{createEvaluatorFormId\}/)
  assert.match(evaluatorsSource, /setCreateOpen\(false\)/)
})

test('新建评估器默认使用当前项目且隐藏所属项目选择', () => {
  assert.match(evaluatorsSource, /projectId:\s*projectId/)
  assert.match(
    evaluatorsSource,
    /createTaskEvaluator\(\$api,\s*\{\s*\.\.\.values,\s*projectId\s*,?\s*\}\)/
  )
  assert.doesNotMatch(evaluatorsSource, /name='projectId'/)
  assert.doesNotMatch(evaluatorsSource, /<FormLabel>所属项目<\/FormLabel>/)
  assert.doesNotMatch(evaluatorsSource, /getProjects<PaginatedResult/)
})
