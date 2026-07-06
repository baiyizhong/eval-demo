import assert from 'node:assert/strict'
import { test } from 'node:test'

import { toProjectInfo } from '../../modules/project-settings/project-info.ts'

test('toProjectInfo maps current project API data to settings view model', () => {
  const project = toProjectInfo({
    id: 'cmqoenkom000dry080q62b5kq',
    name: 'baiyizhong',
    organizationId: 'cmqoengca0008ry0874e7eyuq',
    organizationName: 'pakj',
    description: '所属组织：pakj',
    status: 'active',
    createdAt: '2026-06-21T23:15:53.591Z',
    updatedAt: '2026-06-22T02:16:48.169Z',
  })

  assert.deepEqual(project, {
    id: 'cmqoenkom000dry080q62b5kq',
    organizationName: 'pakj',
    name: 'baiyizhong',
    description: '所属组织：pakj',
    retentionDays: 90,
    createdAt: '2026-06-21T23:15:53.591Z',
    updatedAt: '2026-06-22T02:16:48.169Z',
  })
})
