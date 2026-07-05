import assert from 'node:assert/strict'
import { test } from 'node:test'
import { listProjectAutoEvaluationDatasets } from './dataset-api.ts'

test('listProjectAutoEvaluationDatasets merges datasets from visible active projects', async () => {
  const requestedProjectIds: string[] = []
  const api = {
    async getProjects() {
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

  assert.deepEqual(requestedProjectIds, ['project-empty', 'project-with-dataset'])
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
