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
  assert.match(source, /placeholder='备注（可选）'/)
  assert.doesNotMatch(source, /填写该指标的标注备注/)
})

test('boolean score form uses a segmented toggle control instead of tiny radio dots', () => {
  assert.match(source, /ToggleGroup/)
  assert.match(source, /ToggleGroupItem/)
  assert.match(source, /type='single'/)
  assert.match(source, /parseBooleanScoreInput/)
})

test('annotation score form uses segmented choices for all option scores', () => {
  assert.doesNotMatch(source, /RadioGroup/)
  assert.doesNotMatch(source, /RadioGroupItem/)
  assert.match(source, /getBooleanScoreOptions/)
  assert.match(source, /getCategoricalScoreOptions/)
})

test('annotation detail right panel keeps the score header compact', () => {
  assert.doesNotMatch(pageSource, /人工标注表单/)
  assert.match(pageSource, /评分指标/)
  assert.match(pageSource, /queue\.scoreConfigs\.length/)
})

test('categorical score form switches dense option sets to select control', () => {
  assert.match(source, /shouldUseCategoricalSelect/)
  assert.match(source, /SelectTrigger/)
  assert.match(source, /SelectItem/)
  assert.match(source, /选择分类/)
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
