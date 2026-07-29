import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DataTableQueryState } from '../../components/common/data-table/data-table.tsx'
import type { DatasetRecord } from '../../modules/app-evaluation/types.ts'
import {
  listAllDatasetExperimentReports,
  listAllProjectDatasets,
} from '../../modules/scene-experiments/api/scene-experiment-api.ts'
import {
  loadProjectExperimentSource,
  queryProjectExperimentReports,
} from '../../modules/scene-experiments/lib/project-experiment-reports.ts'
import type {
  ExperimentReport,
  ExperimentReportBaseline,
  ProjectExperimentReport,
} from '../../modules/scene-experiments/types.ts'

const dataset = (
  overrides: Partial<DatasetRecord> & Pick<DatasetRecord, 'id' | 'name'>
): DatasetRecord => {
  const { id, name, ...rest } = overrides
  return {
    id,
    projectId: 'proj_a',
    name,
    description: '',
    type: 'evaluation',
    metadata: { type: 'evaluation' },
    inputSchema: {},
    expectedOutputSchema: {},
    itemCount: 0,
    runCount: 0,
    createdAt: '2026-07-29T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z',
    ...rest,
  }
}

const report = (
  overrides: Partial<ExperimentReport> &
    Pick<ExperimentReport, 'id' | 'datasetId' | 'name'>
): ExperimentReport => {
  const { datasetId, id, name, ...rest } = overrides
  return {
    id,
    projectId: 'proj_a',
    datasetId,
    experimentGroupId: 'group_a',
    experimentName: '版本回归',
    name,
    sceneId: 'scene_a',
    sceneSnapshot: {
      id: 'scene_a',
      projectId: 'proj_a',
      name: '客服场景',
      description: '',
      enabled: true,
      datasetId,
      evaluatorIds: ['evaluator_a'],
      webhooks: [],
      runParameters: {
        concurrency: 5,
        timeoutSeconds: 30,
        retryCount: 2,
        rounds: 1,
      },
      createdAt: '2026-07-29T00:00:00.000Z',
      updatedAt: '2026-07-29T00:00:00.000Z',
    },
    webhookSnapshot: {
      id: 'webhook_a',
      name: '服务 v2',
      description: '',
      url: 'https://example.invalid/webhook',
      method: 'POST',
      authType: 'NONE',
      headers: {},
      serviceFamily: 'support',
      version: '2.0.0',
    },
    evaluatorSnapshots: [],
    runParameters: {
      concurrency: 5,
      timeoutSeconds: 30,
      retryCount: 2,
      rounds: 1,
    },
    status: 'COMPLETED',
    progress: 100,
    itemCount: 10,
    successfulItemCount: 10,
    failedItemCount: 0,
    scoreResults: [],
    roundResults: [],
    itemResults: [],
    insight: '',
    createdAt: '2026-07-29T03:00:00.000Z',
    completedAt: '2026-07-29T03:01:00.000Z',
    ...rest,
  }
}

const baseline = (
  overrides: Partial<ExperimentReportBaseline> &
    Pick<ExperimentReportBaseline, 'id' | 'datasetId' | 'reportId'>
): ExperimentReportBaseline => {
  const { datasetId, id, reportId, ...rest } = overrides
  return {
    id,
    projectId: 'proj_a',
    datasetId,
    sceneId: 'scene_a',
    serviceFamily: 'support',
    reportId,
    createdAt: '2026-07-29T03:02:00.000Z',
    updatedAt: '2026-07-29T03:02:00.000Z',
    ...rest,
  }
}

const projectReport = (
  overrides: Partial<ProjectExperimentReport> &
    Pick<ProjectExperimentReport, 'id' | 'datasetId' | 'datasetName' | 'name'>
): ProjectExperimentReport => {
  const { datasetName, ...reportOverrides } = overrides
  return {
    ...report(reportOverrides),
    datasetName,
    datasetType: 'evaluation',
    datasetItemCount: 10,
    datasetUpdatedAt: '2026-07-29T02:00:00.000Z',
  }
}

