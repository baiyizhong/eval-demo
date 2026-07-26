import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const dataTableSource = readFileSync(
  'src/components/common/data-table/data-table.tsx',
  'utf8'
)

test('DataTable default min table width is 1024', () => {
  assert.match(dataTableSource, /minTableWidth = 1024/)
})

test('business DataTable usages rely on the shared min table width default', () => {
  const files = listSourceFiles('src/modules')
  const offenders = files.filter((file) =>
    readFileSync(file, 'utf8').includes('minTableWidth={')
  )

  assert.deepEqual(offenders, [])
})

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    const stat = statSync(path)

    if (stat.isDirectory()) {
      return listSourceFiles(path)
    }

    return /\.(tsx|ts)$/.test(path) ? [path] : []
  })
}
