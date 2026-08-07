import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createProjectDataset,
  deleteProjectDataset,
  listProjectAutoEvaluationDatasets,
  updateProjectDataset,
} from './dataset-api.ts'

test('listProjectAutoEvaluationDatasets merges datasets from visible active projects', async () => {
  const requestedProjectIds: string[] = []
  const requestedQueries: unknown[] = []
  const api = {
    async getProjects(input: unknown) {
      requestedQueries.push(input)
      return {
        total: 2,
        datas: [
          { id: 'project-empty', name: '空项目', status: 'active' },
          { id: 'project-with-dataset', name: 'baiyizhong', status: 'active' },
        ],
      }
    },
    async getProjectDatasets(input: {
      path: { projectId: string }
      query: { keyword?: string }
    }) {
      requestedProjectIds.push(input.path.projectId)
      requestedQueries.push(input.query)
      if (input.path.projectId === 'project-empty') {
        return { total: 0, datas: [] }
      }

      return {
        total: 1,
        datas: [
          {
            id: 'dataset-1',
            name: 'baiyizhong-dataset',
            description: '真实数据集',
            itemCount: 10,
            updatedAt: '2026-07-04T10:00:00.000Z',
          },
        ],
      }
    },
  }

  const datasets = await listProjectAutoEvaluationDatasets(
    api as never,
    'project-empty',
    'baiyizhong'
  )

  assert.deepEqual(requestedProjectIds, [
    'project-empty',
    'project-with-dataset',
  ])
  assert.deepEqual(requestedQueries, [
    { query: { page: 1, pageSize: 200, status: 'active' } },
    { page: 1, pageSize: 200, keyword: 'baiyizhong' },
    { page: 1, pageSize: 200, keyword: 'baiyizhong' },
  ])
  assert.deepEqual(datasets, [
    {
      id: 'dataset-1',
      projectId: 'project-with-dataset',
      projectName: 'baiyizhong',
      name: 'baiyizhong-dataset',
      description: '真实数据集',
      itemCount: 10,
      updatedAt: '2026-07-04T10:00:00.000Z',
    },
  ])
})

test('listProjectAutoEvaluationDatasets filters keyword locally across dataset fields', async () => {
  const api = {
    async getProjects() {
      return {
        total: 1,
        datas: [{ id: 'project-1', name: '客服项目', status: 'active' }],
      }
    },
    async getProjectDatasets() {
      return {
        total: 2,
        datas: [
          {
            id: 'dataset-flowback',
            name: '报告回流数据',
            description: '',
            itemCount: 3,
            updatedAt: '2026-07-04T10:00:00.000Z',
          },
          {
            id: 'dataset-other',
            name: '生产数据',
            description: '线上样本',
            itemCount: 10,
            updatedAt: '2026-07-04T10:00:00.000Z',
          },
        ],
      }
    },
  }

  const datasets = await listProjectAutoEvaluationDatasets(
    api as never,
    'project-1',
    '回流'
  )

  assert.deepEqual(
    datasets.map((dataset) => dataset.id),
    ['dataset-flowback']
  )
})

test('dataset mutations call project-scoped Langfuse dataset endpoints', async () => {
  const calls: unknown[] = []
  const input = {
    name: '新增badcase集',
    type: 'badcase' as const,
    description: 'desc',
    metadata: { tags: ['badcase集'] },
    inputSchema: {},
    expectedOutputSchema: {},
  }
  const api = {
    async createProjectDataset(options: unknown) {
      calls.push(['create', options])
      return { id: 'dataset-1' }
    },
    async updateProjectDataset(options: unknown) {
      calls.push(['update', options])
      return { id: 'dataset-1' }
    },
    async deleteProjectDataset(options: unknown) {
      calls.push(['delete', options])
      return { id: 'dataset-1' }
    },
  }

  await createProjectDataset(api as never, 'project-1', input)
  await updateProjectDataset(api as never, 'project-1', 'dataset-1', input)
  await deleteProjectDataset(api as never, 'project-1', 'dataset-1')

  assert.deepEqual(calls, [
    ['create', { path: { projectId: 'project-1' }, body: input }],
    [
      'update',
      {
        path: { projectId: 'project-1', datasetId: 'dataset-1' },
        body: input,
      },
    ],
    ['delete', { path: { projectId: 'project-1', datasetId: 'dataset-1' } }],
  ])
})
