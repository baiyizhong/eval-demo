import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSidebarDataFromProjects } from '../lib/sidebar-data.ts'

test('buildSidebarDataFromProjects uses PA Eval brand and project evaluation entry route', () => {
  const sidebar = buildSidebarDataFromProjects([
    {
      id: 'project-real-1',
      name: '真实评测项目',
      organizationId: 'org-1',
      organizationName: '真实组织',
      description: '真实项目',
      status: 'active',
      createdAt: '2026-07-02T08:00:00.000Z',
      updatedAt: '2026-07-02T09:00:00.000Z',
    },
  ])

  assert.equal(sidebar.teams[0]?.name, '智能评测系统')
  assert.equal(sidebar.teams[0]?.plan, '评测管理平台')

  const evaluation = sidebar.menuGroups[0]?.items.find(
    (item) => item.title === '应用评测'
  )
  assert.ok(evaluation && 'url' in evaluation)
  assert.equal(evaluation.url, '/projects/project-real-1/evaluation')
  assert.ok(!('items' in evaluation))
})

test('buildSidebarDataFromProjects keeps project scoped entries on the current project', () => {
  const sidebar = buildSidebarDataFromProjects(
    [
      {
        id: 'project-first',
        name: '默认项目',
        organizationId: 'org-1',
        organizationName: '默认组织',
        description: null,
        status: 'active',
        createdAt: '2026-07-02T08:00:00.000Z',
        updatedAt: '2026-07-02T09:00:00.000Z',
      },
      {
        id: 'project-current',
        name: 'baiyizhong',
        organizationId: 'org-2',
        organizationName: 'pakj',
        description: null,
        status: 'active',
        createdAt: '2026-07-02T08:00:00.000Z',
        updatedAt: '2026-07-02T09:00:00.000Z',
      },
    ],
    'project-current'
  )

  const items = sidebar.menuGroups[0]?.items ?? []
  const scopedLinks = items
    .filter((item) =>
      ['应用评测', '应用观测', '项目设置'].includes(item.title)
    )
    .map((item) => ('url' in item ? item.url : ''))

  assert.deepEqual(scopedLinks, [
    '/projects/project-current/evaluation',
    '/projects/project-current/observability',
    '/projects/project-current/settings/general',
  ])
})

test('buildSidebarDataFromProjects keeps global management entries in sidebar', () => {
  const sidebar = buildSidebarDataFromProjects([])
  const items = sidebar.menuGroups[0]?.items ?? []

  assert.deepEqual(
    items
      .filter((item) =>
        ['项目管理', '组织管理', '评测管理'].includes(item.title)
      )
      .map((item) => ('url' in item ? [item.title, item.url] : [])),
    [
      ['项目管理', '/apps'],
      ['组织管理', '/settings/info'],
      ['评测管理', '/tasks'],
    ]
  )
})

test('buildSidebarDataFromProjects hides project evaluation entry without project', () => {
  const sidebar = buildSidebarDataFromProjects([])
  const evaluation = sidebar.menuGroups[0]?.items.find(
    (item) => item.title === '应用评测'
  )

  assert.equal(evaluation, undefined)
})
