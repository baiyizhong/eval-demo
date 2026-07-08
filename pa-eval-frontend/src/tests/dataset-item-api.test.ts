import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  archiveProjectDatasetItem,
  createProjectDatasetItem,
  createProjectDatasetExportJob,
  getProjectDatasetExportJob,
  updateProjectDatasetItem,
} from '../modules/app-evaluation/api/dataset-api.ts'

test('dataset item mutations call project-scoped real endpoints', async () => {
  const calls: unknown[] = []
  const input = {
    input: { question: '怎么退款？' },
    expectedOutput: { answer: '在订单详情申请退款' },
    metadata: { priority: 'high' },
  }
  const api = {
    async createProjectDatasetItem(options: unknown) {
      calls.push(['create-item', options])
      return { id: 'item-1' }
    },
    async updateProjectDatasetItem(options: unknown) {
      calls.push(['update-item', options])
      return { id: 'item-1' }
    },
    async archiveProjectDatasetItem(options: unknown) {
      calls.push(['archive-item', options])
      return { id: 'item-1' }
    },
    async createProjectDatasetExportJob(options: unknown) {
      calls.push(['create-export-job', options])
      return { id: 'job-1' }
    },
    async getProjectDatasetExportJob(options: unknown) {
      calls.push(['get-export-job', options])
      return { id: 'job-1' }
    },
  }

  await createProjectDatasetItem(api as never, 'project-1', 'dataset-1', input)
  await updateProjectDatasetItem(
    api as never,
    'project-1',
    'dataset-1',
    'item-1',
    input
  )
  await archiveProjectDatasetItem(
    api as never,
    'project-1',
    'dataset-1',
    'item-1'
  )
  await createProjectDatasetExportJob(
    api as never,
    'project-1',
    'dataset-1',
    'xlsx'
  )
  await getProjectDatasetExportJob(
    api as never,
    'project-1',
    'dataset-1',
    'job-1'
  )

  assert.deepEqual(calls, [
    [
      'create-item',
      {
        path: { projectId: 'project-1', datasetId: 'dataset-1' },
        body: input,
      },
    ],
    [
      'update-item',
      {
        path: {
          projectId: 'project-1',
          datasetId: 'dataset-1',
          itemId: 'item-1',
        },
        body: input,
      },
    ],
    [
      'archive-item',
      {
        path: {
          projectId: 'project-1',
          datasetId: 'dataset-1',
          itemId: 'item-1',
        },
      },
    ],
    [
      'create-export-job',
      {
        path: { projectId: 'project-1', datasetId: 'dataset-1' },
        body: { format: 'xlsx' },
      },
    ],
    [
      'get-export-job',
      {
        path: { projectId: 'project-1', datasetId: 'dataset-1', jobId: 'job-1' },
      },
    ],
  ])
})