const query = (
  overrides: Partial<DataTableQueryState> = {}
): DataTableQueryState => ({
  page: 1,
  pageSize: 10,
  keyword: '',
  filters: {},
  sorting: [],
  ...overrides,
})

test('listAllProjectDatasets loads every page and stops on an empty page', async () => {
  const calls: number[] = []
  const api = {
    getProjectDatasets: async <T>(options: { query?: { page?: number } }) => {
      const page = options.query?.page ?? 1
      calls.push(page)
      const pages = [
        [
          dataset({ id: 'd1', name: '数据集一' }),
          dataset({ id: 'd2', name: '数据集二' }),
        ],
        [dataset({ id: 'd3', name: '数据集三' })],
      ]
      return { total: 3, datas: pages[page - 1] ?? [] } as T
    },
  } as unknown as Parameters<typeof listAllProjectDatasets>[0]

  const rows = await listAllProjectDatasets(api, 'proj_a', 2)

  assert.deepEqual(
    rows.map((row) => row.id),
    ['d1', 'd2', 'd3']
  )
  assert.deepEqual(calls, [1, 2])

  calls.length = 0
  const emptyPageApi = {
    getProjectDatasets: async <T>(options: { query?: { page?: number } }) => {
      const page = options.query?.page ?? 1
      calls.push(page)
      return {
        total: 5,
        datas: page === 1 ? [dataset({ id: 'd1', name: '数据集一' })] : [],
      } as T
    },
  } as unknown as Parameters<typeof listAllProjectDatasets>[0]

  await listAllProjectDatasets(emptyPageApi, 'proj_a', 1)
  assert.deepEqual(calls, [1, 2])
})

test('listAllProjectDatasets returns no rows after the first page reports total zero', async () => {
  const calls: number[] = []
  const api = {
    getProjectDatasets: async <T>(options: { query?: { page?: number } }) => {
      calls.push(options.query?.page ?? 1)
      return { total: 0, datas: [] } as T
    },
  } as unknown as Parameters<typeof listAllProjectDatasets>[0]

  const rows = await listAllProjectDatasets(api, 'proj_a')

  assert.deepEqual(rows, [])
  assert.deepEqual(calls, [1])
})

test('listAllProjectDatasets deduplicates overlapping pages and stops when a page adds no ids', async () => {
  const calls: number[] = []
  const api = {
    getProjectDatasets: async <T>(options: { query?: { page?: number } }) => {
      const page = options.query?.page ?? 1
      calls.push(page)
      if (page > 3) throw new Error('不应继续请求无进展后的页面')
      const pages = [
        [
          dataset({ id: 'd1', name: '数据集一' }),
          dataset({ id: 'd2', name: '数据集二' }),
        ],
        [
          dataset({ id: 'd2', name: '数据集二' }),
          dataset({ id: 'd3', name: '数据集三' }),
        ],
        [
          dataset({ id: 'd2', name: '数据集二' }),
          dataset({ id: 'd3', name: '数据集三' }),
        ],
      ]
      return { total: 100, datas: pages[page - 1] ?? [] } as T
    },
  } as unknown as Parameters<typeof listAllProjectDatasets>[0]

  const rows = await listAllProjectDatasets(api, 'proj_a', 2)

  assert.deepEqual(
    rows.map((row) => row.id),
    ['d1', 'd2', 'd3']
  )
  assert.deepEqual(calls, [1, 2, 3])
})

test('listAllDatasetExperimentReports loads every report page', async () => {
  const calls: number[] = []
  const api = {
    getDatasetExperimentReports: async <T>(options: {
      query?: { page?: number }
    }) => {
      const page = options.query?.page ?? 1
      calls.push(page)
      const pages = [
        [report({ id: 'r1', datasetId: 'd1', name: '报告一' })],
        [report({ id: 'r2', datasetId: 'd1', name: '报告二' })],
        [report({ id: 'r3', datasetId: 'd1', name: '报告三' })],
      ]
      return { total: 3, datas: pages[page - 1] ?? [] } as T
    },
  } as unknown as Parameters<typeof listAllDatasetExperimentReports>[0]

  const rows = await listAllDatasetExperimentReports(api, 'proj_a', 'd1', 1)

  assert.deepEqual(
    rows.map((row) => row.id),
    ['r1', 'r2', 'r3']
  )
  assert.deepEqual(calls, [1, 2, 3])
})

