import type {
  DataTableListResponse,
  DataTableQueryState,
} from '@/components/common/data-table'
import {
  mockEvaluationReportBadcases,
  mockEvaluationReportFlowbacks,
  mockEvaluationReportItems,
  mockEvaluationReports,
} from '../data/mock-evaluation-reports.ts'
import type {
  EvaluationReportBadcaseRecord,
  EvaluationReportDetailRecord,
  EvaluationReportFlowbackInput,
  EvaluationReportFlowbackRecord,
  EvaluationReportItemRecord,
  EvaluationReportRecord,
} from '../types'

let reports = clone(mockEvaluationReports)
let badcases = clone(mockEvaluationReportBadcases)
let items = clone(mockEvaluationReportItems)
let flowbacks = clone(mockEvaluationReportFlowbacks)

const delay = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms))

export function resetProjectEvaluationReportMocks(): void {
  reports = clone(mockEvaluationReports)
  badcases = clone(mockEvaluationReportBadcases)
  items = clone(mockEvaluationReportItems)
  flowbacks = clone(mockEvaluationReportFlowbacks)
}

export async function listProjectEvaluationReportsMock(
  projectId: string,
  query: DataTableQueryState
): Promise<DataTableListResponse<EvaluationReportRecord>> {
  await delay()
  const keyword = query.keyword.trim().toLowerCase()
  const sourceTypes = query.filters.sourceType as string[] | undefined
  const statuses = query.filters.status as string[] | undefined
  const hasBadcase = query.filters.hasBadcase as string[] | undefined
  const rows = reports
    .filter((report) => report.projectId === projectId)
    .filter((report) => {
      if (!keyword) return true
      return [report.title, report.sourceTaskName]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    })
    .filter(
      (report) =>
        !sourceTypes?.length || sourceTypes.includes(report.sourceType)
    )
    .filter((report) => !statuses?.length || statuses.includes(report.status))
    .filter(
      (report) =>
        !hasBadcase?.length ||
        (hasBadcase.includes('true')
          ? report.badcaseCount > 0
          : report.badcaseCount === 0)
    )

  return paginate(rows, query)
}

export async function getProjectEvaluationReportMock(
  projectId: string,
  reportId: string
): Promise<EvaluationReportDetailRecord> {
  await delay()
  const index = reports.findIndex(
    (report) => report.projectId === projectId && report.id === reportId
  )
  if (index < 0) {
    return createFallbackReport(projectId, reportId)
  }
  if (reports[index].status === 'GENERATING') {
    reports[index] = {
      ...reports[index],
      status: 'READY',
      generatedAt: new Date().toISOString(),
    }
  }
  return reports[index]
}

export async function regenerateProjectEvaluationReportMock(
  projectId: string,
  reportId: string
): Promise<EvaluationReportRecord> {
  await delay()
  const index = reports.findIndex(
    (report) => report.projectId === projectId && report.id === reportId
  )
  if (index < 0) throw new Error('评测报告不存在')
  reports[index] = {
    ...reports[index],
    status: 'GENERATING',
    generatedAt: new Date().toISOString(),
  }
  return reports[index]
}

export async function exportProjectEvaluationReportMock(
  projectId: string,
  reportId: string,
  format: 'markdown'
): Promise<{ filename: string; content: string }> {
  await delay()
  const report = reports.find(
    (item) => item.projectId === projectId && item.id === reportId
  )
  if (!report) throw new Error('评测报告不存在')
  if (report.status !== 'READY') throw new Error('仅已生成报告支持导出')
  return {
    filename: `${report.title}.${format === 'markdown' ? 'md' : format}`,
    content: [
      `# ${report.title}`,
      '',
      report.summary,
      '',
      `- 样本数：${report.sampleCount}`,
      `- Badcase：${report.badcaseCount}`,
      `- 平均分：${report.metrics.averageScore}`,
    ].join('\n'),
  }
}

export async function listProjectEvaluationReportBadcasesMock(
  projectId: string,
  reportId: string,
  query: DataTableQueryState
): Promise<DataTableListResponse<EvaluationReportBadcaseRecord>> {
  await delay()
  assertReport(projectId, reportId)
  const keyword = query.keyword.trim().toLowerCase()
  const rows = badcases
    .filter((item) => item.reportId === reportId)
    .filter((item) => {
      if (!keyword) return true
      return [item.traceId, item.observationId, item.comment]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    })
  return paginate(rows, query)
}

export async function listProjectEvaluationReportItemsMock(
  projectId: string,
  reportId: string,
  query: DataTableQueryState
): Promise<DataTableListResponse<EvaluationReportItemRecord>> {
  await delay()
  assertReport(projectId, reportId)
  const keyword = query.keyword.trim().toLowerCase()
  const rows = items
    .filter((item) => item.reportId === reportId)
    .filter((item) => {
      if (!keyword) return true
      return [item.sourceId, item.scoreSummary]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    })
  return paginate(rows, query)
}

