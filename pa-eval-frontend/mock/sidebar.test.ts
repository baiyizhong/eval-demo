import assert from 'node:assert/strict'
import { test } from 'node:test'
import sidebarMocks from './sidebar.ts'

test('tasks sidebar item highlights nested task pages', () => {
  const sidebarResponse = sidebarMocks[0].response()
  const generalGroup = sidebarResponse.data.menuGroups.find(
    (group) => group.title === 'General'
  )
  const tasksItem = generalGroup?.items.find(
    (item) => item.title === '评测管理'
  )

  assert.equal(tasksItem?.url, '/tasks')
  assert.equal(tasksItem?.activeMatch, 'prefix')
})
