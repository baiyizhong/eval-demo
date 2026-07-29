import {
  scheduledJobMockEvaluators,
  scheduledJobMockLogs,
  scheduledJobMockTasks,
} from '../src/modules/scheduled-jobs/mock-data.ts'
import {
  calculateNextRunAt,
  createExecutionLog,
} from '../src/modules/scheduled-jobs/mock-store.ts'
import type {
  ScheduledJobExecutionLog,
  ScheduledJobTask,
} from '../src/modules/scheduled-jobs/types.ts'
import {
  body,
  clone,
  failure,
  id,
  keywordIncludes,
  nowIso,
  paginate,
  pathParam,
  success,
} from './_utils.ts'

const tasksByProject = new Map<string, ScheduledJobTask[]>()
const logsByProject = new Map<string, ScheduledJobExecutionLog[]>()

const projectId = (req: any) => pathParam(req, 'projectId')
const jobId = (req: any) => pathParam(req, 'jobId')

const queryValues = (value: unknown) => {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string' && value) return [value]
  return []
}

function getTasks(project: string) {
  if (!tasksByProject.has(project)) {
    tasksByProject.set(
      project,
      clone(scheduledJobMockTasks).map((task) => ({ ...task, projectId: project }))
    )
  }

  return tasksByProject.get(project) ?? []
}

function getLogs(project: string) {
  if (!logsByProject.has(project)) {
    logsByProject.set(
      project,
      clone(scheduledJobMockLogs).map((log) => ({
        ...log,
        projectId: project,
        autoEvaluationTaskPath: `/projects/${project}/evaluation/auto-evaluations/${log.taskId}`,
        evaluationReportPath: `/projects/${project}/evaluation/reports/${log.taskId}`,
      }))
    )
  }

  return logsByProject.get(project) ?? []
}

function findTask(req: any) {
  return getTasks(projectId(req)).find((task) => task.id === jobId(req))
}

function taskFromInput(req: any, current?: ScheduledJobTask): ScheduledJobTask {
  const input = body(req)
  const project = projectId(req)
  const timestamp = nowIso()
  const evaluator =
    scheduledJobMockEvaluators.find((item) => item.id === input.evaluatorId) ??
    current?.evaluator ??
    scheduledJobMockEvaluators[0]
  const frequency = input.frequency ?? current?.frequency ?? {
    kind: 'DAILY',
    timeOfDay: '01:00',
  }

  return {
    ...current,
    id: current?.id ?? id('pajob'),
    projectId: project,
    type: input.taskType ?? current?.type ?? 'AUTO_EVALUATION',
    binding:
      input.binding ??
      current?.binding ?? {
        type: input.taskType ?? 'AUTO_EVALUATION',
        targetId: '',
        targetName: '',
        targetDescription: '',
      },
    name: input.name ?? current?.name ?? '未命名定时任务',
    description: input.description ?? current?.description ?? '',
    scoreName: input.scoreName ?? current?.scoreName ?? 'accuracy',
    scoreMapping: input.scoreMapping ?? current?.scoreMapping,
    runMode: input.runMode ?? current?.runMode ?? 'RECURRING',
    frequency,
    status: current?.status ?? 'RUNNING',
    dataSource: input.dataSource ?? current?.dataSource,
    evaluator,
    variableMapping: input.variableMapping ?? current?.variableMapping ?? {},
    reportTemplateId:
      input.reportTemplateId ?? current?.reportTemplateId ?? '',
    sampleRate: input.sampleRate ?? current?.sampleRate ?? 100,
    badcase: input.badcase ?? current?.badcase ?? { enabled: false, threshold: null },
    nextRunAt: calculateNextRunAt(frequency),
    lastRunAt: current?.lastRunAt ?? null,
    createdBy: current?.createdBy ?? '测试用户',
    createdAt: current?.createdAt ?? timestamp,
    updatedAt: timestamp,
  } as ScheduledJobTask
}