export async function previewProjectEvaluationReportFlowbackMock(
  projectId: string,
  reportId: string,
  input: EvaluationReportFlowbackInput
): Promise<{
  matchedCount: number
  duplicateCount: number
  willCreateCount: number
  defaultDatasetName: string
}> {
  await delay()
  const report = assertReport(projectId, reportId)
  const matchedCount =
    input.range === 'SELECTED'
      ? input.selectedItemIds.length
      : report.badcaseCount
  const duplicateCount = Math.min(2, Math.floor(matchedCount / 4))
  return {
    matchedCount,
    duplicateCount,
    willCreateCount: Math.max(0, matchedCount - duplicateCount),
    defaultDatasetName: `badcase-自动评测-${report.sourceTaskName}-20260703`,
  }
}

export async function createProjectEvaluationReportFlowbackMock(
  projectId: string,
  reportId: string,
  input: EvaluationReportFlowbackInput
): Promise<EvaluationReportFlowbackRecord> {
  await delay()
  const report = assertReport(projectId, reportId)
  const matchedCount =
    input.range === 'SELECTED'
      ? input.selectedItemIds.length
      : report.badcaseCount
  const duplicateCount = Math.min(2, Math.floor(matchedCount / 4))
  const successCount = Math.max(0, matchedCount - duplicateCount)
  const flowback: EvaluationReportFlowbackRecord = {
    id: `flowback_${Date.now()}`,
    reportId,
    flowbackType: input.flowbackType,
    targetDatasetId:
      input.targetDataset.mode === 'EXISTING'
        ? input.targetDataset.datasetId
        : `dataset_${Date.now()}`,
    targetDatasetName:
      input.targetDataset.mode === 'EXISTING'
        ? '已选择数据集'
        : input.targetDataset.name,
    targetDatasetCreated: input.targetDataset.mode === 'CREATE',
    requestedCount: matchedCount,
    successCount,
    failedCount: 0,
    status: 'COMPLETED',
    createdBy: '当前用户',
    createdAt: new Date().toISOString(),
    errorDetail: [],
  }
  flowbacks = [flowback, ...flowbacks]
  reports = reports.map((item) =>
    item.projectId === projectId && item.id === reportId
      ? { ...item, flowbackCount: item.flowbackCount + successCount }
      : item
  )
  if (input.flowbackType === 'BADCASE') {
    const selected = new Set(input.selectedItemIds)
    badcases = badcases.map((item) =>
      item.reportId === reportId &&
      (input.range !== 'SELECTED' || selected.has(item.id))
        ? { ...item, flowbackStatus: 'FLOWED_BACK' }
        : item
    )
  }
  if (input.flowbackType === 'EVALUATION_DATA') {
    const selected = new Set(input.selectedItemIds)
    items = items.map((item) =>
      item.reportId === reportId &&
      (input.range !== 'SELECTED' || selected.has(item.id))
        ? { ...item, datasetFlowbackStatus: 'FLOWED_BACK' }
        : item
    )
  }
  return flowback
}

export async function listProjectEvaluationReportFlowbacksMock(
  projectId: string,
  reportId: string
): Promise<EvaluationReportFlowbackRecord[]> {
  await delay()
  assertReport(projectId, reportId)
  return flowbacks.filter((item) => item.reportId === reportId)
}

function assertReport(projectId: string, reportId: string) {
  const report = reports.find(
    (item) => item.projectId === projectId && item.id === reportId
  )
  if (!report) return createFallbackReport(projectId, reportId)
  return report
}

function createFallbackReport(projectId: string, reportId: string) {
  const now = new Date().toISOString()
  const report: EvaluationReportDetailRecord = {
    id: reportId,
    projectId,
    title: '自动评测即时报告',
    sourceType: 'AUTO_EVAL',
    sourceTaskId: reportId.replace(/^report_/, ''),
    sourceTaskName: '自动评测任务',
    status: 'READY',
    sampleCount: 48,
    badcaseCount: 6,
    flowbackCount: 0,
    generatedAt: now,
    summary: 'mock 自动评测运行完成后生成的即时报告。',
    metrics: {
      averageScore: 0.8,
      passRate: 0.86,
      failureRate: 0.02,
      badcaseRate: 0.12,
    },
    distribution: [
      { label: '0-0.4', count: 2 },
      { label: '0.4-0.6', count: 4 },
      { label: '0.6-0.8', count: 12 },
      { label: '0.8-1.0', count: 30 },
    ],
    groupAnalysis: [{ group: '默认分组', sampleCount: 48, averageScore: 0.8 }],
    recommendations: ['复核低分样本，并将稳定 badcase 回流到评测集。'],
    risks: ['该报告由前端 mock 生成，仅用于交互演示。'],
    reproduction: {
      reportId,
      sourceTaskId: reportId.replace(/^report_/, ''),
      scoreName: 'mock_score',
      generatedConfig: 'mock-generated=true',
    },
  }
  reports = [report, ...reports]
  return report
}

function paginate<T>(
  rows: T[],
  query: DataTableQueryState
): DataTableListResponse<T> {
  const start = (query.page - 1) * query.pageSize
  return {
    total: rows.length,
    datas: rows.slice(start, start + query.pageSize),
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