test('listAllDatasetExperimentReports returns no rows after the first page reports total zero', async () => {
  const calls: number[] = []
  const api = {
    getDatasetExperimentReports: async <T>(options: {
      query?: { page?: number }
    }) => {
      calls.push(options.query?.page ?? 1)
      return { total: 0, datas: [] } as T
    },
  } as unknown as Parameters<typeof listAllDatasetExperimentReports>[0]

  const rows = await listAllDatasetExperimentReports(api, 'proj_a', 'd1')

  assert.deepEqual(rows, [])
  assert.deepEqual(calls, [1])
})

test('listAllDatasetExperimentReports stops when the next page is empty before total is reached', async () => {
  const calls: number[] = []
  const api = {
    getDatasetExperimentReports: async <T>(options: {
      query?: { page?: number }
    }) => {
      const page = options.query?.page ?? 1
      calls.push(page)
      return {
        total: 5,
        datas:
          page === 1
            ? [report({ id: 'r1', datasetId: 'd1', name: '报告一' })]
            : [],
      } as T
    },
  } as unknown as Parameters<typeof listAllDatasetExperimentReports>[0]

  const rows = await listAllDatasetExperimentReports(api, 'proj_a', 'd1', 1)

  assert.deepEqual(
    rows.map((row) => row.id),
    ['r1']
  )
  assert.deepEqual(calls, [1, 2])
})

test('listAllDatasetExperimentReports deduplicates overlapping pages and stops when a page adds no ids', async () => {
  const calls: number[] = []
  const api = {
    getDatasetExperimentReports: async <T>(options: {
      query?: { page?: number }
    }) => {
      const page = options.query?.page ?? 1
      calls.push(page)
      if (page > 3) throw new Error('不应继续请求无进展后的页面')
      const pages = [
        [
          report({ id: 'r1', datasetId: 'd1', name: '报告一' }),
          report({ id: 'r2', datasetId: 'd1', name: '报告二' }),
        ],
        [
          report({ id: 'r2', datasetId: 'd1', name: '报告二' }),
          report({ id: 'r3', datasetId: 'd1', name: '报告三' }),
        ],
        [
          report({ id: 'r2', datasetId: 'd1', name: '报告二' }),
          report({ id: 'r3', datasetId: 'd1', name: '报告三' }),
        ],
      ]
      return { total: 100, datas: pages[page - 1] ?? [] } as T
    },
  } as unknown as Parameters<typeof listAllDatasetExperimentReports>[0]

  const rows = await listAllDatasetExperimentReports(api, 'proj_a', 'd1', 2)

  assert.deepEqual(
    rows.map((row) => row.id),
    ['r1', 'r2', 'r3']
  )
  assert.deepEqual(calls, [1, 2, 3])
})

