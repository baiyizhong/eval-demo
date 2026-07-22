import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  archiveProjectScoreConfig,
  createProjectScoreConfig,
  listProjectScoreConfigs,
  listProjectScoreConfigsPage,
  restoreProjectScoreConfig,
  updateProjectScoreConfig,
} from '../modules/app-evaluation/api/annotation-api.ts'

test('score config list helpers use PA pagination and preserve list callers', async () => {
  const calls: unknown[] = []
  const api = {
    async getProjectScoreConfigs(options: unknown) {
      calls.push(options)
      return {
        total: 1,
        datas: [
          {
            id: 'score-1',
            projectId: 'project-1',
            name: 'accuracy',
            dataType: 'NUMERIC',
            description: '',
          },
        ],
      }
    },
  }

  const page = await listProjectScoreConfigsPage(api as never, 'project-1', {
    includeArchived: true,
    keyword: '准确',
    page: 2,
    pageSize: 20,
  })
  const records = await listProjectScoreConfigs(api as never, 'project-1')

  assert.equal(page.total, 1)
  assert.equal(records[0]?.id, 'score-1')
  assert.deepEqual(calls, [
    {
      path: { projectId: 'project-1' },
      query: {
        includeArchived: true,
        keyword: '准确',
        page: 2,
        pageSize: 20,
      },
    },
    {
      path: { projectId: 'project-1' },
      query: {
        includeArchived: undefined,
        keyword: undefined,
        page: 1,
        pageSize: 200,
      },
    },
  ])
})

test('score config list helper loads every page for selector callers', async () => {
  const requestedPages: number[] = []
  const api = {
    async getProjectScoreConfigs(options: {
      query: { page: number; pageSize: number }
    }) {
      requestedPages.push(options.query.page)
      const start = (options.query.page - 1) * options.query.pageSize
      const size = Math.min(options.query.pageSize, 201 - start)
      return {
        total: 201,
        datas: Array.from({ length: size }, (_, index) => ({
          id: `score-${start + index + 1}`,
          projectId: 'project-1',
          name: `score-${start + index + 1}`,
          dataType: 'NUMERIC',
          description: '',
        })),
      }
    },
  }

  const records = await listProjectScoreConfigs(api as never, 'project-1')

  assert.equal(records.length, 201)
  assert.deepEqual(requestedPages, [1, 2])
})

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
