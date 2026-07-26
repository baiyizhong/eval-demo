import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('project settings page uses dynamic project id for sidebar links', () => {
  const navSource = readFileSync(
    'src/modules/project-settings/nav.tsx',
    'utf8'
  )
  const pageSource = readFileSync(
    'src/modules/project-settings/index.tsx',
    'utf8'
  )

  assert.match(navSource, /export function getProjectSettingsPageLinks/)
  assert.match(pageSource, /getProjectSettingsPageLinks\(projectId\)/)
  assert.match(pageSource, /getProjectSettingsNavigationItems\(projectId\)/)
  assert.doesNotMatch(
    pageSource,
    /<Page links=\{projectSettingsPageLinks\}/
  )
})

test('project settings uses project management for top nav and project settings for page title', () => {
  const navSource = readFileSync(
    'src/modules/project-settings/nav.tsx',
    'utf8'
  )
  const pageSource = readFileSync(
    'src/modules/project-settings/index.tsx',
    'utf8'
  )

  assert.match(navSource, /title:\s*'项目管理'/)
  assert.match(navSource, /href:\s*'\/apps'/)
  assert.match(navSource, /icon:\s*Home/)
  assert.match(pageSource, />\s*项目设置\s*</)
  assert.doesNotMatch(navSource, /应用管理/)
  assert.doesNotMatch(pageSource, /应用管理/)
})

test('project settings nav module keeps static fallback out of page links', () => {
  const navSource = readFileSync(
    'src/modules/project-settings/nav.tsx',
    'utf8'
  )

  assert.doesNotMatch(
    navSource,
    /href:\s*['"]\/projects\/project_customer_agent\/settings\/general['"]/
  )
})
