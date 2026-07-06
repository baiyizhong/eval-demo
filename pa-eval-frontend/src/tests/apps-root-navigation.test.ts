import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const routesSource = readFileSync(
  fileURLToPath(new URL('../routes/index.tsx', import.meta.url)),
  'utf8'
)

test('root route redirects to apps', () => {
  assert.match(
    routesSource,
    /\{\s*index:\s*true,\s*element:\s*<Navigate to='\/apps' replace \/>\s*\}/
  )
})

test('apps page brand is not a navigation link', () => {
  const brandBlock = routesSource.match(
    /const appsTopbarNavigation:[\s\S]*?brand:\s*\{[\s\S]*?\n\s*\},/
  )?.[0]

  assert.ok(brandBlock)
  assert.doesNotMatch(brandBlock, /href:/)
})
