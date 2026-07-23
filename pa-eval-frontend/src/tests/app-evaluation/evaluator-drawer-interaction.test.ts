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
  assert.equal((evaluatorsSource.match(/<Drawer\b/g) ?? []).length, 3)
})

test('新建评估器抽屉在内容区右下角展示操作按钮', () => {
  assert.match(evaluatorsSource, /actions=\{null\}/)
  assert.match(
    evaluatorsSource,
    /className='[^']*sticky[^']*bottom-0[^']*justify-end[^']*'/
  )
  assert.match(evaluatorsSource, /formId=\{createEvaluatorFormId\}/)
  assert.match(evaluatorsSource, /setCreateOpen\(false\)/)
})

test('新建评估器默认使用当前项目且隐藏所属项目选择', () => {
  assert.match(evaluatorsSource, /projectId:\s*projectId/)
  assert.match(
    evaluatorsSource,
    /createTaskEvaluator\(\$api,\s*\{\s*\.\.\.values,\s*projectId,\s*outputVariables\s*\}\)/
  )
  assert.doesNotMatch(evaluatorsSource, /name='projectId'/)
  assert.doesNotMatch(evaluatorsSource, /<FormLabel>所属项目<\/FormLabel>/)
  assert.doesNotMatch(evaluatorsSource, /getProjects<PaginatedResult/)
})

test('评估器操作列提供编辑入口并复用新建表单抽屉', () => {
  assert.match(evaluatorsSource, /编辑评估器/)
  assert.match(evaluatorsSource, /onEdit/)
  assert.match(evaluatorsSource, /handleEdit/)
  assert.match(evaluatorsSource, /updateTaskEvaluator/)
  assert.match(evaluatorsSource, /buildEvaluatorFormValuesFromDetail/)
  assert.match(evaluatorsSource, /title='编辑评估器'/)
  assert.match(evaluatorsSource, /formId=\{editEvaluatorFormId\}/)
  assert.match(evaluatorsSource, /保存/)
})

test('新建评估器输出变量使用独立卡片并绑定评分指标', () => {
  assert.match(evaluatorsSource, /listProjectScoreConfigs/)
  assert.match(
    evaluatorsSource,
    /queryKey:\s*\['project-score-config-names',\s*\$api,\s*projectId\]/
  )
  assert.match(evaluatorsSource, /<OutputVariableMappingsField\b/)
  assert.match(evaluatorsSource, /outputVariableMappings/)
  assert.match(evaluatorsSource, /添加输出变量/)
  assert.match(evaluatorsSource, /<FormLabel[^>]*>变量名<\/FormLabel>/)
  assert.match(evaluatorsSource, /<FormLabel[^>]*>\s*评分指标\s*<\/FormLabel>/)
  assert.match(evaluatorsSource, /overflow-hidden rounded-md border/)
  assert.match(evaluatorsSource, /scoreConfigs\.map\(\(scoreConfig\)/)
  assert.doesNotMatch(
    evaluatorsSource,
    /<FormLabel>输出变量<\/FormLabel>[\s\S]{0,120}<Input/
  )
})
