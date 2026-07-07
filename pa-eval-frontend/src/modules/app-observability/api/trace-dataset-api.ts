import type { DatasetRecord, DatasetType } from '@/modules/app-evaluation/types'
import type { ApiMethod } from '@/api/types'

type TraceDatasetApiClient = {
  createProjectDataset: ApiMethod
  addProjectTracesToDataset: ApiMethod
}

export type TraceDatasetTargetInput =
  | {
      mode: 'existing'
      datasetId: string
      traceIds: string[]
    }
  | {
      mode: 'create'
      name: string
      description: string
      datasetType: DatasetType
      traceIds: string[]
    }

export type TraceDatasetAddResult = {
  datasetId: string
  successCount: number
  failureCount: number
  traceCount: number
  itemIds: string[]
  failures: {
    traceId: string
    reason: string
  }[]
}

export async function addProjectTracesToDatasetTarget(
  api: TraceDatasetApiClient,
  projectId: string,
  input: TraceDatasetTargetInput
): Promise<TraceDatasetAddResult> {
  const datasetId =
    input.mode === 'existing'
      ? input.datasetId
      : (
          await api.createProjectDataset<DatasetRecord>({
            path: { projectId },
            body: {
              name: input.name,
              type: input.datasetType,
              description: input.description,
              metadata: {
                type: input.datasetType,
                source: 'trace_log_bulk',
              },
              inputSchema: {},
              expectedOutputSchema: {},
            },
          })
        ).id

  return api.addProjectTracesToDataset<TraceDatasetAddResult>({
    path: { projectId },
    body: {
      datasetId,
      traceIds: input.traceIds,
    },
  })
}