test('listAllMatchingDatasetExperimentReports preserves selection query while paging safely', async () => {
  const module =
    (await import('../../modules/scene-experiments/api/scene-experiment-api.ts')) as Record<
      string,
      unknown
    >
  const listAllMatchingDatasetExperimentReports =
    module.listAllMatchingDatasetExperimentReports as
      | ((
          api: Parameters<typeof listAllDatasetExperimentReports>[0],
          projectId: string,
          datasetId: string,
          queryState: DataTableQueryState,
          totalRowCount: number,
          pageSize?: number
        ) => Promise<ExperimentReport[]>)
      | undefined

  assert.equal(typeof listAllMatchingDatasetExperimentReports, 'function')
  const calls: Array<{ page?: number; pageSize?: number; keyword?: string }> =
    []
  const api = {
    getDatasetExperimentReports: async <T>(options: {
      query?: { page?: number; pageSize?: number; keyword?: string }
    }) => {
      calls.push(options.query ?? {})
      const page = options.query?.page ?? 1
      const pages = [
        [
          report({ id: 'r1', datasetId: 'd1', name: '匹配一' }),
          report({ id: 'r2', datasetId: 'd1', name: '匹配二' }),
        ],
        [report({ id: 'r3', datasetId: 'd1', name: '匹配三' })],
      ]
      return { total: 3, datas: pages[page - 1] ?? [] } as T
    },
  } as unknown as Parameters<typeof listAllDatasetExperimentReports>[0]

  const rows = await listAllMatchingDatasetExperimentReports!(
    api,
    'proj_a',
    'd1',
    query({ keyword: '匹配', page: 2, pageSize: 1 }),
    3,
    2
  )

  assert.deepEqual(
    rows.map((row) => row.id),
    ['r1', 'r2', 'r3']
  )
  assert.deepEqual(calls, [
    { page: 1, pageSize: 2, keyword: '匹配' },
    { page: 2, pageSize: 2, keyword: '匹配' },
  ])
})

test('selection resolver loads all matching rows and keeps completed reports only', async () => {
  const module =
    (await import('../../modules/scene-experiments/lib/project-experiment-reports.ts')) as Record<
      string,
      unknown
    >
  const resolveSelection = module.resolveExperimentReportSelection as
    | ((input: {
        selectedReports: ExperimentReport[]
        selection: {
          isAllMatchingRowsSelected: boolean
          totalRowCount: number
          queryState: DataTableQueryState
        }
        loadAllMatching: (
          queryState: DataTableQueryState,
          totalRowCount: number
        ) => Promise<ExperimentReport[]>
      }) => Promise<ExperimentReport[]>)
    | undefined

  assert.equal(typeof resolveSelection, 'function')
  const loadedQueries: DataTableQueryState[] = []
  const rows = await resolveSelection!({
    selectedReports: [
      report({ id: 'current', datasetId: 'd1', name: '当前页' }),
    ],
    selection: {
      isAllMatchingRowsSelected: true,
      totalRowCount: 3,
      queryState: query({ keyword: '回归' }),
    },
    loadAllMatching: async (queryState, totalRowCount) => {
      loadedQueries.push(queryState)
      assert.equal(totalRowCount, 3)
      return [
        report({ id: 'completed-a', datasetId: 'd1', name: '完成一' }),
        report({
          id: 'running',
          datasetId: 'd1',
          name: '运行中',
          status: 'RUNNING',
        }),
        report({ id: 'completed-b', datasetId: 'd1', name: '完成二' }),
      ]
    },
  })

  assert.deepEqual(
    rows.map((row) => row.id),
    ['completed-a', 'completed-b']
  )
  assert.equal(loadedQueries[0]?.keyword, '回归')
})

test('selection resolver uses explicit selected rows without loading all matches', async () => {
  const module =
    (await import('../../modules/scene-experiments/lib/project-experiment-reports.ts')) as Record<
      string,
      unknown
    >
  const resolveSelection = module.resolveExperimentReportSelection as
    | ((input: {
        selectedReports: ExperimentReport[]
        selection: {
          isAllMatchingRowsSelected: boolean
          totalRowCount: number
          queryState: DataTableQueryState
        }
        loadAllMatching: () => Promise<ExperimentReport[]>
      }) => Promise<ExperimentReport[]>)
    | undefined

  assert.equal(typeof resolveSelection, 'function')
  let loadCount = 0
  const rows = await resolveSelection!({
    selectedReports: [
      report({ id: 'completed', datasetId: 'd1', name: '完成' }),
      report({
        id: 'failed',
        datasetId: 'd1',
        name: '失败',
        status: 'FAILED',
      }),
    ],
    selection: {
      isAllMatchingRowsSelected: false,
      totalRowCount: 2,
      queryState: query(),
    },
    loadAllMatching: async () => {
      loadCount += 1
      return []
    },
  })

  assert.deepEqual(
    rows.map((row) => row.id),
    ['completed']
  )
  assert.equal(loadCount, 0)
})

