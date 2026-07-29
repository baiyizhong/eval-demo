import type { ExperimentReportBaseline } from '../types'

type AggregateCandidate = {
  status: string
  datasetId: string
  experimentGroupId: string
}

type CompareCandidate = {
  status: string
  datasetId: string
  sceneId: string
  serviceFamily: string
}

type BaselineScopeCandidate = {
  datasetId: string
  sceneId: string
  serviceFamily: string
}

type BaselineReportCandidate = {
  datasetId: string
  sceneId: string
  webhookSnapshot: {
    serviceFamily: string
  }
}

export function buildExperimentReportName(
  experimentName: string,
  serviceName: string
) {
  return `${experimentName.trim()} - ${serviceName.trim()}`
}

export function buildScoreResultKey(evaluatorId: string, variableName: string) {
  return `${evaluatorId.trim()}:${variableName.trim()}`
}

export function estimateExperimentCalls(
  itemCount: number,
  serviceCount: number,
  rounds: number
) {
  return (
    Math.max(0, itemCount) * Math.max(0, serviceCount) * Math.max(0, rounds)
  )
}

export function canAggregateReports(reports: AggregateCandidate[]) {
  if (
    reports.length < 2 ||
    reports.some((report) => report.status !== 'COMPLETED')
  ) {
    return false
  }

  return reports.every(
    (report) =>
      report.datasetId === reports[0]?.datasetId &&
      report.experimentGroupId === reports[0]?.experimentGroupId
  )
}

export function canCompareReports(reports: CompareCandidate[]) {
  if (
    reports.length < 2 ||
    reports.some(
      (report) =>
        report.status !== 'COMPLETED' ||
        !report.datasetId ||
        !report.sceneId ||
        !report.serviceFamily
    )
  ) {
    return false
  }

  return reports.every(
    (report) =>
      report.datasetId === reports[0]?.datasetId &&
      report.sceneId === reports[0]?.sceneId &&
      report.serviceFamily === reports[0]?.serviceFamily
  )
}

export function buildExperimentBaselineScopeKey(
  candidate: BaselineScopeCandidate
) {
  return [candidate.datasetId, candidate.sceneId, candidate.serviceFamily].join(
    ':'
  )
}

export function findMatchingBaseline(
  baselines: ExperimentReportBaseline[],
  report: BaselineReportCandidate
) {
  const reportScopeKey = buildExperimentBaselineScopeKey({
    datasetId: report.datasetId,
    sceneId: report.sceneId,
    serviceFamily: report.webhookSnapshot.serviceFamily,
  })

  return baselines.find(
    (baseline) => buildExperimentBaselineScopeKey(baseline) === reportScopeKey
  )
}

export function isCurrentBaselineReport(
  reportId: string,
  baseline?: ExperimentReportBaseline
) {
  return baseline?.reportId === reportId
}
