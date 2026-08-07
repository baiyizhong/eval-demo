import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  datasetPresetTags,
  getDatasetTags,
  normalizeDatasetTags,
  normalizeDatasetType,
  resolveDatasetLegacyType,
} from '../../modules/app-evaluation/lib/dataset-tags.ts'
import type { DatasetRecord } from '../../modules/app-evaluation/types.ts'

const baseDataset: DatasetRecord = {
  id: 'dataset-1',
  projectId: 'project-1',
  name: '数据集',
  description: '',
  type: 'evaluation',
  metadata: {},
  inputSchema: {},
  expectedOutputSchema: {},
  itemCount: 0,
  runCount: 0,
  createdAt: '',
  updatedAt: '',
}

test('dataset preset tags only include configured category tags', () => {
  assert.deepEqual(datasetPresetTags, ['badcase集', '黄金集', '异常集'])
  assert.deepEqual(getDatasetTags(), [])
})

test('dataset tags read metadata tags', () => {
  assert.deepEqual(
    getDatasetTags({
      ...baseDataset,
      metadata: { tags: ['客服问答', '回归测试'] },
    }),
    ['客服问答', '回归测试']
  )
})

test('dataset tags do not fallback to legacy type', () => {
  assert.deepEqual(getDatasetTags({ ...baseDataset, type: 'golden' }), [])
})

test('dataset tag helpers normalize and resolve legacy type', () => {
  assert.deepEqual(normalizeDatasetTags([' 客服问答 ', '', '客服问答', 1]), [
    '客服问答',
  ])
  assert.equal(normalizeDatasetType('EVALUATION'), 'evaluation')
  assert.equal(resolveDatasetLegacyType(['黄金集', '回归测试']), 'golden')
  assert.equal(resolveDatasetLegacyType(['回归测试'], 'badcase'), 'badcase')
})
