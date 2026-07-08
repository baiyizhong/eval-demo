import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const apiSource = readFileSync(
  'src/modules/app-evaluation/api/annotation-api.ts',
  'utf8'
)
const registrySource = readFileSync('src/api/registry.ts', 'utf8')
const routesSource = readFileSync('src/routes/index.tsx', 'utf8')
const queueColumnsSource = readFileSync(
  'src/modules/app-evaluation/components/annotation-queue-columns.tsx',
  'utf8'
)

test('annotation queue list exposes the batch annotation entry', () => {
  assert.match(queueColumnsSource, /进入标注/)
  assert.match(queueColumnsSource, /数据管理/)
  assert.match(queueColumnsSource, /manual-annotations/)
  assert.match(queueColumnsSource, /batch/)
})

test('batch annotation page is routed with PRD path', () => {
  assert.match(routesSource, /ProjectAnnotationBatch/)
  assert.match(routesSource, /manual-annotations\/:queueId\/batch/)
})

test('batch annotation api helpers call preview and submit endpoints', () => {
  assert.match(apiSource, /previewProjectAnnotationBatch/)
  assert.match(apiSource, /saveProjectAnnotationBatchScores/)
  assert.match(apiSource, /JSON\.stringify\(metadataFilters\)/)
  assert.match(registrySource, /previewProjectAnnotationBatch/)
  assert.match(registrySource, /saveProjectAnnotationBatchScores/)
  assert.match(registrySource, /batch-preview/)
  assert.match(registrySource, /batch-scores/)
})

test('batch annotation workspace contains single and batch workflows', () => {
  const pageSource = readFileSync(
    'src/modules/app-evaluation/views/annotation-batch.tsx',
    'utf8'
  )

  assert.match(pageSource, /批量标注工作台/)
  assert.match(pageSource, /按当前筛选批量标注/)
  assert.match(pageSource, /保存并下一条/)
  assert.match(pageSource, /高级筛选/)
  assert.match(pageSource, /metadata key/)
  assert.match(pageSource, /跳过/)
  assert.match(pageSource, /上次提交结果/)
  assert.match(pageSource, /confirm\(/)
  assert.match(pageSource, /AnnotationDatasetDialog/)
  assert.match(pageSource, /addProjectAnnotationItemToDataset/)
  assert.match(pageSource, /useSearchParams/)
  assert.match(pageSource, /metadataFilters/)
  assert.match(pageSource, /重试失败项/)
  assert.match(pageSource, /继续下一批/)
  assert.match(pageSource, /previewProjectAnnotationBatch/)
  assert.match(pageSource, /saveProjectAnnotationBatchScores/)
  assert.match(pageSource, /AnnotationScoreForm/)
  assert.match(pageSource, /AnnotationSourcePanel/)
})
