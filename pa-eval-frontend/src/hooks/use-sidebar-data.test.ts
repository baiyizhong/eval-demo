import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSidebarDataFromProjects } from '../lib/sidebar-data.ts'

const projects = [
  {
    id: 'project-real-1',
    name: '真实评测项目',
    organizationId: 'org-1',
    organizationName: '真实组织',
    description: '真实项目',
    status: 'active' as const,
    createdAt: '2026-07-02T08:00:00.000Z',
    updatedAt: '2026-07-02T09:00:00.000Z',
  },
]

test('buildSidebarDataFromProjects uses current project in sidebar header and project evaluation route', () => {
  const sidebar = buildSidebarDataFromProjects(projects, 'project-real-1')

  assert.equal('user' in sidebar, false)
  assert.equal(sidebar.teams[0]?.id, 'project-real-1')
  assert.equal(sidebar.teams[0]?.organizationId, 'org-1')
  assert.equal(sidebar.teams[0]?.name, '真实评测项目')
  assert.equal(sidebar.teams[0]?.plan, '真实组织')

  const evaluation = sidebar.menuGroups[0]?.items.find(
    (item) => item.title === '应用评测'
  )
  assert.ok(evaluation && 'url' in evaluation)
  assert.equal(evaluation.url, '/projects/project-real-1/evaluation')
  assert.ok(!('items' in evaluation))
})

test('buildSidebarDataFromProjects keeps platform brand outside project context', () => {
  const sidebar = buildSidebarDataFromProjects(projects)

  assert.equal(sidebar.teams[0]?.name, '智能评测系统')
  assert.equal(sidebar.teams[0]?.plan, '评测管理平台')
})

test('buildSidebarDataFromProjects lists current project first for header switching', () => {
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
        name: '当前项目',
        organizationId: 'org-2',
        organizationName: '当前组织',
        description: null,
        status: 'active',
        createdAt: '2026-07-02T08:00:00.000Z',
        updatedAt: '2026-07-02T09:00:00.000Z',
      },
    ],
    'project-current'
  )

  assert.deepEqual(
    sidebar.teams.map((team) => [team.id, team.name, team.plan]),
    [
      ['project-current', '当前项目', '当前组织'],
      ['project-first', '默认项目', '默认组织'],
    ]
  )
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
    .filter((item) => ['应用评测', '应用观测', '项目设置'].includes(item.title))
    .map((item) => ('url' in item ? item.url : ''))

  assert.deepEqual(scopedLinks, [
    '/projects/project-current/observability',
    '/projects/project-current/evaluation',
    '/projects/project-current/settings/general',
  ])
})

test('buildSidebarDataFromProjects keeps platform management entries outside project context', () => {
  const sidebar = buildSidebarDataFromProjects([])
  const items = sidebar.menuGroups[0]?.items ?? []

  assert.deepEqual(
    items
      .filter((item) => ['项目管理', '组织管理'].includes(item.title))
      .map((item) => ('url' in item ? [item.title, item.url] : [])),
    [
      ['项目管理', '/apps'],
      ['组织管理', '/settings/info'],
    ]
  )
  assert.equal(
    items.some((item) => item.title === '评测管理'),
    false
  )
})

test('buildSidebarDataFromProjects only shows project scoped entries inside project context', () => {
  const sidebar = buildSidebarDataFromProjects(projects, 'project-real-1')
  const items = sidebar.menuGroups[0]?.items ?? []

  assert.deepEqual(
    items.map((item) => item.title),
    ['应用观测', '应用评测', '定时任务', '项目设置']
  )
  assert.equal(
    items.some((item) =>
      ['数字面板', '项目管理', '组织管理', '评测管理'].includes(item.title)
    ),
    false
  )
})

test('buildSidebarDataFromProjects hides project scoped entries outside project context', () => {
  const sidebar = buildSidebarDataFromProjects(projects)
  const items = sidebar.menuGroups[0]?.items ?? []

  assert.equal(
    items.some((item) =>
      ['应用评测', '应用观测', '项目设置'].includes(item.title)
    ),
    false
  )
})
