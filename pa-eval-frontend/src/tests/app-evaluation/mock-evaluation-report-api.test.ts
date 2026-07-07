import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { DataTableQueryState } from '@/components/common/data-table'
import {
  createProjectEvaluationReportFlowbackMock,
  exportProjectEvaluationReportMock,
  getProjectEvaluationReportMock,
  listProjectEvaluationReportBadcasesMock,
  listProjectEvaluationReportFlowbacksMock,
  listProjectEvaluationReportsMock,
  previewProjectEvaluationReportFlowbackMock,
  regenerateProjectEvaluationReportMock,
  resetProjectEvaluationReportMocks,
} from '../../modules/app-evaluation/api/mock-evaluation-report-api.ts'

const baseQuery: DataTableQueryState = {
  page: 1,
  pageSize: 10,
  keyword: '',
  filters: {},
  sorting: [],
}

describe('mock evaluation report api', () => {
  it('lists reports by source type and keyword', async () => {
    resetProjectEvaluationReportMocks()

    const reports = await listProjectEvaluationReportsMock(
      'project_customer_agent',
      {
        ...baseQuery,
        keyword: '客服',
        filters: { sourceType: ['AUTO_EVAL'] },
      }
    )

    assert.ok(reports.total >= 1)
    assert.equal(
      reports.datas.every(
        (report) =>
          report.sourceType === 'AUTO_EVAL' &&
          (report.title.includes('客服') ||
            report.sourceTaskName.includes('客服'))
      ),
      true
    )
  })

  it('gets report detail and exports markdown', async () => {
    resetProjectEvaluationReportMocks()

    const reports = await listProjectEvaluationReportsMock(
      'project_customer_agent',
      baseQuery
    )
    const ready = reports.datas.find((report) => report.status === 'READY')
    assert.ok(ready)

    const detail = await getProjectEvaluationReportMock(
      'project_customer_agent',
      ready.id
    )
    const exported = await exportProjectEvaluationReportMock(
      'project_customer_agent',
      ready.id,
      'markdown'
    )

    assert.equal(detail.id, ready.id)
    assert.match(exported.content, /# /)
    assert.equal(exported.filename.endsWith('.md'), true)
  })

  it('regenerates report and refreshes to ready', async () => {
    resetProjectEvaluationReportMocks()

    const reports = await listProjectEvaluationReportsMock(
      'project_customer_agent',
      baseQuery
    )
    const ready = reports.datas.find((report) => report.status === 'READY')
    assert.ok(ready)

    const generating = await regenerateProjectEvaluationReportMock(
      'project_customer_agent',
      ready.id
    )
    assert.equal(generating.status, 'GENERATING')

    const refreshed = await getProjectEvaluationReportMock(
      'project_customer_agent',
      ready.id
    )
    assert.equal(refreshed.status, 'READY')
  })

  it('previews and executes badcase flowback', async () => {
    resetProjectEvaluationReportMocks()

    const reports = await listProjectEvaluationReportsMock(
      'project_customer_agent',
      {
        ...baseQuery,
        filters: { hasBadcase: ['true'] },
      }
    )
    const report = reports.datas[0]
    assert.ok(report)

    const badcases = await listProjectEvaluationReportBadcasesMock(
      'project_customer_agent',
      report.id,
      baseQuery
    )
    assert.ok(badcases.total >= 1)

    const preview = await previewProjectEvaluationReportFlowbackMock(
      'project_customer_agent',
      report.id,
      {
        flowbackType: 'BADCASE',
        range: 'SELECTED',
        selectedItemIds: badcases.datas.slice(0, 2).map((item) => item.id),
        targetDataset: {
          mode: 'CREATE',
          name: 'badcase-自动评测-回归-20260703',
          description: '来自评测报告的 badcase 回流数据',
        },
        dedupeStrategy: 'SKIP_DUPLICATE',
      }
    )

    assert.equal(preview.willCreateCount > 0, true)

    const flowback = await createProjectEvaluationReportFlowbackMock(
      'project_customer_agent',
      report.id,
      {
        flowbackType: 'BADCASE',
        range: 'SELECTED',
        selectedItemIds: badcases.datas.slice(0, 2).map((item) => item.id),
        targetDataset: {
          mode: 'CREATE',
          name: preview.defaultDatasetName,
          description: '来自评测报告的 badcase 回流数据',
        },
        dedupeStrategy: 'SKIP_DUPLICATE',
      }
    )

    const history = await listProjectEvaluationReportFlowbacksMock(
      'project_customer_agent',
      report.id
    )

    assert.equal(flowback.status, 'COMPLETED')
    assert.equal(
      history.some((item) => item.id === flowback.id),
      true
    )
  })
})
