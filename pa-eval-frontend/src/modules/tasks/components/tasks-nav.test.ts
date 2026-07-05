import assert from 'node:assert/strict'
import { test } from 'node:test'
import { tasksTopNav } from './tasks-nav.ts'

test('tasks top nav links automatic evaluation to its child page', () => {
  assert.deepEqual(
    tasksTopNav.map(({ title, href }) => ({ title, href })),
    [
      { title: '评测报告', href: '/tasks' },
      { title: '评估器', href: '/tasks/evaluators' },
      { title: '自动评测', href: '/tasks/auto-evaluation' },
    ]
  )
})
