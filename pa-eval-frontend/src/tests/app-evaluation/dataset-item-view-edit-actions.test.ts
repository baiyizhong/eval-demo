import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const columnsSource = readFileSync(
  'src/modules/app-evaluation/components/dataset-item-columns.tsx',
  'utf8'
)
const rowActionsSource = readFileSync(
  'src/modules/app-evaluation/components/dataset-item-row-actions.tsx',
  'utf8'
)
const drawerSource = readFileSync(
  'src/modules/app-evaluation/components/dataset-item-form-drawer.tsx',
  'utf8'
)
const detailSource = readFileSync(
  'src/modules/app-evaluation/views/dataset-detail.tsx',
  'utf8'
)

test('dataset item id opens a view-only drawer', () => {
  assert.match(columnsSource, /onView\?: \(item: DatasetItemRecord\) => void/)
  assert.match(columnsSource, /onView\(row\.original\)/)
  assert.match(columnsSource, /aria-label=\{`查看数据项/)
  assert.match(detailSource, /handleViewItem/)
  assert.match(detailSource, /setItemDrawerIntent\('view'\)/)
  assert.match(detailSource, /intent=\{itemDrawerIntent \?\? 'create'\}/)
})

test('dataset item row action is edit-only instead of combined view edit', () => {
  assert.match(rowActionsSource, /onEdit\(item\)/)
  assert.match(rowActionsSource, />\s*编辑\s*</)
  assert.match(rowActionsSource, /onDelete\(item\)/)
  assert.match(rowActionsSource, />\s*删除\s*</)
  assert.match(rowActionsSource, /Trash2/)
  assert.doesNotMatch(rowActionsSource, /查看\/编辑/)
})

test('dataset item drawer separates view edit and create modes', () => {
  assert.match(drawerSource, /type DatasetItemDrawerIntent = 'create' \| 'view' \| 'edit'/)
  assert.match(drawerSource, /const isView = intent === 'view'/)
  assert.match(drawerSource, /const isEdit = intent === 'edit'/)
  assert.match(drawerSource, /const startsEditing = isEdit \|\| isCreate/)
  assert.match(drawerSource, /title=\{getDrawerTitle\(intent\)\}/)
  assert.match(drawerSource, /showConfirm=\{!isView\}/)
  assert.match(drawerSource, /readOnly=\{isView\}/)
  assert.match(drawerSource, /showEditButton=\{!isView\}/)
  assert.match(drawerSource, /defaultEditing=\{startsEditing\}/)
})

test('dataset detail keeps selected item and drawer intent separately', () => {
  assert.match(detailSource, /itemDrawerIntent/)
  assert.match(detailSource, /selectedItem/)
  assert.match(detailSource, /handleEditItem/)
  assert.match(detailSource, /handleCreateItem/)
  assert.match(detailSource, /handleDeleteItem/)
  assert.match(detailSource, /deleteProjectDatasetItem/)
  assert.match(detailSource, /itemDrawerIntent === 'edit'/)
  assert.doesNotMatch(detailSource, /setEditingItem/)
})

test('dataset detail opens source trace from dataset item source column', () => {
  assert.match(columnsSource, /onOpenTrace\?: \(traceId: string\) => void/)
  assert.match(detailSource, /handleOpenSourceTrace/)
  assert.match(detailSource, /getProjectTrace/)
  assert.match(detailSource, /observability\/traces\/logs/)
  assert.match(detailSource, /Trace 不存在或已删除/)
})
