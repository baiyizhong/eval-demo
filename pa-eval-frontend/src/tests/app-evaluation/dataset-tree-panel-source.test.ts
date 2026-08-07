import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('dataset tree panel supports directory create and dataset edit/delete hover actions', () => {
  const source = readFileSync(
    'src/modules/app-evaluation/components/dataset-tree-panel.tsx',
    'utf8'
  )

  assert.match(source, /listProjectDatasetDirectories/)
  assert.match(source, /listProjectDatasets/)
  assert.match(source, /buildDatasetTreeNodes/)
  assert.doesNotMatch(source, /UNCATEGORIZED_TREE_NODE_ID/)
  assert.match(source, /onCreateDataset/)
  assert.match(source, /onEditDataset/)
  assert.match(source, /onDeleteDataset/)
  assert.match(source, /selectableKinds=\{\['item'\]\}/)
  assert.match(source, /FolderTree/)
  assert.match(source, /DatabaseIcon/)
  assert.match(source, /renderItemIcon=\{\(\) => \(/)
  assert.match(source, /<DatabaseIcon className='text-muted-foreground size-4 shrink-0'/)
  assert.match(source, /title=\{/)
  assert.match(source, /<FolderTree className='size-4'/)
  assert.match(source, /数据集列表树/)
  assert.match(source, /title='新建数据集'/)
  assert.match(source, /aria-label='新建数据集'/)
  assert.match(source, /title='编辑数据集'/)
  assert.match(source, /aria-label='编辑数据集'/)
  assert.match(source, /title='删除数据集'/)
  assert.match(source, /aria-label='删除数据集'/)
})

test('dataset tree panel expands every ancestor directory of selected dataset', () => {
  const source = readFileSync(
    'src/modules/app-evaluation/components/dataset-tree-panel.tsx',
    'utf8'
  )

  assert.match(source, /getDatasetAncestorDirectoryIds/)
  assert.match(source, /expandedIds=\{expandedIds\}/)
  assert.match(source, /onExpandedIdsChange=\{handleExpandedIdsChange\}/)
})

test('dataset tree panel does not force selected dataset ancestors open after user collapses them', () => {
  const source = readFileSync(
    'src/modules/app-evaluation/components/dataset-tree-panel.tsx',
    'utf8'
  )

  assert.match(source, /userCollapsedIdsByDataset/)
  assert.match(source, /selectedDatasetAncestorIds/)
  assert.match(source, /selectedDatasetCollapsedIds/)
  assert.match(source, /const collapsedIds = new Set\(selectedDatasetCollapsedIds\)/)
  assert.match(source, /\.\.\.new Set\(\[\.\.\.userExpandedIds, \.\.\.selectedDatasetAncestorIds\]\)/)
  assert.match(source, /\.filter\(\(id\) => !collapsedIds\.has\(id\)\)/)
  assert.match(source, /const handleExpandedIdsChange = \(nextIds: string\[\]\) =>/)
  assert.match(source, /const nextIdSet = new Set\(nextIds\)/)
  assert.match(source, /collapsedAncestorIds/)
  assert.match(source, /\[selectedDatasetId\]: collapsedAncestorIds/)
})

test('dataset tree panel lets dataset items be dragged into directory nodes', () => {
  const source = readFileSync(
    'src/modules/app-evaluation/components/dataset-tree-panel.tsx',
    'utf8'
  )

  assert.match(source, /moveProjectDatasetToDirectory/)
  assert.match(source, /useMutation/)
  assert.match(source, /draggable/)
  assert.match(source, /canDrag=\{\(node\) => node\.kind === 'item'\}/)
  assert.match(source, /targetNode\.kind !== 'folder'/)
  assert.match(source, /directoryId:\s*move\.parentId/)
  assert.match(source, /onMove=\{async \(\[move\]\)/)
  assert.match(source, /invalidateQueries\(\{\s*queryKey:\s*\['project-datasets-tree'/)
  assert.match(source, /invalidateQueries\(\{\s*queryKey:\s*\['project-datasets'/)
})

test('dataset tree panel updates tree cache from move response before refetching', () => {
  const source = readFileSync(
    'src/modules/app-evaluation/components/dataset-tree-panel.tsx',
    'utf8'
  )

  assert.match(source, /replaceDatasetInListCache/)
  assert.match(source, /onSuccess:\s*async \(updatedDataset\) =>/)
  assert.match(source, /queryClient\.setQueriesData/)
  assert.match(source, /queryKey:\s*\['project-datasets-tree'\]/)
  assert.match(source, /queryKey:\s*\['project-datasets'\]/)
  assert.match(source, /dataset\.id === updatedDataset\.id/)
})
