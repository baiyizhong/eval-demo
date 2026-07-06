import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { DataTableQueryState } from '@/components/common/data-table'
import {
  createProjectAutoEvaluationTaskMock,
  getProjectAutoEvaluationLatestReportMock,
  listProjectAutoEvaluationTasksMock,
  refreshProjectAutoEvaluationTaskMock,
  rerunProjectAutoEvaluationTaskMock,
  resetProjectAutoEvaluationMocks,
} from '../../modules/app-evaluation/api/mock-auto-evaluation-api.ts'

const baseQuery: DataTableQueryState = {
  page: 1,
  pageSize: 10,
  keyword: '',
  filters: {},
  sorting: [],
}

describe('mock auto evaluation api', () => {
  it('lists tasks by project, keyword, and status', async () => {
    resetProjectAutoEvaluationMocks()

    const all = await listProjectAutoEvaluationTasksMock(
      'project_customer_agent',
      baseQuery,
      'all'
    )
    const filtered = await listProjectAutoEvaluationTasksMock(
      'project_customer_agent',
      { ...baseQuery, keyword: '客服' },
      'COMPLETED'
    )

    assert.ok(all.total >= 4)
    assert.equal(
      filtered.datas.every(
        (task) => task.name.includes('客服') && task.status === 'COMPLETED'
      ),
      true
    )
  })

  it('creates a running task and then refreshes it to a report-ready task', async () => {
    resetProjectAutoEvaluationMocks()

    const created = await createProjectAutoEvaluationTaskMock(
      'project_customer_agent',
      {
        name: '回归自动评测任务',
        description: '验证自动评测创建并运行',
        scoreName: 'answer_quality_regression',
        evaluatorId: 'evaluator_answer_quality',
        variableMapping: {
          input: 'trace.input',
          output: 'trace.output',
          expected_output: 'dataset.expectedOutput',
        },
        reportTemplateId: 'default',
        dataSource: { type: 'DATASET', datasetId: 'dataset_customer_qa' },
        sampleRate: 100,
        badcase: {
          enabled: true,
          scoreName: 'answer_quality_regression',
          operator: 'LTE',
          threshold: 0.6,
        },
      },
      'run'
    )

    assert.equal(created.status, 'RUNNING')

    const refreshed = await refreshProjectAutoEvaluationTaskMock(
      'project_customer_agent',
      created.id
    )
    assert.equal(refreshed.status, 'COMPLETED')

    const report = await getProjectAutoEvaluationLatestReportMock(
      'project_customer_agent',
      created.id
    )
    assert.equal(report?.status, 'READY')
    assert.equal(report?.sampleCount, refreshed.dataSource.sampleCount)
  })

  it('reruns completed task and hides latest report until refresh completes', async () => {
    resetProjectAutoEvaluationMocks()

    const list = await listProjectAutoEvaluationTasksMock(
      'project_customer_agent',
      baseQuery,
      'COMPLETED'
    )
    const task = list.datas[0]
    assert.ok(task)

    const running = await rerunProjectAutoEvaluationTaskMock(
      'project_customer_agent',
      task.id
    )
    assert.equal(running.status, 'RUNNING')

    const reportWhileRunning = await getProjectAutoEvaluationLatestReportMock(
      'project_customer_agent',
      task.id
    )
    assert.equal(reportWhileRunning?.status, 'GENERATING')
  })
})