test('project source merges metadata and preserves other datasets when reports or baselines fail', async () => {
  const source = await loadProjectExperimentSource({
    loadDatasets: async () => [
      dataset({
        id: 'dataset_a',
        name: '客服集',
        itemCount: 10,
        updatedAt: '2026-07-29T02:00:00.000Z',
      }),
      dataset({ id: 'dataset_b', name: '退款集', type: 'golden' }),
      dataset({ id: 'dataset_c', name: '投诉集', type: 'badcase' }),
      dataset({ id: 'dataset_d', name: '故障集', type: 'anomaly' }),
    ],
    loadReports: async (datasetId) => {
      if (datasetId === 'dataset_b' || datasetId === 'dataset_d') {
        throw new Error(`${datasetId} 报告加载失败`)
      }
      return [
        report({ id: `report_${datasetId}`, datasetId, name: '发布报告' }),
      ]
    },
    loadBaselines: async (datasetId) => {
      if (datasetId === 'dataset_c' || datasetId === 'dataset_d') {
        throw new Error(`${datasetId} 基线加载失败`)
      }
      return [
        baseline({
          id: `baseline_${datasetId}`,
          datasetId,
          reportId: `report_${datasetId}`,
        }),
      ]
    },
  })

  assert.deepEqual(
    source.datasets.map((item) => item.id),
    ['dataset_a', 'dataset_b', 'dataset_c', 'dataset_d']
  )
  assert.deepEqual(
    source.reports.map((item) => item.id),
    ['report_dataset_a', 'report_dataset_c']
  )
  assert.deepEqual(
    source.baselines.map((item) => item.id),
    ['baseline_dataset_a', 'baseline_dataset_b']
  )
  assert.deepEqual(
    {
      datasetName: source.reports[0]?.datasetName,
      datasetType: source.reports[0]?.datasetType,
      datasetItemCount: source.reports[0]?.datasetItemCount,
      datasetUpdatedAt: source.reports[0]?.datasetUpdatedAt,
    },
    {
      datasetName: '客服集',
      datasetType: 'evaluation',
      datasetItemCount: 10,
      datasetUpdatedAt: '2026-07-29T02:00:00.000Z',
    }
  )
  assert.deepEqual(source.failedDatasets, [
    {
      datasetId: 'dataset_b',
      datasetName: '退款集',
      resource: 'reports',
      message: 'dataset_b 报告加载失败',
    },
    {
      datasetId: 'dataset_c',
      datasetName: '投诉集',
      resource: 'baselines',
      message: 'dataset_c 基线加载失败',
    },
    {
      datasetId: 'dataset_d',
      datasetName: '故障集',
      resource: 'reports',
      message: 'dataset_d 报告加载失败',
    },
    {
      datasetId: 'dataset_d',
      datasetName: '故障集',
      resource: 'baselines',
      message: 'dataset_d 基线加载失败',
    },
  ])
})

test('project report query searches experiment report dataset scene and webhook names', () => {
  const target = projectReport({
    id: 'target',
    datasetId: 'd2',
    datasetName: '客服黄金集',
    experimentName: '季度验收',
    name: '发布报告',
    sceneSnapshot: {
      ...report({ id: 'base', datasetId: 'd2', name: 'base' }).sceneSnapshot,
      name: '退费场景',
    },
    webhookSnapshot: {
      ...report({ id: 'base', datasetId: 'd2', name: 'base' }).webhookSnapshot,
      name: 'Refund Webhook',
    },
  })
  const other = projectReport({
    id: 'other',
    datasetId: 'd1',
    datasetName: '普通集',
    experimentName: '日常回归',
    name: '旧报告',
  })

  for (const keyword of [
    '季度验收',
    '发布报告',
    '客服黄金集',
    '退费场景',
    'refund webhook',
  ]) {
    const result = queryProjectExperimentReports(
      [other, target],
      query({ keyword })
    )
    assert.deepEqual(
      result.datas.map((row) => row.id),
      ['target'],
      keyword
    )
  }
})

