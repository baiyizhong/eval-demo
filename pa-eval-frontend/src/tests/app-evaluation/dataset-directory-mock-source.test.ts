import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('mock data seeds dataset directories and dataset directoryId', () => {
  const source = readFileSync('mock/_data.ts', 'utf8')

  assert.match(source, /datasetDirectories:\s*\[/)
  assert.match(source, /id:\s*'dir_customer_service'/)
  assert.match(source, /directoryId:\s*'dir_customer_service'/)
})

test('mock dataset routes support directory crud and move deleted datasets to uncategorized', () => {
  const source = readFileSync('mock/datasets.ts', 'utf8')
  const utilsSource = readFileSync('mock/_utils.ts', 'utf8')

  assert.match(source, /\/api\/projects\/:projectId\/dataset-directories/)
  assert.match(source, /updateProjectDatasetDirectoryOrder|directories/)
  assert.match(source, /directoryId:\s*null/)
  assert.match(source, /collectDescendantDirectoryIds/)
  assert.match(source, /filterValidDirectories/)
  assert.match(utilsSource, /directoryId:\s*'dataset-directories'/)
  assert.match(source, /parentId:\s*input\.parentId\s*\?\?\s*null/)
})

test('mock dataset routes support moving a dataset into a directory', () => {
  const source = readFileSync('mock/datasets.ts', 'utf8')
  const registrySource = readFileSync('src/api/registry.ts', 'utf8')
  const apiSource = readFileSync(
    'src/modules/app-evaluation/api/dataset-api.ts',
    'utf8'
  )

  assert.match(
    source,
    /\/api\/projects\/:projectId\/datasets\/:datasetId\/directory/
  )
  assert.match(source, /directoryId:\s*input\.directoryId\s*\?\?\s*null/)
  assert.match(source, /withItemCount\(db\.datasets\[index\]/)
  assert.match(registrySource, /moveProjectDatasetDirectory/)
  assert.match(
    registrySource,
    /\/projects\/:projectId\/datasets\/:datasetId\/directory/
  )
  assert.match(apiSource, /moveProjectDatasetToDirectory/)
})
