import { db } from './_data.ts'
import { body, id, keywordIncludes, nowIso, paginate, pathParam, success } from './_utils.ts'

const projectId = (req: any) => pathParam(req, 'projectId')
const taskId = (req: any) => pathParam(req, 'taskId')
const queryValues = (value: unknown) => {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string' && value) return [value]
  return []
}

export default [
  {
    url: '/api/projects/:projectId/auto-evaluations/:taskId/latest-report',
    method: 'get',
    response: (req: any) => {
      const task = db.autoEvaluationTasks.find((item) => item.id === taskId(req))
      return success(task?.latestReport ?? null)
    },
  },
  {
    url: '/api/projects/:projectId/auto-evaluations/:taskId/runs',
    method: 'get',
    response: (req: any) =>
      success(
        db.autoEvaluationRuns.filter(
          (run) => run.projectId === projectId(req) && run.taskId === taskId(req)
        )
      ),
  },
  {
    url: '/api/projects/:projectId/auto-evaluations/:taskId/rerun',
    method: 'post',
    response: (req: any) => {
      const index = db.autoEvaluationTasks.findIndex((item) => item.id === taskId(req))
      if (index >= 0) {
        db.autoEvaluationTasks[index] = {
          ...db.autoEvaluationTasks[index],
          status: 'RUNNING',
          lastRunAt: nowIso(),
          updatedAt: nowIso(),
        }
      }
      return success(db.autoEvaluationTasks[index] ?? { id: taskId(req) })
    },
  },
  {
    url: '/api/projects/:projectId/auto-evaluations/:taskId',
    method: 'get',
    response: (req: any) =>
      success(
        db.autoEvaluationTasks.find(
          (task) => task.projectId === projectId(req) && task.id === taskId(req)
        ) ?? db.autoEvaluationTasks[0]
      ),
  },
  {
    url: '/api/projects/:projectId/auto-evaluations/:taskId',
    method: 'delete',
    response: (req: any) => {
      const tid = taskId(req)
      db.autoEvaluationTasks = db.autoEvaluationTasks.filter((task) => task.id !== tid)
      return success({ id: tid })
    },
  },
  {
    url: '/api/projects/:projectId/auto-evaluations/summary',
    method: 'get',
    response: (req: any) => {
      const rows = db.autoEvaluationTasks.filter((task) => task.projectId === projectId(req))
      return success({
        total: rows.length,
        running: rows.filter((task) => task.status === 'RUNNING').length,
        completed: rows.filter((task) => task.status === 'COMPLETED').length,
        failed: rows.filter((task) => task.status === 'FAILED').length,
        notStarted: rows.filter((task) => ['DRAFT', 'READY'].includes(task.status)).length,
        badcase: rows.reduce((sum, task) => sum + (task.badcaseCount ?? 0), 0),
      })
    },
  },
  {
    url: '/api/projects/:projectId/auto-evaluations',
    method: 'get',
    response: (req: any) =>
      success(
        paginate(
          db.autoEvaluationTasks
            .filter((task) => task.projectId === projectId(req))
            .filter((task) => keywordIncludes(task, req.query?.keyword))
            .filter((task) => {
              const status = queryValues(req.query?.status)
              return status.length === 0 || status.includes(task.status)
            }),
          req.query,
          10
        )
      ),
  },
  {
    url: '/api/projects/:projectId/auto-evaluations',
    method: 'post',
    response: (req: any) => {
      const input = body(req)
      const evaluator = db.evaluators.find((item) => item.id === input.evaluatorId) ?? db.evaluators[0]
      const task = {
        id: id('auto_eval'),
        projectId: projectId(req),
        name: input.name,
        description: input.description ?? '',
        scoreName: input.scoreName ?? 'accuracy',
        status: input.runNow ? 'RUNNING' : 'READY',
        evaluator: {
          id: evaluator.id,
          name: evaluator.name,
          type: evaluator.type,
          version: evaluator.version,
        },
        dataSource: { type: 'DATASET', name: '客服问答数据集', sampleCount: 2 },
        sampleRate: input.sampleRate ?? 100,
        executionStats: { pending: 2, running: 0, completed: 0, failed: 0, cancelled: 0 },
        badcaseCount: 0,
        latestReport: null,
        createdBy: db.users[0].name,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        lastRunAt: input.runNow ? nowIso() : '',
      }
      db.autoEvaluationTasks.unshift(task)
      return success(task)
    },
  },
]
