import { db as rawDb } from './_data.ts'
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
const db = rawDb as {
  datasets: any[]
  datasetItems: any[]
}
const directoryId = (req: any) => pathParam(req, 'directoryId')

const withItemCount = (dataset: any) => ({
  ...dataset,
  itemCount: db.datasetItems.filter(
    (item) => item.projectId === dataset.projectId && item.datasetId === dataset.id
  ).length,
})

const sortDirectories = (directories: any[]) =>
  [...directories].sort((left, right) => {
    if (left.parentId === right.parentId) return left.order - right.order
    return String(left.parentId ?? '').localeCompare(String(right.parentId ?? ''))
  })

const filterValidDirectories = (directories: any[]) => {
  const byId = new Map(directories.map((directory) => [directory.id, directory]))
  const validIds = new Set<string>()

  const isValid = (directory: any, visiting = new Set<string>()) => {
    if (!directory.parentId) return true
    if (validIds.has(directory.id)) return true
    if (visiting.has(directory.id)) return false
    const parent = byId.get(directory.parentId)
    if (!parent) return false

    visiting.add(directory.id)
    const valid = isValid(parent, visiting)
    visiting.delete(directory.id)
    if (valid) validIds.add(directory.id)
    return valid
  }

  return directories.filter((directory) => {
    const valid = isValid(directory)
    if (valid) validIds.add(directory.id)
    return valid
  })
}

