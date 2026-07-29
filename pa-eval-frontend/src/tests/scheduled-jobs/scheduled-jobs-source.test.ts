import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { buildSidebarDataFromProjects } from '../../lib/sidebar-data.ts'
import {
  scheduledJobMockAutoEvaluationTasks,
  scheduledJobMockLogs,
  scheduledJobMockTasks,
} from '../../modules/scheduled-jobs/mock-data.ts'
import {
  calculateNextRunAt,
  cloneMockTasks,
  createExecutionLog,
  formatFrequencyLabel,
  formatJobTriggeredAutoEvaluationName,
} from '../../modules/scheduled-jobs/mock-store.ts'

const routesSource = readFileSync('src/routes/sidebar-routes.tsx', 'utf8')
const iconMapSource = readFileSync('src/components/layout/icon-map.ts', 'utf8')
const apiRegistrySource = readFileSync('src/api/registry.ts', 'utf8')
const typesSource = readFileSync('src/modules/scheduled-jobs/types.ts', 'utf8')
const mockDataSource = readFileSync(
  'src/modules/scheduled-jobs/mock-data.ts',
  'utf8'
)
const pageSource = readFileSync('src/modules/scheduled-jobs/index.tsx', 'utf8')
const drawerSource = readFileSync(
  'src/modules/scheduled-jobs/components/scheduled-job-drawer.tsx',
  'utf8'
)
const taskColumnsSource = readFileSync(
  'src/modules/scheduled-jobs/components/scheduled-job-columns.tsx',
  'utf8'
)
const pageNavSource = readFileSync(
  'src/modules/scheduled-jobs/components/scheduled-jobs-page-nav.tsx',
  'utf8'
)
const experimentLogSource = readFileSync(
  'src/modules/scheduled-jobs/components/scheduled-experiment-log-columns.tsx',
  'utf8'
)
const scheduledJobsMockApiSource = readFileSync(
  'mock/scheduled-jobs.ts',
  'utf8'
)
const sceneApiSource = readFileSync(
  'src/modules/scene-experiments/api/scene-experiment-api.ts',
  'utf8'
)

test('scheduled jobs remains a project-level page', () => {
  const sidebar = buildSidebarDataFromProjects(
    [
      {
        id: 'project-real-1',
        name: '真实评测项目',
        organizationId: 'org-1',
        organizationName: '真实组织',
        description: '真实项目',
        status: 'active' as const,
        createdAt: '2026-07-02T08:00:00.000Z',
        updatedAt: '2026-07-02T09:00:00.000Z',
      },
    ],
    'project-real-1'
  )
  const item = sidebar.menuGroups[0]?.items.find(
    (candidate) => candidate.title === '定时任务'
  )

  assert.ok(item && 'url' in item)
  assert.equal(item.url, '/projects/project-real-1/scheduled-jobs')
  assert.match(routesSource, /ScheduledJobs/)
  assert.match(iconMapSource, /CalendarClock/)
})

test('scheduled job task type supports auto evaluation and experiment run', () => {
  assert.match(typesSource, /'AUTO_EVALUATION'\s*\|\s*'RUN_EXPERIMENT'/)
  assert.match(typesSource, /AUTO_EVALUATION:\s*'自动评测'/)
  assert.match(typesSource, /RUN_EXPERIMENT:\s*'运行试验'/)
  assert.match(drawerSource, /自动评测/)
  assert.match(drawerSource, /运行试验/)
  assert.match(drawerSource, /RadioGroup/)
})

test('scheduled job drawer uses conditional binding step and schedule step', () => {
  assert.match(drawerSource, /基础信息/)
  assert.match(drawerSource, /绑定自动评测任务/)
  assert.match(drawerSource, /绑定运行场景/)
  assert.match(drawerSource, /调度配置/)
  assert.match(drawerSource, /form\.type === 'AUTO_EVALUATION'/)
  assert.match(drawerSource, /setBindingKeyword\(''\)/)
  assert.match(drawerSource, /boundTargetId:\s*''/)
  assert.doesNotMatch(drawerSource, /自动评测配置/)
  assert.doesNotMatch(drawerSource, /countProjectTraces/)
})

test('auto evaluation binding only shows tasks supporting scheduled execution', () => {
  assert.match(typesSource, /supportsScheduledExecution:\s*boolean/)
  assert.match(mockDataSource, /scheduledJobMockAutoEvaluationTasks/)
  assert.match(drawerSource, /task\.supportsScheduledExecution/)
  assert.match(drawerSource, /搜索自动评测任务/)
  assert.match(drawerSource, /自动评测任务概览/)
  assert.match(drawerSource, /数据来源/)
  assert.match(drawerSource, /采样比例/)

  const supported = scheduledJobMockAutoEvaluationTasks.filter(
    (task) => task.supportsScheduledExecution
  )
  assert.ok(supported.length > 0)
  assert.ok(supported.length < scheduledJobMockAutoEvaluationTasks.length)
})

