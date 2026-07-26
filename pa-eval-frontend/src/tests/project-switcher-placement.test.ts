import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('project module page navs do not render the old project context switcher', () => {
  const files = [
    'src/modules/app-evaluation/components/evaluation-page-nav.tsx',
    'src/modules/app-observability/components/observability-page-nav.tsx',
  ]

  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    assert.equal(source.includes('ProjectContextSwitcher'), false, file)
  }
})
