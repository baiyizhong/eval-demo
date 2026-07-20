import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const importSource = readFileSync(
  'src/modules/app-evaluation/lib/dataset-item-import.ts',
  'utf8'
)
const exportSource = readFileSync(
  'src/modules/app-evaluation/lib/dataset-item-export.ts',
  'utf8'
)

test('dataset Excel helpers load xlsx only when an action needs it', () => {
  assert.doesNotMatch(importSource, /import \* as XLSX from 'xlsx'/)
  assert.doesNotMatch(exportSource, /import \* as XLSX from 'xlsx'/)
  assert.match(importSource, /import\('xlsx'\)/)
  assert.match(exportSource, /import\('xlsx'\)/)
})
