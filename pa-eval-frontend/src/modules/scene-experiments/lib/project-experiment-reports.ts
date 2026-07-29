import type { DatasetRecord } from '@/modules/app-evaluation/types'
import type {
  DataTableListResponse,
  DataTableQueryState,
  DataTableSelectionState,
} from '@/components/common/data-table'
import type {
  ExperimentReport,
  ExperimentReportBaseline,
  ProjectExperimentReport,
  ProjectExperimentSource,
} from '../types'

type SourceLoaders = {
  loadDatasets: () => Promise<DatasetRecord[]>
  loadReports: (datasetId: string) => Promise<ExperimentReport[]>
  loadBaselines: (datasetId: string) => Promise<ExperimentReportBaseline[]>
}

type SupportedSortId = 'completedAt' | 'createdAt' | 'datasetName' | 'name'

type ExperimentReportSelection<TReport extends ExperimentReport> = Pick<
  DataTableSelectionState<TReport>,
  'isAllMatchingRowsSelected' | 'queryState' | 'totalRowCount'
>

const supportedSortIds = new Set<SupportedSortId>([
  'completedAt',
  'createdAt',
  'datasetName',
  'name',
])

export async function loadProjectExperimentSource({
  loadDatasets,
  loadReports,
  loadBaselines,
}: SourceLoaders): Promise<ProjectExperimentSource> {
  const datasets = await loadDatasets()
  const [reportResults, baselineResults] = await Promise.all([
    Promise.allSettled(datasets.map((dataset) => loadReports(dataset.id))),
    Promise.allSettled(datasets.map((dataset) => loadBaselines(dataset.id))),
  ])
  const source: ProjectExperimentSource = {
    datasets,
    reports: [],
    baselines: [],
    failedDatasets: [],
  }

  datasets.forEach((dataset, index) => {
    const reportResult = reportResults[index]
    if (reportResult?.status === 'fulfilled') {
      source.reports.push(
        ...reportResult.value.map<ProjectExperimentReport>((report) => ({
          ...report,
          datasetName: dataset.name,
          datasetType: dataset.type,
          datasetItemCount: dataset.itemCount,
          datasetUpdatedAt: dataset.updatedAt,
        }))
      )
    } else if (reportResult?.status === 'rejected') {
      source.failedDatasets.push({
        datasetId: dataset.id,
        datasetName: dataset.name,
        resource: 'reports',
        message: failureMessage(reportResult.reason, '试验报告加载失败'),
      })
    }

    const baselineResult = baselineResults[index]
    if (baselineResult?.status === 'fulfilled') {
      source.baselines.push(...baselineResult.value)
    } else if (baselineResult?.status === 'rejected') {
      source.failedDatasets.push({
        datasetId: dataset.id,
        datasetName: dataset.name,
        resource: 'baselines',
        message: failureMessage(baselineResult.reason, '基线加载失败'),
      })
    }
  })

  return source
}

export async function resolveExperimentReportSelection<
  TReport extends ExperimentReport,
>({
  selectedReports,
  selection,
  loadAllMatching,
}: {
  selectedReports: TReport[]
  selection: ExperimentReportSelection<TReport>
  loadAllMatching: (
    queryState: DataTableQueryState,
    totalRowCount: number
  ) => Promise<TReport[]>
}) {
  const reports = selection.isAllMatchingRowsSelected
    ? await loadAllMatching(selection.queryState, selection.totalRowCount)
    : selectedReports

  return reports.filter((report) => report.status === 'COMPLETED')
}

export function queryProjectExperimentReports(
  rows: ProjectExperimentReport[],
  state: DataTableQueryState
): DataTableListResponse<ProjectExperimentReport> {
  const keyword = state.keyword.trim().toLocaleLowerCase()
  const datasetIds = readStringFilter(state.filters.datasetId)
  const statuses = readStringFilter(state.filters.status)
  const filtered = rows.filter((row) => {
    const matchesKeyword =
      !keyword ||
      [
        row.experimentName,
        row.name,
        row.datasetName,
        row.sceneSnapshot.name,
        row.webhookSnapshot.name,
      ].some((value) => value.toLocaleLowerCase().includes(keyword))

    return (
      matchesKeyword &&
      (datasetIds.length === 0 || datasetIds.includes(row.datasetId)) &&
      (statuses.length === 0 || statuses.includes(row.status))
    )
  })
  const requestedSort = state.sorting[0]
  const sortId = normalizeSortId(requestedSort?.id)
  const descending = requestedSort?.desc ?? true
  const sorted = filtered
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const comparison = compareReportValues(left.row, right.row, sortId)
      if (comparison === 0) return left.index - right.index
      return descending ? -comparison : comparison
    })
    .map(({ row }) => row)
  const page = Math.max(1, state.page)
  const pageSize = Math.max(1, state.pageSize)
  const start = (page - 1) * pageSize

  return {
    total: sorted.length,
    datas: sorted.slice(start, start + pageSize),
  }
}

function readStringFilter(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function normalizeSortId(sortId?: string): SupportedSortId {
  return supportedSortIds.has(sortId as SupportedSortId)
    ? (sortId as SupportedSortId)
    : 'createdAt'
}

function compareReportValues(
  left: ProjectExperimentReport,
  right: ProjectExperimentReport,
  sortId: SupportedSortId
) {
  if (sortId === 'createdAt' || sortId === 'completedAt') {
    return compareDates(left[sortId], right[sortId])
  }

  return left[sortId].localeCompare(right[sortId])
}

function compareDates(left?: string, right?: string) {
  const leftTime = parseDate(left)
  const rightTime = parseDate(right)
  if (leftTime === null && rightTime === null) return 0
  if (leftTime === null) return -1
  if (rightTime === null) return 1
  return leftTime - rightTime
}

function parseDate(value?: string) {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? null : timestamp
}

function failureMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback
}
