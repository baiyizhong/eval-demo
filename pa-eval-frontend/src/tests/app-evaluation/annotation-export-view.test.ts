import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  buildAnnotationBatchFilters,
  createProjectAnnotationExportJob,
  downloadProjectAnnotationExportJob,
  pollAnnotationExportJob,
  previewProjectAnnotationExport,
  type AnnotationExportJobInput,
  type AnnotationExportPreviewInput,
} from '../../modules/app-evaluation/api/annotation-api.ts'
import type { AnnotationExportJobRecord } from '../../modules/app-evaluation/types.ts'

const registry = readFileSync('src/api/registry.ts', 'utf8')
const apiSource = readFileSync(
  'src/modules/app-evaluation/api/annotation-api.ts',
  'utf8'
)
const typesSource = readFileSync(
  'src/modules/app-evaluation/types.ts',
  'utf8'
)
const dialogSource = readFileSync(
  'src/modules/app-evaluation/components/annotation-export-dialog.tsx',
  'utf8'
)
const detailSource = readFileSync(
  'src/modules/app-evaluation/views/annotation-queue-detail.tsx',
  'utf8'
)
const queueListSource = readFileSync(
  'src/modules/app-evaluation/views/annotation-queues.tsx',
  'utf8'
)
const bulkSource = readFileSync(
  'src/modules/app-evaluation/components/annotation-queue-item-bulk-actions.tsx',
  'utf8'
)

type AnnotationApiTestClient = Parameters<
  typeof previewProjectAnnotationExport
>[0]

const makeJob = (
  status: AnnotationExportJobRecord['status']
): AnnotationExportJobRecord => ({
  id: `job-${status}`,
  projectId: 'project-1',
  queueId: 'queue-1',
  scope: 'filtered',
  format: 'xlsx',
  status,
  totalCount: 2,
  exportedCount: status === 'SUCCEEDED' ? 2 : 0,
  fileName: 'annotation-export.xlsx',
  fileSize: 12,
  errorMessage: '',
  metadata: {},
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
  expiresAt: '2026-07-12T00:00:00.000Z',
})

const typeCheckPreviewInput = () => {
  const selectedInput: AnnotationExportPreviewInput = {
    scope: 'selected',
    format: 'xlsx',
    itemIds: ['item-1'],
  }
  void selectedInput

  const filteredInput: AnnotationExportPreviewInput = {
    scope: 'filtered',
    format: 'xlsx',
  }
  void filteredInput

  // @ts-expect-error selected export requires non-empty itemIds
  const missingSelectedItems: AnnotationExportPreviewInput = {
    scope: 'selected',
    format: 'xlsx',
  }
  void missingSelectedItems

  // @ts-expect-error selected export requires non-empty itemIds
  const emptySelectedItems: AnnotationExportPreviewInput = {
    scope: 'selected',
    format: 'xlsx',
    itemIds: [],
  }
  void emptySelectedItems

  const previewWithFormat: AnnotationExportPreviewInput = {
    scope: 'filtered',
    format: 'xlsx',
  }
  void previewWithFormat
}

const typeCheckJobInput = () => {
  const selectedInput: AnnotationExportJobInput = {
    scope: 'selected',
    format: 'csv',
    itemIds: ['item-1'],
  }
  void selectedInput

  // @ts-expect-error create export requires format
  const missingFormat: AnnotationExportJobInput = {
    scope: 'filtered',
  }
  void missingFormat
}

void typeCheckPreviewInput
void typeCheckJobInput

test('annotation export async job endpoints are registered', () => {
  assert.match(registry, /previewProjectAnnotationExport/)
  assert.match(registry, /createProjectAnnotationExportJob/)
  assert.match(registry, /getProjectAnnotationExportJob/)
  assert.match(registry, /downloadProjectAnnotationExportJob/)
  assert.match(registry, /annotation-queues\/:queueId\/export-jobs/)
})

test('annotation export download endpoint has blob response and exact route', () => {
  assert.match(
    registry,
    /downloadProjectAnnotationExportJob:\s*{\s*method:\s*'GET',\s*url:\s*'\/projects\/:projectId\/annotation-queues\/:queueId\/export-jobs\/:jobId\/download',\s*responseType:\s*'blob',\s*}/
  )
})