test('experiment binding loads active scenes in current project', () => {
  assert.match(sceneApiSource, /listAvailableScenes/)
  assert.match(sceneApiSource, /enabled:\s*true/)
  assert.match(pageSource, /listAvailableScenes\(\$api, projectId\)/)
  assert.match(pageSource, /scenesQuery/)
  assert.match(drawerSource, /scene\.projectId === projectId/)
  assert.match(drawerSource, /scene\.enabled/)
  assert.match(drawerSource, /搜索运行场景/)
  assert.match(drawerSource, /运行场景概览/)
  assert.match(drawerSource, /Webhook 服务/)
  assert.match(drawerSource, /运行参数/)
})

test('binding selection is searchable, single-select, and persisted in prototype task', () => {
  assert.match(drawerSource, /bindingKeyword/)
  assert.match(drawerSource, /filteredAutoEvaluationTasks/)
  assert.match(drawerSource, /filteredScenes/)
  assert.match(drawerSource, /RadioGroupItem/)
  assert.match(typesSource, /binding:\s*ScheduledJobBinding/)
  assert.match(drawerSource, /binding:/)
  assert.match(taskColumnsSource, /binding\.targetName/)
})

test('scheduled job prototype does not add new backend endpoints', () => {
  assert.doesNotMatch(apiRegistrySource, /getSchedulableAutoEvaluationTasks/)
  assert.doesNotMatch(apiRegistrySource, /bindScheduledJobTarget/)
  assert.doesNotMatch(apiRegistrySource, /getSchedulableScenes/)
})

test('scheduled jobs exposes separate auto evaluation and experiment logs', () => {
  assert.match(pageNavSource, /自动评测执行日志/)
  assert.match(pageNavSource, /运行试验执行日志/)
  assert.match(pageSource, /auto-evaluation-logs/)
  assert.match(pageSource, /experiment-logs/)
  assert.match(pageSource, /ScheduledExperimentLogTable/)
  assert.match(experimentLogSource, /任务调度时间/)
  assert.match(experimentLogSource, /运行场景/)
  assert.match(experimentLogSource, /执行试验/)
  assert.match(experimentLogSource, /关联试验报告/)
  assert.match(experimentLogSource, /experimentReportPath/)
  assert.match(mockDataSource, /scheduledExperimentMockLogs/)
})

test('experiment runs do not write into auto evaluation execution logs', () => {
  assert.match(
    scheduledJobsMockApiSource,
    /if \(task\.type === 'AUTO_EVALUATION'\) \{[\s\S]*?getLogs\(task\.projectId\)\.unshift/
  )
})

test('scheduled jobs mock data includes both task types and binding snapshots', () => {
  assert.ok(
    scheduledJobMockTasks.some((task) => task.type === 'AUTO_EVALUATION')
  )
  assert.ok(
    scheduledJobMockTasks.some((task) => task.type === 'RUN_EXPERIMENT')
  )
  assert.ok(scheduledJobMockTasks.every((task) => task.binding.targetId))
  assert.ok(scheduledJobMockLogs.length > 0)
})

test('scheduled job mock helpers preserve existing scheduling behavior', () => {
  assert.equal(
    formatJobTriggeredAutoEvaluationName(
      'xxxx',
      new Date('2026-07-09T01:00:00+08:00')
    ),
    '【JOB触发】xxxx-202607090100'
  )
  assert.equal(
    calculateNextRunAt(
      { kind: 'EVERY_MINUTES', intervalMinutes: 30 },
      new Date('2026-07-09T01:00:00+08:00')
    ),
    '2026-07-08T17:30:00.000Z'
  )
  assert.equal(
    formatFrequencyLabel({ kind: 'DAILY', timeOfDay: '09:30' }),
    '每天 09:30'
  )

  const tasks = cloneMockTasks('project_3da8d83d6d3d4b5d923a5f1466a4ad3c')
  const firstTask = tasks[0]
  assert.ok(firstTask)
  const log = createExecutionLog(firstTask, 'JOB', {
    id: 'pajoblog_test',
    now: new Date('2026-07-09T01:00:00+08:00'),
  })
  assert.equal(log.id, 'pajoblog_test')
  assert.equal(log.taskType, firstTask.type)
})