const collectDescendantDirectoryIds = (directories: any[], rootId: string) => {
  const ids = new Set<string>([rootId])
  let changed = true

  while (changed) {
    changed = false
    for (const directory of directories) {
      if (
        directory.parentId &&
        ids.has(directory.parentId) &&
        !ids.has(directory.id)
      ) {
        ids.add(directory.id)
        changed = true
      }
    }
  }

  return ids
}

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
    url: '/api/projects/:projectId/datasets/:datasetId/items/status-counts',
    method: 'get',
    response: (req: any) => {
      const rows = db.datasetItems
        .filter(
          (item) =>
            item.projectId === projectId(req) && item.datasetId === datasetId(req)
        )
        .filter((item) => keywordIncludes(item, req.query?.keyword))

      return success({
        ACTIVE: rows.filter((item) => item.status === 'ACTIVE').length,
        ARCHIVED: rows.filter((item) => item.status === 'ARCHIVED').length,
      })
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
    url: '/api/projects/:projectId/datasets/:datasetId/item-operations',
    method: 'post',
    response: (req: any) => {
      const input = body(req)
      const sourceDatasetId = datasetId(req)
      const selection = input.selection ?? {}
      const project = projectId(req)
      const selectedItems = db.datasetItems.filter((item) => {
        if (item.projectId !== project || item.datasetId !== sourceDatasetId) {
          return false
        }
        if (selection.scope === 'filtered') {
          const matchesKeyword = keywordIncludes(item, selection.keyword)
          const statuses = Array.isArray(selection.status)
            ? selection.status
            : []
          const matchesStatus =
            statuses.length === 0 || statuses.includes(item.status)
          return matchesKeyword && matchesStatus
        }
        const itemIds = Array.isArray(selection.itemIds)
          ? selection.itemIds
          : []
        return itemIds.includes(item.id)
      })
      const affectedIds = new Set(selectedItems.map((item) => item.id))

      if (input.type === 'delete') {
        db.datasetItems = db.datasetItems.filter(
          (item) =>
            !(
              item.projectId === project &&
              item.datasetId === sourceDatasetId &&
              affectedIds.has(item.id)
            )
        )
      }

      const targetDatasetId = input.targetDatasetId

      if (input.type === 'move' && targetDatasetId) {
        db.datasetItems = db.datasetItems.map((item) =>
          affectedIds.has(item.id)
            ? {
                ...item,
                datasetId: targetDatasetId,
                updatedAt: nowIso(),
              }
            : item
        )
      }

      if (input.type === 'copy' && targetDatasetId) {
        db.datasetItems.unshift(
          ...selectedItems.map((item) => ({
            ...item,
            id: id('item'),
            datasetId: targetDatasetId,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          }))
        )
      }

      return success({
        operationId: id('dataset_item_operation'),
        type: input.type,
        affectedCount: selectedItems.length,
        status: 'SUCCEEDED',
      })
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
    url: '/api/projects/:projectId/dataset-directories',
    method: 'get',
    response: (req: any) =>
      success(
        sortDirectories(
          filterValidDirectories(
            db.datasetDirectories.filter(
              (directory) => directory.projectId === projectId(req)
            )
          )
        )
      ),
  },
  {
    url: '/api/projects/:projectId/dataset-directories',
    method: 'post',
    response: (req: any) => {
      const input = body(req)
      const siblings = db.datasetDirectories.filter(
        (directory) =>
          directory.projectId === projectId(req) &&
          (directory.parentId ?? null) === (input.parentId ?? null)
      )
      const directory = {
        id: id('dir'),
        projectId: projectId(req),
        parentId: input.parentId ?? null,
        name: String(input.name ?? '').trim() || '未命名目录',
        order: siblings.length,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      db.datasetDirectories.push(directory)
      return success(directory)
    },
  },
  {
    url: '/api/projects/:projectId/dataset-directories/order',
    method: 'patch',
    response: (req: any) => {
      const input = body(req)
      const updates = Array.isArray(input.directories) ? input.directories : []
      for (const update of updates) {
        const index = db.datasetDirectories.findIndex(
          (directory) =>
            directory.projectId === projectId(req) &&
            directory.id === update.id
        )
        if (index >= 0) {
          db.datasetDirectories[index] = {
            ...db.datasetDirectories[index],
            parentId: update.parentId ?? null,
            order: Number(update.order ?? 0),
            updatedAt: nowIso(),
          }
        }
      }
      return success(
        sortDirectories(
          filterValidDirectories(
            db.datasetDirectories.filter(
              (directory) => directory.projectId === projectId(req)
            )
          )
        )
      )
    },
  },
  {
    url: '/api/projects/:projectId/dataset-directories/:directoryId',
    method: 'patch',
    response: (req: any) => {
      const input = body(req)
      const index = db.datasetDirectories.findIndex(
        (directory) =>
          directory.projectId === projectId(req) &&
          directory.id === directoryId(req)
      )
      if (index >= 0) {
        db.datasetDirectories[index] = {
          ...db.datasetDirectories[index],
          ...('name' in input ? { name: String(input.name ?? '').trim() } : {}),
          ...('parentId' in input ? { parentId: input.parentId ?? null } : {}),
          updatedAt: nowIso(),
        }
      }
      return success(db.datasetDirectories[index] ?? { id: directoryId(req) })
    },
  },
  {
    url: '/api/projects/:projectId/dataset-directories/:directoryId',
    method: 'delete',
    response: (req: any) => {
      const ids = collectDescendantDirectoryIds(
        db.datasetDirectories.filter(
          (directory) => directory.projectId === projectId(req)
        ),
        directoryId(req)
      )
      db.datasetDirectories = db.datasetDirectories.filter(
        (directory) => !ids.has(directory.id)
      )
      db.datasets = db.datasets.map((dataset) =>
        dataset.projectId === projectId(req) && ids.has(dataset.directoryId)
          ? { ...dataset, directoryId: null, updatedAt: nowIso() }
          : dataset
      )
      return success({ id: directoryId(req) })
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
    url: '/api/projects/:projectId/datasets/:datasetId/directory',
    method: 'patch',
    response: (req: any) => {
      const input = body(req)
      const index = db.datasets.findIndex(
        (dataset) =>
          dataset.projectId === projectId(req) && dataset.id === datasetId(req)
      )
      if (index >= 0) {
        db.datasets[index] = {
          ...db.datasets[index],
          directoryId: input.directoryId ?? null,
          updatedAt: nowIso(),
        }
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
    response: (req: any) => {
      const requestedType = Array.isArray(req.query?.type)
        ? req.query.type[0]
        : req.query?.type
      return success(
        paginate(
          db.datasets
            .filter((dataset) => dataset.projectId === projectId(req))
            .filter(
              (dataset) => !requestedType || dataset.type === requestedType
            )
            .filter((dataset) => keywordIncludes(dataset, req.query?.keyword))
            .map(withItemCount),
          req.query,
          10
        )
      )
    },
  },
  {
    url: '/api/projects/:projectId/datasets',
    method: 'post',
    response: (req: any) => {
      const input = body(req)
      const dataset = {
        id: id('dataset'),
        projectId: projectId(req),
        directoryId: input.directoryId ?? null,
        name: input.name,
        description: input.description ?? '',
        type: input.type ?? 'evaluation',
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