test('annotation export api helpers use typed payload generics', () => {
  assert.match(apiSource, /AnnotationExportPreviewPayload/)
  assert.match(apiSource, /AnnotationExportJobPayload/)
  assert.match(
    apiSource,
    /previewProjectAnnotationExport<\s*AnnotationExportPreview,\s*AnnotationExportPreviewPayload\s*>/
  )
  assert.match(
    apiSource,
    /createProjectAnnotationExportJob<\s*AnnotationExportJobRecord,\s*AnnotationExportJobPayload\s*>/
  )
  assert.match(apiSource, /globalThis\.setTimeout/)
  assert.match(apiSource, /Math\.min\(intervalMs,\s*remainingMs\)/)
})

test('annotation export types include scope format and preview payload', () => {
  assert.match(typesSource, /AnnotationExportScope/)
  assert.match(typesSource, /AnnotationExportFormat/)
  assert.match(typesSource, /AnnotationExportPreview/)
  assert.match(typesSource, /AnnotationExportJobRecord/)
})

test('annotation export dialog shows summary metrics preview and config controls', () => {
  assert.match(dialogSource, /基本信息/)
  assert.match(dialogSource, /评分指标/)
  assert.match(dialogSource, /数据明细/)
  assert.match(dialogSource, /Metadata/)
  assert.match(dialogSource, /Excel/)
  assert.match(dialogSource, /CSV/)
  assert.match(dialogSource, /TXT/)
  assert.match(dialogSource, /导出文件名/)
  assert.match(dialogSource, /默认按任务名称、导出时间和批量导出生成/)
  assert.match(dialogSource, /\$\{queueName\}_\$\{timestamp\}_批量导出/)
  assert.doesNotMatch(dialogSource, /pad\(date\.getSeconds\(\)\)/)
  assert.match(
    dialogSource,
    /pad\(date\.getDate\(\)\),\s*pad\(date\.getHours\(\)\)/
  )
  assert.match(dialogSource, /md:grid-cols-2/)
  assert.match(dialogSource, /md:grid-cols-3/)
  assert.match(dialogSource, /预览前 5 条/)
  assert.match(dialogSource, /buildDefaultExportFileName/)
  assert.match(dialogSource, /formatColumnLabel\(column: string\)[\s\S]*return column/)
  assert.match(dialogSource, /创建导出任务/)
})

test('annotation export preview does not refetch for format or metadata display changes', () => {
  const queryKeySource = dialogSource.slice(
    dialogSource.indexOf('queryKey:'),
    dialogSource.indexOf('queryFn:')
  )
  assert.doesNotMatch(queryKeySource, /format/)
  assert.doesNotMatch(queryKeySource, /splitMetadata/)
  assert.match(dialogSource, /deriveAnnotationExportPreview/)
  assert.match(dialogSource, /format: 'xlsx'/)
  assert.match(dialogSource, /splitMetadata: false/)
})

test('annotation export job can be created before preview finishes', () => {
  const disabledSource = dialogSource.slice(
    dialogSource.indexOf('const exportDisabled'),
    dialogSource.indexOf('const handleCreateExport')
  )
  assert.doesNotMatch(disabledSource, /previewQuery\.isLoading/)
  assert.doesNotMatch(disabledSource, /!preview(?:\s|\|)/)
  assert.doesNotMatch(disabledSource, /preview\.metrics\.total/)
  assert.doesNotMatch(dialogSource, /if \(exportDisabled \|\| !previewInput \|\| !preview\)/)
})

test('annotation queue detail reuses filtered export for cross-page selection', () => {
  assert.match(detailSource, /id: 'refresh'/)
  assert.match(detailSource, /label: '刷新'/)
  assert.match(detailSource, /icon: RefreshCw/)
  assert.doesNotMatch(detailSource, /id: 'export-data'/)
  assert.match(detailSource, /AnnotationExportDialog/)
  assert.match(detailSource, /exportSelection\?\.scope/)
  assert.match(detailSource, /exportSelection\?\.filters/)
  assert.match(bulkSource, /selection\.isAllMatchingRowsSelected/)
  assert.match(bulkSource, /buildAnnotationBatchFilters/)
  assert.match(bulkSource, /scope: 'filtered'/)
  assert.match(bulkSource, /scope: 'selected'/)
  assert.match(queueListSource, /AnnotationExportDialog/)
  assert.match(queueListSource, /exportingQueue/)
  assert.doesNotMatch(queueListSource, /downloadJson/)
  assert.doesNotMatch(queueListSource, /exportProjectAnnotationQueue/)
  assert.match(bulkSource, /导出选中/)
  assert.match(bulkSource, /onExportSelected/)
  assert.doesNotMatch(bulkSource, /downloadJson/)
})

