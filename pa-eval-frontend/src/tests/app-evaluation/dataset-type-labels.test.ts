import assert from 'node:assert/strict'
import { test } from 'node:test'
import { datasetTypeLabels } from '../../modules/app-evaluation/types.ts'

test('golden dataset type label uses 黄金集', () => {
  assert.equal(datasetTypeLabels.golden, '黄金集')
})
