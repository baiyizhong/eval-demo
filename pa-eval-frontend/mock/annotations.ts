import { db } from './_data.ts'
import { body, id, keywordIncludes, nowIso, paginate, pathParam, success } from './_utils.ts'

type MockRecord = Record<string, any>

const projectId = (req: any) => pathParam(req, 'projectId')
const queueId = (req: any) => pathParam(req, 'queueId')

const hydrateQueue = (queue: any) => {
  const queueItems = db.annotationItems.filter(
    (item: MockRecord) => item.queueId === queue.id
  )
  return {
    ...queue,
    completedCount: queueItems.filter(
      (item: MockRecord) => item.status === 'COMPLETED'
    ).length,
    pendingCount: queueItems.filter(
      (item: MockRecord) => item.status !== 'COMPLETED'
    ).length,
    scoreConfigs: db.scoreConfigs.filter((item: MockRecord) =>
      queue.scoreConfigIds.includes(item.id)
    ),
    assignees: db.users.filter((user: MockRecord) =>
      queue.assigneeIds.includes(user.id)
    ),
  }
}

const hydrateAnnotationItem = (item: any) => {
  const objectId = item.objectId ?? item.traceId ?? item.id
  const objectType = item.objectType ?? 'TRACE'
  const trace = db.traces.find(
    (trace: MockRecord) =>
      trace.projectId === item.projectId &&
      (trace.traceId === objectId || trace.id === objectId)
  )

  return {
    ...item,
    objectId,
    objectType,
    completedAt: item.completedAt ?? '',
    completedBy: item.completedBy ?? null,
    source: item.source ?? {
      objectId,
      objectType,
      title: trace?.name ?? objectId,
      input: trace?.input ?? item.input ?? {},
      output: trace?.output ?? item.output ?? {},
      metadata: trace?.metadata ?? {},
      traceId: trace?.traceId ?? item.traceId ?? objectId,
      observationId: item.observationId ?? '',
      sessionId: trace?.sessionId ?? '',
      userId: trace?.userId ?? '',
      latencyMs: trace?.latency ?? 0,
      costUsd: trace?.costUsd ?? 0,
      createdAt: trace?.createdAt ?? item.createdAt ?? nowIso(),
    },
  }
}

