import type { SceneRunParameters } from '../types'

export type DatasetMetricStatus = 'idle' | 'pending' | 'error' | 'ready'

export type ExperimentRunSelectionState = {
  sceneId: string
  selectedDatasetId: string
  selectedWebhookIds: string[]
  selectedEvaluatorIds: string[]
  runParameters: SceneRunParameters
}

export type ExperimentSceneDefaults = {
  datasetId: string
  runParameters: SceneRunParameters
}

const experimentDatasetPickerParamKeys = [
  'datasetPickerPage',
  'datasetPickerPageSize',
  'datasetPickerKeyword',
  'datasetPickerSort',
  'datasetPickerType',
] as const

export async function resolveDatasetSelection<T>({
  datasetId,
  currentDatasets,
  loadDataset,
  isLatestSelection,
}: {
  datasetId: string
  currentDatasets: ReadonlyMap<string, T>
  loadDataset: (datasetId: string) => Promise<T>
  isLatestSelection: (datasetId: string) => boolean
}) {
  const currentDataset = currentDatasets.get(datasetId)
  if (currentDataset) {
    return isLatestSelection(datasetId) ? currentDataset : null
  }

  const dataset = await loadDataset(datasetId)
  return isLatestSelection(datasetId) ? dataset : null
}

export function clearExperimentDatasetPickerParams(params: URLSearchParams) {
  const nextParams = new URLSearchParams(params)
  experimentDatasetPickerParamKeys.forEach((key) => nextParams.delete(key))
  return nextParams
}

export function applyExperimentSceneSelection(
  state: ExperimentRunSelectionState,
  sceneId: string,
  defaults: ExperimentSceneDefaults,
  options: { lockDataset?: boolean } = {}
): ExperimentRunSelectionState {
  return {
    ...state,
    sceneId,
    selectedDatasetId: options.lockDataset
      ? state.selectedDatasetId
      : defaults.datasetId,
    selectedWebhookIds: [],
    selectedEvaluatorIds: [],
    runParameters: { ...defaults.runParameters },
  }
}

export function applyExperimentDatasetSelection(
  state: ExperimentRunSelectionState,
  selectedDatasetId: string
): ExperimentRunSelectionState {
  return { ...state, selectedDatasetId }
}

export function buildProjectScenesHref(projectId: string) {
  return `/projects/${encodeURIComponent(projectId)}/scenes?tab=management`
}

export function buildProjectDatasetsHref(projectId: string) {
  return `/projects/${encodeURIComponent(projectId)}/evaluation/datasets`
}

export function buildProjectTraceLogsHref(projectId: string, traceId: string) {
  return `/projects/${encodeURIComponent(projectId)}/observability/traces/logs?traceId=${encodeURIComponent(traceId)}`
}

export function getDatasetExperimentReportsQueryKey(
  api: unknown,
  projectId: string,
  datasetId: string
) {
  return ['dataset-experiment-reports', api, projectId, datasetId] as const
}

export function getDatasetSubmitBlockReason({
  hasSelectedDataset,
  metricStatus,
  activeItemCount,
}: {
  hasSelectedDataset: boolean
  metricStatus: DatasetMetricStatus
  activeItemCount?: number
}) {
  if (!hasSelectedDataset) return '请选择一个数据集'
  if (metricStatus === 'pending') return '所选数据集指标加载中，请稍后再试'
  if (metricStatus === 'error') return '所选数据集指标加载失败，请重试'
  if (metricStatus !== 'ready') return '请选择一个数据集'
  if (activeItemCount === 0) {
    return '所选数据集暂无有效数据项，无法发起试验'
  }
  return null
}
