import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const formSource = readFileSync(
  'src/modules/app-evaluation/components/annotation-queue-form-drawer.tsx',
  'utf8'
)
const fieldsSource = readFileSync(
  'src/modules/app-evaluation/components/annotation-assignment-fields.tsx',
  'utf8'
)
const traceDialogSource = readFileSync(
  'src/modules/app-observability/components/trace-annotation-dialog.tsx',
  'utf8'
)
const columnsSource = readFileSync(
  'src/modules/app-evaluation/components/annotation-queue-item-columns.tsx',
  'utf8'
)
const bulkActionsSource = readFileSync(
  'src/modules/app-evaluation/components/annotation-queue-item-bulk-actions.tsx',
  'utf8'
)
const typesSource = readFileSync('src/modules/app-evaluation/types.ts', 'utf8')
const apiSource = readFileSync(
  'src/modules/app-evaluation/api/annotation-api.ts',
  'utf8'
)
const registrySource = readFileSync('src/api/registry.ts', 'utf8')

test('annotation queue form exposes assignment strategy only for multiple assignees', () => {
  assert.match(typesSource, /AnnotationAssignmentStrategy/)
  assert.match(typesSource, /assignmentStrategy: AnnotationAssignmentStrategy/)
  assert.match(typesSource, /assignmentWeights: Record<string, number>/)
  assert.match(fieldsSource, /form\.watch\('assigneeIds'\)/)
  assert.match(fieldsSource, /selectedAssigneeIds\.length <= 1/)
  assert.match(fieldsSource, /name='assignmentStrategy'/)
  assert.match(fieldsSource, /SelectTrigger/)
  assert.match(fieldsSource, /平均分配/)
  assert.match(fieldsSource, /随机分配/)
  assert.match(fieldsSource, /按权重分配/)
  assert.match(formSource, /AnnotationAssignmentFields/)
  assert.match(traceDialogSource, /AnnotationAssignmentFields/)
})

test('weighted assignment renders per-assignee weight inputs', () => {
  assert.match(fieldsSource, /assignmentStrategy === 'weighted'/)
  assert.match(fieldsSource, /assignmentWeights/)
  assert.match(fieldsSource, /type='number'/)
  assert.match(fieldsSource, /min=\{1\}/)
})

test('annotation queue item list displays assigned handler separately from completion user', () => {
  assert.match(typesSource, /assignee: ProjectUserRecord \| null/)
  assert.match(columnsSource, /accessorKey: 'assignee'/)
  assert.match(columnsSource, /row\.original\.assignee\?\.name/)
  assert.doesNotMatch(
    columnsSource,
    /row\.original\.completedBy\?\.name \?\? '-'/
  )
})

test('annotation queue item list keeps source data id instead of duplicate source title', () => {
  assert.match(columnsSource, /title='源数据 ID'/)
  assert.match(columnsSource, /accessorKey: 'objectId'/)
  assert.doesNotMatch(columnsSource, /accessorKey: 'source\.title'/)
  assert.doesNotMatch(columnsSource, /title='源对象 ID'/)
})

test('annotation queue api accepts persisted assignment options', () => {
  assert.match(apiSource, /assignmentStrategy/)
  assert.match(apiSource, /assignmentWeights/)
})

test('annotation queue item bulk actions can manually update assignee and skip completed items', () => {
  assert.match(typesSource, /AnnotationQueueItemAssigneeUpdateResult/)
  assert.match(registrySource, /updateProjectAnnotationQueueItemAssignees/)
  assert.match(apiSource, /updateProjectAnnotationQueueItemAssignees/)
  assert.match(apiSource, /assigneeUserId/)
  assert.match(bulkActionsSource, /修改处理人/)
  assert.match(bulkActionsSource, /已完成的数据会自动跳过/)
  assert.match(bulkActionsSource, /不按任务分配策略/)
  assert.match(bulkActionsSource, /skippedCount/)
})
