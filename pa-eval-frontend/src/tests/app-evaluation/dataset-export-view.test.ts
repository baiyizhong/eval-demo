import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(
  'src/modules/app-evaluation/views/dataset-detail.tsx',
  'utf8'
)
const registry = readFileSync('src/api/registry.ts', 'utf8')

test('dataset detail exposes async full export actions for supported formats', () => {
  assert.match(source, /导出数据集/)
  assert.match(source, /Excel/)
  assert.match(source, /CSV/)
  assert.match(source, /TXT/)
  assert.match(source, /createProjectDatasetExportJob/)
  assert.match(source, /pollDatasetExportJob/)
})

test('dataset export api routes are registered as async job endpoints', () => {
  assert.match(registry, /createProjectDatasetExportJob/)
  assert.match(registry, /getProjectDatasetExportJob/)
  assert.match(registry, /downloadProjectDatasetExportJob/)
  assert.match(registry, /\/projects\/:projectId\/datasets\/:datasetId\/export-jobs/)
})