export default [
  {
    url: '/api/projects/:projectId/score-configs/:configId/archive',
    method: 'post',
    response: (req: any) => updateScoreConfig(req, { archived: true }),
  },
  {
    url: '/api/projects/:projectId/score-configs/:configId/restore',
    method: 'post',
    response: (req: any) => updateScoreConfig(req, { archived: false }),
  },
  {
    url: '/api/projects/:projectId/score-configs/:configId',
    method: 'patch',
    response: (req: any) => updateScoreConfig(req, body(req)),
  },
  {
    url: '/api/projects/:projectId/score-configs/default',
    method: 'post',
    response: (req: any) =>
      success(
        db.scoreConfigs.find(
          (item: MockRecord) => item.projectId === projectId(req)
        ) ??
          db.scoreConfigs[0]
      ),
  },
  {
    url: '/api/projects/:projectId/score-configs',
    method: 'get',
    response: (req: any) =>
      success(
        db.scoreConfigs.filter(
          (item: MockRecord) => item.projectId === projectId(req)
        )
      ),
  },
  {
    url: '/api/projects/:projectId/score-configs',
    method: 'post',
    response: (req: any) => {
      const input = body(req)
      const config = {
        id: id('score'),
        projectId: projectId(req),
        name: input.name,
        dataType: input.dataType ?? 'NUMERIC',
        description: input.description ?? '',
        categories: input.categories ?? [],
        archived: false,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      db.scoreConfigs.unshift(config)
      return success(config)
    },
  },
  {
    url: '/api/projects/:projectId/annotation-users',
    method: 'get',
    response: () => success(db.users),
  },
  {
    url: '/api/projects/:projectId/annotation-queues/:queueId/items/:itemId/scores',
    method: 'post',
    response: (req: any) => {
      const index = db.annotationItems.findIndex(
        (item: MockRecord) =>
          item.id === pathParam(req, 'itemId') && item.queueId === queueId(req)
      )
      if (index >= 0) {
        db.annotationItems[index] = {
          ...db.annotationItems[index],
          status: 'COMPLETED',
          scores: body(req).scores ?? [],
          completedAt: nowIso(),
          completedBy: db.users[0],
          updatedAt: nowIso(),
        }
      }
      return success(
        hydrateAnnotationItem(
          db.annotationItems[index] ?? { id: pathParam(req, 'itemId') }
        )
      )
    },
  },
  {
    url: '/api/projects/:projectId/annotation-queues/:queueId/items/:itemId/dataset-items',
    method: 'post',
    response: (req: any) => {
      const input = body(req)
      const source = db.annotationItems.find(
        (item: MockRecord) => item.id === pathParam(req, 'itemId')
      )
      const datasetItem = {
        id: id('item'),
        projectId: projectId(req),
        datasetId: input.datasetId ?? db.datasets[0].id,
        status: 'ACTIVE',
        input: source?.input ?? {},
        expectedOutput: input.expectedOutput ?? {},
        metadata: { source: 'annotation' },
        sourceTraceId: source?.traceId ?? '',
        sourceObservationId: '',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      db.datasetItems.unshift(datasetItem)
      return success(datasetItem)
    },
  },
  {
    url: '/api/projects/:projectId/annotation-queues/:queueId/items/:itemId',
    method: 'get',
    response: (req: any) =>
      success(
        hydrateAnnotationItem(
          db.annotationItems.find(
            (item: MockRecord) =>
              item.id === pathParam(req, 'itemId') &&
              item.queueId === queueId(req)
          ) ?? db.annotationItems[0]
        )
      ),
  },
  {
    url: '/api/projects/:projectId/annotation-queues/:queueId/batch-preview',
    method: 'post',
    response: (req: any) =>
      success({
        total: (body(req).itemIds ?? []).length,
        datas: (body(req).itemIds ?? []).map((itemId: string) => ({ itemId, scores: [] })),
      }),
  },
  {
    url: '/api/projects/:projectId/annotation-queues/:queueId/batch-scores',
    method: 'post',
    response: (req: any) =>
      success({
        successCount: (body(req).itemIds ?? []).length,
        failureCount: 0,
        failures: [],
      }),
  },
  {
    url: '/api/projects/:projectId/annotation-queues/:queueId/metrics',
    method: 'get',
    response: (req: any) => {
      const rows = db.annotationItems.filter(
        (item: MockRecord) => item.queueId === queueId(req)
      )
      const completed = rows.filter(
        (item: MockRecord) => item.status === 'COMPLETED'
      ).length
      return success({
        total: rows.length,
        completed,
        pending: rows.length - completed,
        completionRate: rows.length ? Math.round((completed / rows.length) * 100) : 0,
        updatedAt: nowIso(),
      })
    },
  },
  {
    url: '/api/projects/:projectId/annotation-queues/:queueId/items',
    method: 'get',
    response: (req: any) =>
      success(
        paginate(
          db.annotationItems
            .filter(
              (item: MockRecord) =>
                item.projectId === projectId(req) && item.queueId === queueId(req)
            )
            .map(hydrateAnnotationItem)
            .filter((item: MockRecord) => keywordIncludes(item, req.query?.keyword)),
          req.query,
          20
        )
      ),
  },
  {
    url: '/api/projects/:projectId/annotation-queues/:queueId/items',
    method: 'post',
    response: (req: any) => {
      const input = body(req)
      const item = {
        id: id('ann_item'),
        projectId: projectId(req),
        queueId: queueId(req),
        objectId: input.objectId ?? input.traceId ?? '',
        objectType: input.objectType ?? 'TRACE',
        status: 'PENDING',
        traceId: input.traceId ?? '',
        input: input.input ?? {},
        output: input.output ?? {},
        scores: [],
        completedAt: '',
        completedBy: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      db.annotationItems.unshift(item)
      return success(hydrateAnnotationItem(item))
    },
  },
  {
    url: '/api/projects/:projectId/annotation-queues/:queueId/items',
    method: 'delete',
    response: (req: any) => {
      const itemIds = body(req).itemIds ?? body(req).ids ?? []
      db.annotationItems = db.annotationItems.filter(
        (item: MockRecord) => !itemIds.includes(item.id)
      )
      return success({ ids: itemIds })
    },
  },
  {
    url: '/api/projects/:projectId/annotation-queues/:queueId',
    method: 'get',
    response: (req: any) =>
      success(
        hydrateQueue(
          db.annotationQueues.find(
            (queue: MockRecord) =>
              queue.projectId === projectId(req) && queue.id === queueId(req)
          ) ?? db.annotationQueues[0]
        )
      ),
  },
  {
    url: '/api/projects/:projectId/annotation-queues/:queueId',
    method: 'patch',
    response: (req: any) => {
      const index = db.annotationQueues.findIndex(
        (queue: MockRecord) => queue.id === queueId(req)
      )
      if (index >= 0) {
        db.annotationQueues[index] = {
          ...db.annotationQueues[index],
          ...body(req),
          updatedAt: nowIso(),
        }
      }
      return success(hydrateQueue(db.annotationQueues[index] ?? db.annotationQueues[0]))
    },
  },
  {
    url: '/api/projects/:projectId/annotation-queues/:queueId',
    method: 'delete',
    response: (req: any) => {
      const qid = queueId(req)
      db.annotationQueues = db.annotationQueues.filter(
        (queue: MockRecord) => queue.id !== qid
      )
      db.annotationItems = db.annotationItems.filter(
        (item: MockRecord) => item.queueId !== qid
      )
      return success({ id: qid })
    },
  },
  {
    url: '/api/projects/:projectId/annotation-queues',
    method: 'get',
    response: (req: any) =>
      success(
        paginate(
          db.annotationQueues
            .filter((queue: MockRecord) => queue.projectId === projectId(req))
            .filter((queue: MockRecord) =>
              keywordIncludes(queue, req.query?.keyword)
            )
            .map(hydrateQueue),
          req.query,
          10
        )
      ),
  },
  {
    url: '/api/projects/:projectId/annotation-queues',
    method: 'post',
    response: (req: any) => {
      const input = body(req)
      const queue = {
        id: id('queue'),
        projectId: projectId(req),
        name: input.name,
        description: input.description ?? '',
        scoreConfigIds: input.scoreConfigIds ?? [],
        assigneeIds: input.assigneeIds ?? [],
        completedCount: 0,
        pendingCount: 0,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      db.annotationQueues.unshift(queue)
      return success(hydrateQueue(queue))
    },
  },
]

function updateScoreConfig(req: any, patch: Record<string, any>) {
  const index = db.scoreConfigs.findIndex(
    (item: MockRecord) =>
      item.id === pathParam(req, 'configId') && item.projectId === projectId(req)
  )
  if (index >= 0) {
    db.scoreConfigs[index] = { ...db.scoreConfigs[index], ...patch, updatedAt: nowIso() }
  }
  return success(db.scoreConfigs[index] ?? { id: pathParam(req, 'configId') })
}
