import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildDatasetTreeNodes,
  getDatasetAncestorDirectoryIds,
  getNextDatasetId,
  getVisibleTreeNodeIds,
} from '../../modules/app-evaluation/lib/dataset-tree.ts'

const directories = [
  {
    id: 'dir-a',
    projectId: 'project-1',
    parentId: null,
    name: '一级目录',
    order: 0,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'dir-b',
    projectId: 'project-1',
    parentId: 'dir-a',
    name: '子目录',
    order: 0,
    createdAt: '',
    updatedAt: '',
  },
]

const datasets = [
  {
    id: 'dataset-a',
    projectId: 'project-1',
    directoryId: 'dir-b',
    name: '问答集',
    description: '',
    type: 'evaluation' as const,
    metadata: { type: 'evaluation' as const },
    inputSchema: {},
    expectedOutputSchema: {},
    itemCount: 0,
    runCount: 0,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'dataset-free',
    projectId: 'project-1',
    directoryId: null,
    name: '未分类数据集',
    description: '',
    type: 'evaluation' as const,
    metadata: { type: 'evaluation' as const },
    inputSchema: {},
    expectedOutputSchema: {},
    itemCount: 0,
    runCount: 0,
    createdAt: '',
    updatedAt: '',
  },
]

test('buildDatasetTreeNodes puts datasets without a valid directory at the root', () => {
  const nodes = buildDatasetTreeNodes({ directories, datasets })

  assert.equal(nodes[0].id, 'dir-a')
  assert.equal(nodes.find((node) => node.id === 'dataset-a')?.parentId, 'dir-b')
  assert.equal(nodes.find((node) => node.id === 'dataset-free')?.parentId, null)
  assert.equal(nodes.some((node) => node.name === '未分类'), false)
})

test('getVisibleTreeNodeIds keeps matching ancestors', () => {
  const nodes = buildDatasetTreeNodes({ directories, datasets })

  assert.deepEqual(getVisibleTreeNodeIds(nodes, '问答').sort(), [
    'dataset-a',
    'dir-a',
    'dir-b',
  ])
})

test('getNextDatasetId chooses current id, first categorized dataset, or first dataset', () => {
  assert.equal(getNextDatasetId(directories, datasets, 'dataset-a'), 'dataset-a')
  assert.equal(getNextDatasetId(directories, datasets, 'missing'), 'dataset-a')
  assert.equal(getNextDatasetId([], [datasets[1]], null), 'dataset-free')
  assert.equal(getNextDatasetId([], [], null), null)
})

test('getDatasetAncestorDirectoryIds returns all parent directories for selected dataset', () => {
  const nodes = buildDatasetTreeNodes({ directories, datasets })

  assert.deepEqual(getDatasetAncestorDirectoryIds(nodes, 'dataset-a'), [
    'dir-a',
    'dir-b',
  ])
  assert.deepEqual(getDatasetAncestorDirectoryIds(nodes, 'dataset-free'), [])
  assert.deepEqual(getDatasetAncestorDirectoryIds(nodes, 'missing'), [])
})