function setTaskStatus(req: any, status: ScheduledJobTask['status']) {
  const task = findTask(req)
  if (!task) return failure(404, '定时任务不存在')

  task.status = status
  task.updatedAt = nowIso()
  task.nextRunAt = status === 'PAUSED' ? null : calculateNextRunAt(task.frequency)
  return success(task)
}

function runTask(req: any, triggerType: 'MANUAL' | 'JOB') {
  const task = findTask(req)
  if (!task) return failure(404, '定时任务不存在')

  const timestamp = new Date()
  task.lastRunAt = timestamp.toISOString()
  task.updatedAt = timestamp.toISOString()
  if (task.type === 'AUTO_EVALUATION') {
    getLogs(task.projectId).unshift(
      createExecutionLog(task, triggerType, { now: timestamp })
    )
  }
  return success({ id: task.id, status: 'RUNNING' })
}

export default [
  {
    url: '/api/projects/:projectId/scheduled-job-logs',
    method: 'get',
    response: (req: any) => {
      const statuses = queryValues(req.query?.status)
      const triggerTypes = queryValues(req.query?.triggerType)
      const rows = getLogs(projectId(req))
        .filter((log) => keywordIncludes(log, req.query?.keyword))
        .filter((log) => statuses.length === 0 || statuses.includes(log.status))
        .filter(
          (log) =>
            triggerTypes.length === 0 || triggerTypes.includes(log.triggerType)
        )

      return success(paginate(rows, req.query))
    },
  },
  {
    url: '/api/projects/:projectId/scheduled-jobs',
    method: 'get',
    response: (req: any) => {
      const statuses = queryValues(req.query?.status)
      const rows = getTasks(projectId(req))
        .filter((task) => keywordIncludes(task, req.query?.keyword))
        .filter(
          (task) => statuses.length === 0 || statuses.includes(task.status)
        )

      return success(paginate(rows, req.query))
    },
  },
  {
    url: '/api/projects/:projectId/scheduled-jobs',
    method: 'post',
    response: (req: any) => {
      const task = taskFromInput(req)
      getTasks(projectId(req)).unshift(task)
      return success(task)
    },
  },
  {
    url: '/api/projects/:projectId/scheduled-jobs/:jobId',
    method: 'patch',
    response: (req: any) => {
      const tasks = getTasks(projectId(req))
      const index = tasks.findIndex((task) => task.id === jobId(req))
      if (index < 0) return failure(404, '定时任务不存在')

      tasks[index] = taskFromInput(req, tasks[index])
      return success(tasks[index])
    },
  },
  {
    url: '/api/projects/:projectId/scheduled-jobs/:jobId/pause',
    method: 'post',
    response: (req: any) => setTaskStatus(req, 'PAUSED'),
  },
  {
    url: '/api/projects/:projectId/scheduled-jobs/:jobId/resume',
    method: 'post',
    response: (req: any) => setTaskStatus(req, 'RUNNING'),
  },
  {
    url: '/api/projects/:projectId/scheduled-jobs/:jobId/run',
    method: 'post',
    response: (req: any) => runTask(req, 'MANUAL'),
  },
  {
    url: '/api/projects/:projectId/scheduled-jobs/:jobId/trigger',
    method: 'post',
    response: (req: any) => runTask(req, 'JOB'),
  },
  {
    url: '/api/projects/:projectId/scheduled-jobs/:jobId',
    method: 'delete',
    response: (req: any) => {
      const project = projectId(req)
      const targetId = jobId(req)
      const tasks = getTasks(project)
      const exists = tasks.some((task) => task.id === targetId)
      if (!exists) return failure(404, '定时任务不存在')

      tasksByProject.set(
        project,
        tasks.filter((task) => task.id !== targetId)
      )
      getLogs(project).forEach((log) => {
        if (log.taskId === targetId) log.taskDeleted = true
      })
      return success({ id: targetId })
    },
  },
]
