import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const registrySource = readFileSync('src/api/registry.ts', 'utf8')
const datasetApiSource = readFileSync(
  'src/modules/app-evaluation/api/dataset-api.ts',
  'utf8'
)
const datasetDetailSource = readFileSync(
  'src/modules/app-evaluation/views/dataset-detail.tsx',
  'utf8'
)
const dataTableSource = readFileSync(
  'src/components/common/data-table/data-table.tsx',
  'utf8'
)
const toolbarSource = readFileSync(
  'src/components/common/data-table/toolbar.tsx',
  'utf8'
)
const facetedFilterSource = readFileSync(
  'src/components/common/data-table/faceted-filter.tsx',
  'utf8'
)

test('dataset item status filter uses backend full status counts', () => {
  assert.match(registrySource, /getProjectDatasetItemStatusCounts/)
  assert.match(registrySource, /\/projects\/:projectId\/datasets\/:datasetId\/items\/status-counts/)
  assert.match(datasetApiSource, /getProjectDatasetItemStatusCounts/)
  assert.match(datasetApiSource, /keyword/)
  assert.match(datasetDetailSource, /useSearchParams/)
  assert.match(datasetDetailSource, /statusCountsQuery/)
  assert.match(datasetDetailSource, /optionCounts/)
})

test('data table faceted filter can render externally supplied option counts', () => {
  assert.match(dataTableSource, /optionCounts\?: Record<string, number>/)
  assert.match(toolbarSource, /optionCounts/)
  assert.match(facetedFilterSource, /optionCounts/)
  assert.match(facetedFilterSource, /optionCounts\?\.\[option\.value\]/)
})
