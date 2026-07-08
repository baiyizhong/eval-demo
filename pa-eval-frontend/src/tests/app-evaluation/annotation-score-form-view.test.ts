import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(
  'src/modules/app-evaluation/components/annotation-score-form.tsx',
  'utf8'
)
const pageSource = readFileSync(
  'src/modules/app-evaluation/views/annotation-item-annotate.tsx',
  'utf8'
)

test('annotation score form uses compact list rows instead of heavy cards', () => {
  assert.match(source, /annotation-score-list/)
  assert.match(source, /annotation-score-row/)
  assert.doesNotMatch(source, /rounded-lg border p-3/)
})

test('annotation score form keeps score labels accessible while reducing visible copy', () => {
  assert.match(source, /sr-only/)
  assert.match(source, /评审说明/)
  assert.match(source, /填写评审说明/)
  assert.match(source, /请输入本次人工评审的补充说明/)
  assert.doesNotMatch(source, /placeholder='备注（可选）'/)
  assert.doesNotMatch(source, /填写该指标的标注备注/)
})

test('boolean score form uses a segmented toggle control instead of tiny radio dots', () => {
  assert.match(source, /ToggleGroup/)
  assert.match(source, /ToggleGroupItem/)
  assert.match(source, /type='single'/)
  assert.match(source, /parseBooleanScoreInput/)
  assert.match(source, /是否通过/)
})

test('annotation score form uses business friendly controls for option scores', () => {
  assert.doesNotMatch(source, /RadioGroup/)
  assert.doesNotMatch(source, /RadioGroupItem/)
  assert.match(source, /getBooleanScoreOptions/)
  assert.match(source, /getCategoricalScoreOptions/)
  assert.match(source, /结果分类/)
  assert.match(source, /数值评分/)
})

test('annotation detail right panel keeps the score header compact', () => {
  assert.doesNotMatch(pageSource, /人工标注表单/)
  assert.match(pageSource, /评分指标/)
  assert.match(pageSource, /queue\.scoreConfigs\.length/)
})

test('annotation detail score panel matches batch page resizable width behavior', () => {
  assert.match(pageSource, /scorePaneWidth/)
  assert.match(pageSource, /useState\(400\)/)
  assert.match(pageSource, /--annotation-score-width/)
  assert.match(pageSource, /调整左右区域宽度/)
  assert.match(pageSource, /GripVertical/)
  assert.match(pageSource, /minmax\(320px,var\(--annotation-score-width\)\)/)
})

test('categorical score form uses select control with business copy', () => {
  assert.match(source, /SelectTrigger/)
  assert.match(source, /SelectItem/)
  assert.match(source, /请选择评审结果/)
  assert.doesNotMatch(source, /shouldUseCategoricalSelect/)
  assert.doesNotMatch(source, /选择分类/)
})

test('numeric score form uses slider with compact numeric input', () => {
  assert.match(source, /Slider/)
  assert.match(source, /grid-cols-\[minmax\(0,1fr\)_5rem\]/)
  assert.match(source, /placeholder='分值'/)
})

test('annotation source panel uses lightweight sections instead of nested cards', () => {
  const sourcePanel = readFileSync(
    'src/modules/app-evaluation/components/annotation-source-panel.tsx',
    'utf8'
  )

  assert.doesNotMatch(sourcePanel, /@\/components\/ui\/card/)
  assert.match(sourcePanel, /AnnotationSourceSection/)
  assert.match(sourcePanel, /formatAnnotationScoreDisplay/)
})
