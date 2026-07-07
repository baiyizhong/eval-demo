import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  archiveProjectScoreConfig,
  createProjectScoreConfig,
  restoreProjectScoreConfig,
  updateProjectScoreConfig,
} from '../modules/app-evaluation/api/annotation-api.ts'

test('score config api helpers call real mutation endpoints', async () => {
  const calls: unknown[] = []
  const input = {
    name: 'accuracy',
    dataType: 'NUMERIC' as const,
    description: '答案准确性',
    minValue: 1,
    maxValue: 5,
    categories: [],
  }
  const api = {
    async createProjectScoreConfig(options: unknown) {
      calls.push(['create', options])
      return {}
    },
    async updateProjectScoreConfig(options: unknown) {
      calls.push(['update', options])
      return {}
    },
    async archiveProjectScoreConfig(options: unknown) {
      calls.push(['archive', options])
      return {}
    },
    async restoreProjectScoreConfig(options: unknown) {
      calls.push(['restore', options])
      return {}
    },
  }

  await createProjectScoreConfig(api as never, 'project-1', input)
  await updateProjectScoreConfig(api as never, 'project-1', 'score-1', input)
  await archiveProjectScoreConfig(api as never, 'project-1', 'score-1')
  await restoreProjectScoreConfig(api as never, 'project-1', 'score-1')

  assert.deepEqual(calls, [
    ['create', { path: { projectId: 'project-1' }, body: input }],
    [
      'update',
      { path: { projectId: 'project-1', configId: 'score-1' }, body: input },
    ],
    ['archive', { path: { projectId: 'project-1', configId: 'score-1' } }],
    ['restore', { path: { projectId: 'project-1', configId: 'score-1' } }],
  ])
})