test('annotation filtered export preserves assignee filter snapshot', () => {
  assert.deepEqual(
    buildAnnotationBatchFilters({
      page: 2,
      pageSize: 10,
      keyword: '客服',
      filters: {
        status: ['PENDING'],
        assigneeIds: ['user-1'],
      },
      sorting: [],
    }),
    {
      keyword: '客服',
      status: ['PENDING'],
      assigneeIds: ['user-1'],
    }
  )
})

test('preview helper sends exact path and body casing', async () => {
  let receivedOptions: unknown
  const api = {
    async previewProjectAnnotationExport(options: unknown) {
      receivedOptions = options
      return {
        queue: {},
        metrics: { total: 1, completed: 1, pending: 0 },
        scoreConfigs: [],
        metadataKeys: ['env'],
        previewItems: [{ id: 'item-1' }],
      }
    },
  } as unknown as AnnotationApiTestClient

  await previewProjectAnnotationExport(api, 'project-1', 'queue-1', {
    scope: 'selected',
    format: 'csv',
    filters: { keyword: 'latency' },
    itemIds: ['item-1'],
    previewLimit: 5,
    splitMetadata: true,
  })

  assert.deepEqual(receivedOptions, {
    path: { projectId: 'project-1', queueId: 'queue-1' },
    body: {
      scope: 'selected',
      format: 'csv',
      filters: { keyword: 'latency' },
      itemIds: ['item-1'],
      previewLimit: 5,
      splitMetadata: true,
    },
  })
})

test('create helper sends exact export job body', async () => {
  let receivedOptions: unknown
  const job = makeJob('PENDING')
  const api = {
    async createProjectAnnotationExportJob(options: unknown) {
      receivedOptions = options
      return job
    },
  } as unknown as AnnotationApiTestClient

  const result = await createProjectAnnotationExportJob(
    api,
    'project-1',
    'queue-1',
    {
      scope: 'filtered',
      format: 'csv',
      filters: { status: ['COMPLETED'] },
      splitMetadata: true,
      fileName: '人工标注导出.zip',
    }
  )

  assert.equal(result, job)
  assert.deepEqual(receivedOptions, {
    path: { projectId: 'project-1', queueId: 'queue-1' },
    body: {
      scope: 'filtered',
      format: 'csv',
      filters: { status: ['COMPLETED'] },
      itemIds: [],
      splitMetadata: true,
      fileName: '人工标注导出.zip',
    },
  })
})

test('download helper returns blob from api method', async () => {
  const blob = new Blob(['export'])
  const api = {
    async downloadProjectAnnotationExportJob(options: unknown) {
      assert.deepEqual(options, {
        path: {
          projectId: 'project-1',
          queueId: 'queue-1',
          jobId: 'job-1',
        },
      })
      return blob
    },
  } as unknown as AnnotationApiTestClient

  const result = await downloadProjectAnnotationExportJob(
    api,
    'project-1',
    'queue-1',
    'job-1'
  )

  assert.equal(result, blob)
})

test('poll returns when export job moves from pending to succeeded', async () => {
  const statuses: AnnotationExportJobRecord['status'][] = [
    'PENDING',
    'SUCCEEDED',
  ]
  const api = {
    async getProjectAnnotationExportJob() {
      return makeJob(statuses.shift() ?? 'SUCCEEDED')
    },
  } as unknown as AnnotationApiTestClient

  const result = await pollAnnotationExportJob(
    api,
    'project-1',
    'queue-1',
    'job-1',
    { intervalMs: 1, timeoutMs: 50 }
  )

  assert.equal(result.status, 'SUCCEEDED')
})

test('poll returns failed export job immediately', async () => {
  let callCount = 0
  const failedJob = makeJob('FAILED')
  const api = {
    async getProjectAnnotationExportJob() {
      callCount += 1
      return failedJob
    },
  } as unknown as AnnotationApiTestClient

  const result = await pollAnnotationExportJob(
    api,
    'project-1',
    'queue-1',
    'job-1',
    { intervalMs: 1, timeoutMs: 50 }
  )

  assert.equal(result, failedJob)
  assert.equal(callCount, 1)
})

test('poll timeout throws exact message without waiting a full interval', async () => {
  const api = {
    async getProjectAnnotationExportJob() {
      return makeJob('PENDING')
    },
  } as unknown as AnnotationApiTestClient

  await assert.rejects(
    () =>
      pollAnnotationExportJob(api, 'project-1', 'queue-1', 'job-1', {
        intervalMs: 50,
        timeoutMs: 5,
      }),
    { message: '导出任务仍在处理中，请稍后刷新后下载' }
  )
})
