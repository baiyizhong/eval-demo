import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSidebarDataFromProjects } from '../lib/sidebar-data.ts'
import { useSessionStore } from '../stores/session.store.ts'
import type { UserSessionPayload } from '../types/permission.ts'

const payload: UserSessionPayload = {
  user: { id: 0, name: 'Guest', email: '' },
  superAdmin: false,
  permissions: ['system:audit:view'],
  orgs: [
    {
      id: 'org-1',
      name: '组织一',
      permissions: ['org:project:view', 'project:dataset:view'],
      projects: [
        {
          id: 'project-inherits',
          name: '继承组织权限项目',
        },
        {
          id: 'project-explicit-empty',
          name: '显式空权限项目',
          permissions: [],
        },
        {
          id: 'project-explicit',
          name: '显式项目权限',
          permissions: ['project:evaluator:view'],
        },
      ],
    },
  ],
}

function resetSession(nextPayload: UserSessionPayload = payload) {
  useSessionStore.getState().setSession(nextPayload)
}

test('session store resolves org, project and system scoped permissions', () => {
  resetSession()
  const store = useSessionStore.getState()

  assert.deepEqual(store.getSystemPermissions(), ['system:audit:view'])
  assert.deepEqual(store.getPermissionsForOrg('org-1'), [
    'org:project:view',
    'project:dataset:view',
  ])
  assert.deepEqual(store.getPermissionsForProject('project-inherits'), [
    'org:project:view',
    'project:dataset:view',
  ])
  assert.deepEqual(store.getPermissionsForProject('project-explicit-empty'), [])
  assert.deepEqual(store.getPermissionsForProject('project-explicit'), [
    'project:evaluator:view',
  ])
})

test('session store resolves explicit scope values without empty project fallbacks', () => {
  resetSession()
  const store = useSessionStore.getState()

  assert.deepEqual(store.getPermissionsForScope({ type: 'system' }), [
    'system:audit:view',
  ])
  assert.deepEqual(
    store.getPermissionsForScope({ type: 'org', orgId: 'org-1' }),
    ['org:project:view', 'project:dataset:view']
  )
  assert.deepEqual(
    store.getPermissionsForScope({
      type: 'project',
      projectId: 'project-explicit',
    }),
    ['project:evaluator:view']
  )
  assert.deepEqual(store.getPermissionsForProject(''), [])
})

test('session store returns wildcard permissions for super admins', () => {
  resetSession({
    ...payload,
    superAdmin: true,
    permissions: [],
    orgs: [],
  })
  const store = useSessionStore.getState()

  assert.deepEqual(store.getSystemPermissions(), ['*'])
  assert.deepEqual(store.getPermissionsForOrg('missing-org'), ['*'])
  assert.deepEqual(store.getPermissionsForProject('missing-project'), ['*'])
})

test('sidebar data carries permission scope for platform and project entries', () => {
  const platformSidebar = buildSidebarDataFromProjects([])
  const platformItems = platformSidebar.menuGroups[0]?.items ?? []

  assert.deepEqual(
    platformItems.map((item) => [item.title, item.access, item.scope]),
    [
      ['项目管理', 'org:project:view', { type: 'org' }],
      ['组织管理', 'org:organization:view', { type: 'org' }],
    ]
  )

  const projectSidebar = buildSidebarDataFromProjects(
    [
      {
        id: 'project-1',
        name: '项目一',
        organizationId: 'org-1',
        organizationName: '组织一',
        description: null,
        status: 'active',
        createdAt: '2026-07-02T08:00:00.000Z',
        updatedAt: '2026-07-02T09:00:00.000Z',
      },
    ],
    'project-1'
  )
  const projectItems = projectSidebar.menuGroups[0]?.items ?? []

  assert.deepEqual(
    projectItems.map((item) => [item.title, item.access, item.scope]),
    [
      [
        '应用观测',
        'project:trace:view',
        { type: 'project', projectId: 'project-1' },
      ],
      [
        '应用评测',
        'project:dataset:view',
        { type: 'project', projectId: 'project-1' },
      ],
      [
        '定时任务',
        'project:scheduled-job:view',
        { type: 'project', projectId: 'project-1' },
      ],
      [
        '项目设置',
        'project:settings:view',
        { type: 'project', projectId: 'project-1' },
      ],
    ]
  )
})
