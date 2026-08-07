import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('dataset detail integrates dataset tree selector and keeps empty table behavior', () => {
  const source = readFileSync(
    'src/modules/app-evaluation/views/dataset-detail.tsx',
    'utf8'
  )

  assert.match(source, /DatasetTreePanel/)
  assert.match(source, /treeVisible/)
  assert.match(source, /显示/)
  assert.match(source, /隐藏/)
  assert.match(source, /setEditingDataset/)
  assert.match(source, /createProjectDataset/)
  assert.match(source, /deleteProjectDataset/)
  assert.match(source, /getNextDatasetId/)
  assert.match(source, /effectiveDatasetId/)
  assert.match(source, /emptyText='当前筛选条件下暂无数据项'/)
  assert.match(source, /startContent:\s*\(/)
  assert.match(source, /onClick=\{\(\) => setTreeVisible\(\(visible\) => !visible\)\}/)
  assert.doesNotMatch(source, /id:\s*'toggle-tree'/)

  const pageActionIndex = source.indexOf('<PageAction')
  const treePanelIndex = source.indexOf('<DatasetTreePanel')
  const detailSectionIndex = source.indexOf("<section className='bg-card text-card-foreground rounded-lg border p-4'>")
  const itemSectionIndex = source.indexOf("<section className='bg-card text-card-foreground flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border p-4'>")
  const startContentIndex = source.indexOf('startContent:')
  const searchPlaceholderIndex = source.indexOf(
    "searchPlaceholder: '搜索 item id / JSON 内容'"
  )

  assert.ok(pageActionIndex > -1)
  assert.ok(treePanelIndex > -1)
  assert.ok(detailSectionIndex > -1)
  assert.ok(itemSectionIndex > -1)
  assert.ok(startContentIndex > -1)
  assert.ok(searchPlaceholderIndex > -1)
  assert.ok(pageActionIndex < treePanelIndex)
  assert.ok(treePanelIndex < detailSectionIndex)
  assert.ok(detailSectionIndex < itemSectionIndex)
  assert.ok(searchPlaceholderIndex < startContentIndex)
})
