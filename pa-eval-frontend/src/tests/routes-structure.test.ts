import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const routeFiles = [
  'src/routes/lazy-pages.tsx',
  'src/routes/sidebar-routes.tsx',
  'src/routes/topbar-navigation.tsx',
  'src/routes/topbar-routes.tsx',
]

test('routes are split into focused branch files', () => {
  for (const file of routeFiles) {
    assert.ok(existsSync(file), `${file} should exist`)
  }

  const indexSource = readFileSync('src/routes/index.tsx', 'utf8')

  assert.match(
    indexSource,
    /import \{ sidebarRoutes \} from '\.\/sidebar-routes'/
  )
  assert.match(
    indexSource,
    /import \{ topbarRoutes \} from '\.\/topbar-routes'/
  )
  assert.match(
    indexSource,
    /children:\s*\[\s*\.\.\.sidebarRoutes,\s*\.\.\.topbarRoutes\s*\]/
  )
  assert.doesNotMatch(indexSource, /const TraceLogs = lazy\(\(\) =>/)
  assert.doesNotMatch(indexSource, /const ProjectDatasets = lazy\(\(\) =>/)
})

test('dataset routes are mounted as project level navigation', () => {
  const sidebarSource = readFileSync('src/routes/sidebar-routes.tsx', 'utf8')

  assert.match(sidebarSource, /path:\s*'projects\/:projectId\/datasets'/)
  assert.match(
    sidebarSource,
    /path:\s*'projects\/:projectId\/datasets\/badcase-workbench'/
  )
  assert.match(
    sidebarSource,
    /path:\s*'projects\/:projectId\/datasets\/:datasetId'/
  )
  assert.match(sidebarSource, /AppEvaluationLegacyDatasetsRedirect/)
})