test('project report query filters by dataset and status', () => {
  const rows = [
    projectReport({
      id: 'r1',
      datasetId: 'd1',
      datasetName: '数据集一',
      name: 'A',
    }),
    projectReport({
      id: 'r2',
      datasetId: 'd2',
      datasetName: '数据集二',
      name: 'B',
      status: 'RUNNING',
    }),
    projectReport({
      id: 'r3',
      datasetId: 'd2',
      datasetName: '数据集二',
      name: 'C',
      status: 'FAILED',
    }),
  ]

  const result = queryProjectExperimentReports(
    rows,
    query({ filters: { datasetId: ['d2'], status: ['RUNNING'] } })
  )

  assert.equal(result.total, 1)
  assert.deepEqual(
    result.datas.map((row) => row.id),
    ['r2']
  )
})

test('project report query supports stable table sorting and pagination', () => {
  const rows = [
    projectReport({
      id: 'r1',
      datasetId: 'd1',
      datasetName: 'Zulu',
      name: 'Beta',
      createdAt: '2026-07-29T01:00:00.000Z',
      completedAt: '2026-07-29T04:00:00.000Z',
    }),
    projectReport({
      id: 'r2',
      datasetId: 'd2',
      datasetName: 'Yankee',
      name: 'Alpha',
      createdAt: '2026-07-29T03:00:00.000Z',
      completedAt: '2026-07-29T02:00:00.000Z',
    }),
    projectReport({
      id: 'r3',
      datasetId: 'd3',
      datasetName: 'Xray',
      name: 'Alpha',
      createdAt: '2026-07-29T02:00:00.000Z',
      completedAt: '2026-07-29T03:00:00.000Z',
    }),
  ]

  const cases = [
    { id: 'createdAt', desc: true, expected: ['r2', 'r3', 'r1'] },
    { id: 'completedAt', desc: false, expected: ['r2', 'r3', 'r1'] },
    { id: 'name', desc: false, expected: ['r2', 'r3', 'r1'] },
    { id: 'datasetName', desc: false, expected: ['r3', 'r2', 'r1'] },
  ]

  for (const sorting of cases) {
    const result = queryProjectExperimentReports(
      rows,
      query({ sorting: [{ id: sorting.id, desc: sorting.desc }] })
    )
    assert.deepEqual(
      result.datas.map((row) => row.id),
      sorting.expected,
      sorting.id
    )
  }

  const defaultSortedPage = queryProjectExperimentReports(
    rows,
    query({ page: 2, pageSize: 1 })
  )
  assert.equal(defaultSortedPage.total, 3)
  assert.deepEqual(
    defaultSortedPage.datas.map((row) => row.id),
    ['r3']
  )
})

test('project report query keeps invalid and missing dates stable around valid dates', () => {
  const rows = [
    projectReport({
      id: 'invalid',
      datasetId: 'd1',
      datasetName: '数据集一',
      name: '无效日期',
      completedAt: 'not-a-date',
    }),
    projectReport({
      id: 'missing',
      datasetId: 'd2',
      datasetName: '数据集二',
      name: '缺失日期',
      completedAt: undefined,
    }),
    projectReport({
      id: 'valid',
      datasetId: 'd3',
      datasetName: '数据集三',
      name: '有效日期',
      completedAt: '2026-07-29T05:00:00.000Z',
    }),
  ]

  const ascending = queryProjectExperimentReports(
    rows,
    query({ sorting: [{ id: 'completedAt', desc: false }] })
  )
  const descending = queryProjectExperimentReports(
    rows,
    query({ sorting: [{ id: 'completedAt', desc: true }] })
  )

  assert.deepEqual(
    ascending.datas.map((row) => row.id),
    ['invalid', 'missing', 'valid']
  )
  assert.deepEqual(
    descending.datas.map((row) => row.id),
    ['valid', 'invalid', 'missing']
  )
})
