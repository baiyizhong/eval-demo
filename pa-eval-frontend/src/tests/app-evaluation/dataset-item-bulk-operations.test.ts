import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const bulkActionsSource = readFileSync(
  new URL(
    '../../modules/app-evaluation/components/dataset-item-bulk-actions.tsx',
    import.meta.url
  ),
  'utf8'
)
const targetDialogSource = readFileSync(
  new URL(
    '../../modules/app-evaluation/components/dataset-target-dialog.tsx',
    import.meta.url
  ),
  'utf8'
)
const treeSelectSource = readFileSync(
  new URL('../../components/common/tree-select.tsx', import.meta.url),
  'utf8'
)
const treeViewSource = readFileSync(
  new URL('../../components/common/tree-view.tsx', import.meta.url),
  'utf8'
)
const datasetApiSource = readFileSync(
  new URL('../../modules/app-evaluation/api/dataset-api.ts', import.meta.url),
  'utf8'
)

test('dataset item bulk actions expose concise export copy move and delete actions', () => {
  assert.match(bulkActionsSource, /'导出'/)
  assert.match(bulkActionsSource, />\s*复制\s*</)
  assert.match(bulkActionsSource, />\s*移动\s*</)
  assert.match(bulkActionsSource, />\s*删除\s*</)
  assert.doesNotMatch(bulkActionsSource, /导出选中/)
  assert.doesNotMatch(bulkActionsSource, /复制选中/)
  assert.doesNotMatch(bulkActionsSource, /移动选中/)
  assert.doesNotMatch(bulkActionsSource, /删除选中/)
  assert.match(bulkActionsSource, /confirm\(\{/)
  assert.match(bulkActionsSource, /title: '删除数据项'/)
})

test('dataset item operations submit selected ids or filtered snapshots', () => {
  assert.match(bulkActionsSource, /createProjectDatasetItemOperation/)
  assert.match(bulkActionsSource, /scope: 'selected'/)
  assert.match(bulkActionsSource, /itemIds: selectedItems\.map/)
  assert.match(bulkActionsSource, /scope: 'filtered'/)
  assert.match(bulkActionsSource, /selection\.isAllMatchingRowsSelected/)
  assert.match(bulkActionsSource, /targetDatasetId/)
})

test('dataset target dialog exposes a dataset tree but only dataset nodes are selectable', () => {
  assert.match(targetDialogSource, /FormDialog/)
  assert.match(targetDialogSource, /TreeSelect/)
  assert.match(targetDialogSource, /buildDatasetTreeNodes/)
  assert.match(targetDialogSource, /kind === 'dataset'/)
  assert.match(targetDialogSource, /selectableKinds=\{\['item'\]\}/)
  assert.match(
    targetDialogSource,
    /disabled: node\.datasetId === currentDatasetId/
  )
})

test('tree select composes popover trigger with searchable tree view', () => {
  assert.match(treeSelectSource, /PopoverTrigger/)
  assert.match(treeSelectSource, /role='combobox'/)
  assert.match(treeSelectSource, /TreeView/)
  assert.match(treeSelectSource, /searchable/)
  assert.match(treeSelectSource, /getNodePath/)
})

test('tree view expand action does not select the node', () => {
  assert.match(treeViewSource, /onToggle=\{\(\) => \{/)
  assert.doesNotMatch(
    treeViewSource,
    /onToggle=\{\(\) => \{\s*onSelect\?\.\(node\)/
  )
})

test('dataset api declares the batch item operation endpoint', () => {
  assert.match(datasetApiSource, /createProjectDatasetItemOperation/)
  assert.match(datasetApiSource, /DatasetItemOperationInput/)
  assert.match(datasetApiSource, /DatasetItemOperationResult/)
})
