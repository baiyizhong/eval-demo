import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const traceAnnotationDialogSource = readFileSync(
  'src/modules/app-observability/components/trace-annotation-dialog.tsx',
  'utf8'
)

const annotationQueueDrawerSource = readFileSync(
  'src/modules/app-evaluation/components/annotation-queue-form-drawer.tsx',
  'utf8'
)

test('发起人工标注弹窗使用 Badge 区分评分指标类型', () => {
  assert.match(traceAnnotationDialogSource, /@\/components\/ui\/badge/)
  assert.match(traceAnnotationDialogSource, /<Badge variant='secondary'/)
  assert.match(traceAnnotationDialogSource, /scoreDataTypeLabels\[config\.dataType\]/)
  assert.match(traceAnnotationDialogSource, /<span className='truncate'>/)
  assert.doesNotMatch(traceAnnotationDialogSource, /\{config\.name\} ·/)
})

test('人工标注任务抽屉使用一致的评分指标类型展示', () => {
  assert.match(annotationQueueDrawerSource, /@\/components\/ui\/badge/)
  assert.match(annotationQueueDrawerSource, /<Badge variant='secondary'/)
  assert.match(annotationQueueDrawerSource, /scoreDataTypeLabels\[config\.dataType\]/)
  assert.match(annotationQueueDrawerSource, /<span className='truncate'>/)
  assert.doesNotMatch(annotationQueueDrawerSource, /\{config\.name\} ·/)
})

test('人工标注任务抽屉评分指标列表超过边界后内部滚动', () => {
  assert.match(annotationQueueDrawerSource, /annotation-score-config-list/)
  assert.match(annotationQueueDrawerSource, /max-h-\[min\(22rem,40svh\)\]/)
  assert.match(annotationQueueDrawerSource, /overflow-y-auto/)
})
