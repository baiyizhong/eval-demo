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
const queueRowActionsSource = readFileSync(
  'src/modules/app-evaluation/components/annotation-queue-row-actions.tsx',
  'utf8'
)
const queueDetailSource = readFileSync(
  'src/modules/app-evaluation/views/annotation-queue-detail.tsx',
  'utf8'
)
const queueListSource = readFileSync(
  'src/modules/app-evaluation/views/annotation-queues.tsx',
  'utf8'
)

test('annotation queue list exposes the batch annotation entry', () => {
  assert.match(queueColumnsSource, /开始标注/)
  assert.match(queueColumnsSource, /继续标注/)
  assert.match(queueColumnsSource, /completedCount >= 1/)
  assert.match(queueColumnsSource, /canEdit\?: boolean/)
  assert.match(queueColumnsSource, /if \(canEdit\)/)
  assert.match(queueColumnsSource, /annotation-queues/)
  assert.match(
    queueColumnsSource,
    /onExport\?: \(queue: AnnotationQueueRecord\) => void/
  )
  assert.match(queueColumnsSource, /onExport={onExport}/)
  assert.match(queueRowActionsSource, /导出数据/)
  assert.match(queueListSource, /exportProjectAnnotationQueue/)
  assert.match(queueListSource, /handleExportQueue/)
  assert.match(queueListSource, /downloadJson/)
  assert.doesNotMatch(queueDetailSource, /全量导出/)
  assert.doesNotMatch(queueColumnsSource, /进入标注/)
  assert.doesNotMatch(queueColumnsSource, /数据管理/)
  assert.doesNotMatch(queueColumnsSource, /row\.original\.id}\/batch-annotate/)
})

test('batch annotation page is routed with PRD path', () => {
  assert.match(routesSource, /ProjectAnnotationBatch/)
  assert.match(routesSource, /manual-annotations\/:queueId\/batch/)
  assert.match(routesSource, /annotation-queues\/:queueId\/batch-annotate/)
})

test('batch annotation api helpers call preview and submit endpoints', () => {
  assert.match(apiSource, /previewProjectAnnotationBatch/)
  assert.match(apiSource, /saveProjectAnnotationBatchScores/)
  assert.match(apiSource, /api\.previewProjectAnnotationBatch/)
  assert.match(apiSource, /api\.saveProjectAnnotationBatchScores/)
  assert.match(apiSource, /JSON\.stringify\(metadataFilters\)/)
  assert.match(apiSource, /JSON\.stringify\(inputFilters\)/)
  assert.match(apiSource, /JSON\.stringify\(outputFilters\)/)
  assert.match(registrySource, /previewProjectAnnotationBatch/)
  assert.match(registrySource, /saveProjectAnnotationBatchScores/)
  assert.match(registrySource, /batch-preview/)
  assert.match(registrySource, /batch-scores/)
})

test('batch annotation workspace focuses on pending item scoring layout', () => {
  const pageSource = readFileSync(
    'src/modules/app-evaluation/views/annotation-batch.tsx',
    'utf8'
  )
  const scoreFormSource = readFileSync(
    'src/modules/app-evaluation/components/annotation-score-form.tsx',
    'utf8'
  )

  assert.match(pageSource, /批量标注工作台/)
  assert.match(scoreFormSource, /保存并下一条/)
  assert.match(scoreFormSource, /showAddToDataset/)
  assert.match(pageSource, /TableHeader/)
  assert.match(pageSource, /AnnotationItemTableRows/)
  assert.match(pageSource, /高级筛选/)
  assert.match(pageSource, /BatchAdvancedFilterPopover/)
  assert.match(pageSource, /BatchViewOptions/)
  assert.match(pageSource, /添加 Metadata 条件/)
  assert.match(pageSource, /添加 Input 条件/)
  assert.match(pageSource, /添加 Output 条件/)
  assert.match(pageSource, /inputFilters/)
  assert.match(pageSource, /outputFilters/)
  assert.match(pageSource, /assigneeIds/)
  assert.match(pageSource, /selectedAssigneeId/)
  assert.match(pageSource, /处理人/)
  assert.match(pageSource, /全部处理人/)
  assert.match(pageSource, /listProjectAnnotationUsers/)
  assert.match(pageSource, /getProjectAnnotationQueueItemFilterCounts/)
  assert.match(pageSource, /createBatchAssigneeOptions/)
  assert.doesNotMatch(pageSource, /queue\.assignees\.map/)
  assert.match(pageSource, /assigneeId: selectedAssigneeId/)
  assert.match(pageSource, /filterMockBatchItems\([\s\S]*selectedAssigneeId/)
  assert.match(pageSource, /saveProjectAnnotationScores/)
  assert.match(pageSource, /saveProjectAnnotationBatchScores/)
  assert.match(pageSource, /expectedPendingCount/)
  assert.match(pageSource, /successItemIds/)
  assert.match(pageSource, /上一页/)
  assert.match(pageSource, /下一页/)
  assert.match(pageSource, /调整左右区域宽度/)
  assert.match(pageSource, /scorePaneWidth/)
  assert.match(pageSource, /useState\(400\)/)
  assert.match(pageSource, /--annotation-score-width/)
  assert.match(pageSource, /minmax\(320px,var\(--annotation-score-width\)\)/)
  assert.match(pageSource, /HoverCard/)
  assert.match(pageSource, /批量保存/)
  assert.match(pageSource, /将批量保存已选中的/)
  assert.doesNotMatch(pageSource, /应用到选中项/)
  assert.doesNotMatch(pageSource, /将应用到已选中的/)
  assert.match(pageSource, /showSaveNext/)
  assert.match(pageSource, /sourceDataId: '源数据 ID'/)
  assert.match(pageSource, /assignee: '处理人'/)
  assert.match(pageSource, /columnVisibility\.sourceDataId/)
  assert.match(pageSource, /columnVisibility\.assignee/)
  assert.match(pageSource, /label='源数据 ID'[\s\S]*value=\{item\.objectId\}/)
  assert.match(pageSource, /item\.assignee\?\.name/)
  assert.doesNotMatch(pageSource, /source: '源对象'/)
  assert.match(pageSource, /类型/)
  assert.match(pageSource, /状态/)
  assert.match(pageSource, /Input/)
  assert.match(pageSource, /Output/)
  assert.match(pageSource, /Metadata/)
  assert.match(pageSource, /保存后自动移出左侧列表/)
  assert.match(pageSource, /useSearchParams/)
  assert.match(pageSource, /metadataFilters/)
  assert.match(pageSource, /AnnotationScoreForm/)
  assert.doesNotMatch(pageSource, /源对象摘要/)
  assert.doesNotMatch(pageSource, /placeholder='Metadata key'/)
  assert.doesNotMatch(pageSource, /placeholder='Metadata value'/)
  assert.doesNotMatch(pageSource, /AnnotationSourcePanel/)
  assert.doesNotMatch(pageSource, /AnnotationDatasetDialog/)
  assert.doesNotMatch(pageSource, /按当前筛选批量标注/)
  assert.doesNotMatch(pageSource, /上次提交结果/)
  assert.doesNotMatch(pageSource, /confirm\(/)
})
