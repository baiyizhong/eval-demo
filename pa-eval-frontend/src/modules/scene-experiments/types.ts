import type { DatasetRecord } from '@/modules/app-evaluation/types'

export type WebhookAuthType = 'NONE' | 'BEARER' | 'API_KEY'

export type SceneRunParameters = {
  concurrency: number
  timeoutSeconds: number
  retryCount: number
  rounds: number
}

export type SceneWebhookService = {
  id: string
  name: string
  description: string
  url: string
  method: 'POST'
  authType: WebhookAuthType
  credential?: string
  credentialRef?: string
  maskedCredential?: string
  apiKeyHeader?: string
  headers: Record<string, string>
  serviceFamily: string
  version: string
}

export type SceneRecord = {
  id: string
  projectId: string
  name: string
  description: string
  enabled: boolean
  supportsScheduledExecution?: boolean
  defaultScheduledWebhookId?: string
  defaultScheduledWebhookIds?: string[]
  datasetId: string
  evaluatorIds: string[]
  webhooks: SceneWebhookService[]
  runParameters: SceneRunParameters
  createdAt: string
  updatedAt: string
}

export type SceneDetail = SceneRecord

export type SceneFormInput = Pick<
  SceneRecord,
  | 'name'
  | 'description'
  | 'enabled'
  | 'datasetId'
  | 'evaluatorIds'
  | 'webhooks'
  | 'runParameters'
> & {
  supportsScheduledExecution: boolean
  defaultScheduledWebhookIds: string[]
}

export type ExperimentReportStatus =
  'QUEUED' | 'RUNNING' | 'SCORING' | 'COMPLETED' | 'FAILED'

export type EvaluatorSnapshot = {
  id: string
  name: string
  type: string
  version: string
  outputVariables: string[]
  outputVariableMappings: {
    variableName: string
    scoreConfigName: string
  }[]
}

export type ExperimentScoreResult = {
  key: string
  evaluatorId: string
  evaluatorName: string
  variableName: string
  scoreName: string
  value: number
  standardDeviation: number
}

export type ExperimentRoundResult = {
  round: number
  scores: Record<string, number>
  successCount: number
  failureCount: number
}

export type ExperimentItemResult = {
  itemId: string
  input: unknown
  expectedOutput: unknown
  output: unknown
  scores: Record<string, number>
  status: 'PASSED' | 'FAILED'
  failureReason?: string
}

export type ExperimentGroup = {
  id: string
  projectId: string
  datasetId: string
  name: string
  description: string
  sceneId: string
  sceneSnapshot: SceneRecord
  evaluatorSnapshots: EvaluatorSnapshot[]
  runParameters: SceneRunParameters
  createdAt: string
}

export type ExperimentReport = {
  id: string
  projectId: string
  datasetId: string
  experimentGroupId: string
  experimentName: string
  name: string
  sceneId: string
  sceneSnapshot: SceneRecord
  webhookSnapshot: SceneWebhookService
  evaluatorSnapshots: EvaluatorSnapshot[]
  runParameters: SceneRunParameters
  status: ExperimentReportStatus
  progress: number
  itemCount: number
  successfulItemCount: number
  failedItemCount: number
  scoreResults: ExperimentScoreResult[]
  roundResults: ExperimentRoundResult[]
  itemResults: ExperimentItemResult[]
  insight: string
  failureReason?: string
  shouldFail?: boolean
  createdAt: string
  completedAt?: string
}

export type ExperimentReportBaseline = {
  id: string
  projectId: string
  datasetId: string
  sceneId: string
  serviceFamily: string
  reportId: string
  createdAt: string
  updatedAt: string
}

export type ProjectExperimentReport = ExperimentReport & {
  datasetName: string
  datasetType: DatasetRecord['type']
  datasetItemCount: number
  datasetUpdatedAt: string
}

export type ProjectExperimentSourceFailure = {
  datasetId: string
  datasetName: string
  resource: 'reports' | 'baselines'
  message: string
}

export type ProjectExperimentSource = {
  datasets: DatasetRecord[]
  reports: ProjectExperimentReport[]
  baselines: ExperimentReportBaseline[]
  failedDatasets: ProjectExperimentSourceFailure[]
}

export type CreateExperimentInput = {
  name: string
  description: string
  sceneId: string
  webhookIds: string[]
  evaluatorIds: string[]
  runParameters: SceneRunParameters
}

export type AggregateExperimentResult = {
  title: string
  reports: ExperimentReport[]
  bestReportId: string
  differenceItemCount: number
  insight: string[]
}

export type CompareExperimentResult = {
  title: string
  reports: ExperimentReport[]
  scoreRows: {
    key: string
    label: string
    evaluatorName: string
    values: Record<string, number>
    bestValue: number
  }[]
  insight: string[]
}
