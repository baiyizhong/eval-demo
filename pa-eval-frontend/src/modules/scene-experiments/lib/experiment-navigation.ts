export type SceneExperimentTab = 'experiments' | 'management'
export type ExperimentNavigationSource = 'project' | 'dataset'

export function normalizeSceneExperimentTab(
  value: string | null
): SceneExperimentTab {
  return value === 'management' ? 'management' : 'experiments'
}

function normalizeSource(
  value: string | null | undefined
): ExperimentNavigationSource {
  return value === 'project' ? 'project' : 'dataset'
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value)
}

export function buildExperimentReportHref(input: {
  projectId: string
  datasetId: string
  reportId: string
  source: ExperimentNavigationSource
}) {
  const params = new URLSearchParams({ source: input.source })
  return `/projects/${encodePathSegment(input.projectId)}/evaluation/datasets/${encodePathSegment(input.datasetId)}/experiment-reports/${encodePathSegment(input.reportId)}?${params}`
}

export function buildExperimentAnalysisHref(input: {
  type: 'aggregate' | 'compare'
  projectId: string
  datasetId: string
  reportIds: string[]
  source: ExperimentNavigationSource
}) {
  const params = new URLSearchParams({
    reportIds: input.reportIds.join(','),
    source: input.source,
  })
  return `/projects/${encodePathSegment(input.projectId)}/evaluation/datasets/${encodePathSegment(input.datasetId)}/experiments/${input.type}?${params}`
}

export function buildExperimentReturnHref(input: {
  projectId: string
  datasetId: string
  source: string | null | undefined
}) {
  if (normalizeSource(input.source) === 'project') {
    const params = new URLSearchParams({ tab: 'experiments' })
    return `/projects/${encodePathSegment(input.projectId)}/scenes?${params}`
  }

  const params = new URLSearchParams({ tab: 'reports' })
  return `/projects/${encodePathSegment(input.projectId)}/evaluation/datasets/${encodePathSegment(input.datasetId)}?${params}`
}
