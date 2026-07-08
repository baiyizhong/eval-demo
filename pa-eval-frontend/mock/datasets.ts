import { db } from './_data.ts'
import {
  body,
  id,
  keywordIncludes,
  nowIso,
  paginate,
  pathParam,
  success,
} from './_utils.ts'

const projectId = (req: any) => pathParam(req, 'projectId')
const datasetId = (req: any) => pathParam(req, 'datasetId')

const withItemCount = (dataset: any) => ({
  ...dataset,
  itemCount: db.datasetItems.filter(
    (item) => item.projectId === dataset.projectId && item.datasetId === dataset.id
  ).length,
})

export default [
  {
    url: '/api/projects/:projectId/datasets/:datasetId/export-jobs/:jobId',
    method: 'get',
    response: (req: any) =>
      success({
        id: pathParam(req, 'jobId'),
        projectId: projectId(req),
        datasetId: datasetId(req),
        status: 'COMPLETED',
        fileName: 'mock-dataset-export.json',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }),
  },
  {
    url: '/api/projects/:projectId/datasets/:datasetId/export-jobs',
    method: 'post',
    response: (req: any) =>
      success({
        id: id('export_job'),
        projectId: projectId(req),
        datasetId: datasetId(req),
        status: 'COMPLETED',
        fileName: 'mock-dataset-export.json',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }),
  },
  {
    url: '/api/projects/:projectId/datasets/:datasetId/items/:itemId/archive',
    method: 'post',
    response: (req: any) => {
      const index = db.datasetItems.findIndex(
        (item) => item.id === pathParam(req, 'itemId') && item.datasetId === datasetId(req)
      )
      if (index >= 0) {
        db.datasetItems[index] = {
          ...db.datasetItems[index],
          status: 'ARCHIVED',
          updatedAt: nowIso(),
        }
      }
      return success(db.datasetItems[index] ?? { id: pathParam(req, 'itemId') })
    },
  },
  {
    url: '/api/projects/:projectId/datasets/:datasetId/items/:itemId',
    method: 'patch',
    response: (req: any) => {
      const index = db.datasetItems.findIndex(
        (item) => item.id === pathParam(req, 'itemId') && item.datasetId === datasetId(req)
      )
      if (index >= 0) {
        db.datasetItems[index] = {
          ...db.datasetItems[index],
          ...body(req),
          updatedAt: nowIso(),
        }
      }
      return success(db.datasetItems[index] ?? { id: pathParam(req, 'itemId') })
    },
  },
  {
    url: '/api/projects/:projectId/datasets/:datasetId/items',
    method: 'get',
    response: (req: any) =>
      success(
        paginate(
          db.datasetItems
            .filter(
              (item) =>
                item.projectId === projectId(req) &&
                item.datasetId === datasetId(req)
            )
            .filter((item) => keywordIncludes(item, req.query?.keyword)),
          req.query,
          20
        )
      ),
  },
  {
    url: '/api/projects/:projectId/datasets/:datasetId/items',
    method: 'post',
    response: (req: any) => {
      const input = body(req)
      const item = {
        id: id('item'),
        projectId: projectId(req),
        datasetId: datasetId(req),
        status: input.status ?? 'ACTIVE',
        input: input.input ?? {},
        expectedOutput: input.expectedOutput ?? {},
        metadata: input.metadata ?? {},
        sourceTraceId: input.sourceTraceId ?? '',
        sourceObservationId: input.sourceObservationId ?? '',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      db.datasetItems.unshift(item)
      return success(item)
    },
  },
  {
    url: '/api/projects/:projectId/datasets/:datasetId/metrics',
    method: 'get',
    response: (req: any) => {
      const rows = db.datasetItems.filter(
        (item) => item.projectId === projectId(req) && item.datasetId === datasetId(req)
      )
      return success({
        total: rows.length,
        active: rows.filter((item) => item.status === 'ACTIVE').length,
        archived: rows.filter((item) => item.status === 'ARCHIVED').length,
        updatedAt: nowIso(),
        specific: {},
      })
    },
  },
  {
    url: '/api/projects/:projectId/datasets/:datasetId',
    method: 'get',
    response: (req: any) =>
      success(
        withItemCount(
          db.datasets.find(
            (dataset) => dataset.projectId === projectId(req) && dataset.id === datasetId(req)
          ) ?? db.datasets[0]
        )
      ),
  },
  {
    url: '/api/projects/:projectId/datasets/:datasetId',
    method: 'patch',
    response: (req: any) => {
      const index = db.datasets.findIndex(
        (dataset) => dataset.projectId === projectId(req) && dataset.id === datasetId(req)
      )
      if (index >= 0) {
        db.datasets[index] = { ...db.datasets[index], ...body(req), updatedAt: nowIso() }
      }
      return success(withItemCount(db.datasets[index] ?? db.datasets[0]))
    },
  },
  {
    url: '/api/projects/:projectId/datasets/:datasetId',
    method: 'delete',
    response: (req: any) => {
      const did = datasetId(req)
      db.datasets = db.datasets.filter((dataset) => dataset.id !== did)
      db.datasetItems = db.datasetItems.filter((item) => item.datasetId !== did)
      return success({ id: did })
    },
  },
  {
    url: '/api/projects/:projectId/datasets',
    method: 'get',
    response: (req: any) =>
      success(
        paginate(
          db.datasets
            .filter((dataset) => dataset.projectId === projectId(req))
            .filter((dataset) => keywordIncludes(dataset, req.query?.keyword))
            .map(withItemCount),
          req.query,
          10
        )
      ),
  },
  {
    url: '/api/projects/:projectId/datasets',
    method: 'post',
    response: (req: any) => {
      const input = body(req)
      const dataset = {
        id: id('dataset'),
        projectId: projectId(req),
        name: input.name,
        description: input.description ?? '',
        type: input.type ?? 'EVALUATION',
        metadata: input.metadata ?? {},
        inputSchema: input.inputSchema ?? {},
        expectedOutputSchema: input.expectedOutputSchema ?? {},
        itemCount: 0,
        runCount: 0,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      db.datasets.unshift(dataset)
      return success(dataset)
    },
  },
]
