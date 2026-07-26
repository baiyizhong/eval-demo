import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const files = [
  {
    path: 'src/modules/apps/index.tsx',
    permissions: ['org:project:edit'],
  },
  {
    path: 'src/modules/app-observability/components/trace-log-bulk-actions.tsx',
    permissions: ['project:trace:edit'],
  },
  {
    path: 'src/modules/app-observability/components/trace-detail-drawer.tsx',
    permissions: ['project:trace:edit'],
  },
  {
    path: 'src/modules/app-evaluation/views/datasets.tsx',
    permissions: ['project:dataset:edit'],
  },
  {
    path: 'src/modules/app-evaluation/views/dataset-detail.tsx',
    permissions: ['project:dataset:edit'],
  },
  {
    path: 'src/modules/tasks/views/evaluators.tsx',
    permissions: ['project:evaluator:edit'],
  },
  {
    path: 'src/modules/app-evaluation/views/annotation-queues.tsx',
    permissions: ['project:annotation:edit'],
  },
  {
    path: 'src/modules/app-evaluation/views/annotation-queue-detail.tsx',
    permissions: ['project:annotation:edit'],
  },
  {
    path: 'src/modules/app-evaluation/views/auto-evaluations.tsx',
    permissions: ['project:auto-evaluation:edit'],
  },
  {
    path: 'src/modules/app-evaluation/views/auto-evaluation-detail.tsx',
    permissions: ['project:auto-evaluation:edit'],
  },
  {
    path: 'src/modules/app-evaluation/views/evaluation-reports.tsx',
    permissions: ['project:evaluation-report:edit'],
  },
  {
    path: 'src/modules/app-evaluation/views/evaluation-report-detail.tsx',
    permissions: ['project:evaluation-report:edit'],
  },
  {
    path: 'src/modules/scheduled-jobs/index.tsx',
    permissions: ['project:scheduled-job:edit'],
  },
  {
    path: 'src/modules/project-settings/views/general.tsx',
    permissions: ['project:settings:edit'],
  },
  {
    path: 'src/modules/project-settings/views/score-configs.tsx',
    permissions: ['project:score-config:edit'],
  },
  {
    path: 'src/modules/project-settings/views/members.tsx',
    permissions: ['project:member:edit'],
  },
  {
    path: 'src/modules/project-settings/views/models.tsx',
    permissions: ['project:model:edit'],
  },
  {
    path: 'src/modules/project-settings/views/api-keys.tsx',
    permissions: ['project:api-key:edit'],
  },
  {
    path: 'src/modules/organization-management/views/info/organization-info-form.tsx',
    permissions: ['org:organization:edit'],
  },
  {
    path: 'src/modules/organization-management/views/members/index.tsx',
    permissions: ['org:member:edit'],
  },
] as const

test('write-capable pages explicitly check their edit permission code', () => {
  const missing = files.flatMap(({ path, permissions }) => {
    const source = readFileSync(path, 'utf8')
    return permissions
      .filter((permission) => !source.includes(permission))
      .map((permission) => `${path}: ${permission}`)
  })

  assert.deepEqual(missing, [])
})

test('apps project creation permission is scoped to selected organization', () => {
  const source = readFileSync('src/modules/apps/index.tsx', 'utf8')

  assert.match(
    source,
    /usePermission\(\{\s*type:\s*'org',\s*orgId:\s*currentOrganizationId\s*\?\?\s*undefined,\s*\}\)/
  )
})
