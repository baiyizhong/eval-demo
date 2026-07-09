import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { buildSidebarDataFromProjects } from '../../lib/sidebar-data.ts'
import {
  scheduledJobMockLogs,
  scheduledJobMockTasks,
} from '../../modules/scheduled-jobs/mock-data.ts'
import {
  calculateNextRunAt,
  cloneMockTasks,
  createExecutionLog,
  formatFrequencyLabel,
  formatJobTriggeredAutoEvaluationName,
  getEffectiveSampleCount,
  shouldShowSampleWarning,
} from '../../modules/scheduled-jobs/mock-store.ts'

const routesSource = readFileSync('src/routes/index.tsx', 'utf8')
const iconMapSource = readFileSync('src/components/layout/icon-map.ts', 'utf8')
const apiRegistrySource = readFileSync('src/api/registry.ts', 'utf8')
const typesSource = readFileSync('src/modules/scheduled-jobs/types.ts', 'utf8')
const mockDataSource = readFileSync(
  'src/modules/scheduled-jobs/mock-data.ts',
  'utf8'
)
const storeSource = readFileSync(
  'src/modules/scheduled-jobs/mock-store.ts',
  'utf8'
)
const pageSource = readFileSync('src/modules/scheduled-jobs/index.tsx', 'utf8')
const taskColumnsSource = readFileSync(
  'src/modules/scheduled-jobs/components/scheduled-job-columns.tsx',
  'utf8'
)
const logColumnsSource = readFileSync(
  'src/modules/scheduled-jobs/components/scheduled-job-log-columns.tsx',
  'utf8'
)
const drawerSource = readFileSync(
  'src/modules/scheduled-jobs/components/scheduled-job-drawer.tsx',
  'utf8'
)
const pageNavSource = readFileSync(
  'src/modules/scheduled-jobs/components/scheduled-jobs-page-nav.tsx',
  'utf8'
)

const projects = [
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
]

test('scheduled jobs is a project-level sidebar entry', () => {
  const sidebar = buildSidebarDataFromProjects(projects, 'project-real-1')
  const items = sidebar.menuGroups[0]?.items ?? []

  assert.deepEqual(
    items.map((item) => item.title),
    ['应用观测', '应用评测', '定时任务', '项目设置']
  )

  const scheduledJobs = items.find((item) => item.title === '定时任务')
  assert.ok(scheduledJobs && 'url' in scheduledJobs)
  assert.equal(scheduledJobs.url, '/projects/project-real-1/scheduled-jobs')
})

test('scheduled jobs route and icon are registered', () => {
  assert.match(routesSource, /ScheduledJobs/)
  assert.match(routesSource, /scheduled-jobs/)
  assert.match(iconMapSource, /CalendarClock/)
})

test('scheduled jobs page has task list and execution log tabs', () => {
  assert.match(pageNavSource, /任务列表/)
  assert.match(pageNavSource, /执行日志/)
  assert.match(pageNavSource, /创建任务/)
  assert.match(pageSource, /activeTab/)
  assert.match(pageSource, /listProjectScheduledJobs/)
  assert.match(pageSource, /listProjectScheduledJobLogs/)
  assert.match(pageSource, /useQuery/)
  assert.match(apiRegistrySource, /getScheduledJobs/)
  assert.match(apiRegistrySource, /getScheduledJobLogs/)
})

test('scheduled job tables expose required columns and actions', () => {
  assert.match(taskColumnsSource, /DataTable/)
  assert.match(logColumnsSource, /DataTable/)
  assert.match(taskColumnsSource, /任务名称/)
  assert.match(taskColumnsSource, /描述/)
  assert.match(taskColumnsSource, /任务类型/)
  assert.match(taskColumnsSource, /执行频率/)
  assert.match(taskColumnsSource, /任务状态/)
  assert.match(taskColumnsSource, /下次执行时间/)
  assert.match(taskColumnsSource, /操作/)
  assert.match(taskColumnsSource, /查看\/编辑/)
  assert.match(taskColumnsSource, /暂停/)
  assert.match(taskColumnsSource, /恢复/)
  assert.match(taskColumnsSource, /手动执行/)
  assert.match(taskColumnsSource, /模拟 JOB 触发/)
  assert.match(taskColumnsSource, /删除/)
  assert.match(logColumnsSource, /任务名称/)
  assert.match(logColumnsSource, /触发方式/)
  assert.match(logColumnsSource, /任务类型/)
  assert.match(logColumnsSource, /执行状态/)
  assert.match(logColumnsSource, /开始时间/)
  assert.match(logColumnsSource, /结束时间/)
  assert.match(logColumnsSource, /执行时长/)
  assert.match(logColumnsSource, /处理样本数/)
  assert.match(logColumnsSource, /关联自动评测任务/)
  assert.match(logColumnsSource, /关联评测报告/)
  assert.match(logColumnsSource, /autoEvaluationTaskPath/)
  assert.match(logColumnsSource, /evaluationReportPath/)
  assert.match(logColumnsSource, /查看报告/)
  assert.doesNotMatch(logColumnsSource, /导出/)
  assert.match(logColumnsSource, /任务已删除/)
})

test('scheduled jobs page wires backend task row actions', () => {
  assert.match(pageSource, /createProjectScheduledJob/)
  assert.match(pageSource, /updateProjectScheduledJob/)
  assert.match(pageSource, /pauseProjectScheduledJob/)
  assert.match(pageSource, /resumeProjectScheduledJob/)
  assert.match(pageSource, /runProjectScheduledJob/)
  assert.match(pageSource, /triggerProjectScheduledJob/)
  assert.match(pageSource, /deleteProjectScheduledJob/)
  assert.match(pageSource, /setActiveTab\('logs'\)/)
  assert.match(pageSource, /invalidateScheduledJobs/)
  assert.match(pageSource, /toast\.success/)
  assert.match(storeSource, /formatJobTriggeredAutoEvaluationName/)
  assert.match(storeSource, /\/evaluation\/auto-evaluations\//)
  assert.match(storeSource, /\/evaluation\/reports\//)
})

test('scheduled jobs page renders scheduled job drawer and resets it on project change', () => {
  assert.match(pageSource, /ScheduledJobDrawer/)
  assert.match(pageSource, /<ScheduledJobDrawer/)
  assert.match(pageSource, /key={projectId}/)
  assert.match(pageSource, /setDrawerOpen\(false\)/)
  assert.match(pageSource, /setEditingTask\(null\)/)
  assert.match(pageSource, /setDrawerOpen\(true\)/)
})

test('scheduled job drawer implements required creation flow rules', () => {
  assert.match(drawerSource, /BaseForm/)
  assert.match(drawerSource, /schema=/)
  assert.match(drawerSource, /基础信息/)
  assert.match(drawerSource, /自动评测配置/)
  assert.match(drawerSource, /Score Name/)
  assert.match(drawerSource, /周期性执行/)
  assert.match(drawerSource, /高级 cron/)
  assert.match(drawerSource, /TRACE_FILTER/)
  assert.match(drawerSource, /DATASET/)
  assert.match(drawerSource, /shouldShowSampleWarning/)
  assert.match(drawerSource, /超过 1000 条样本/)
  assert.match(drawerSource, /form\.frequency\.mode === 'RECURRING'/)
  assert.match(drawerSource, /scoreName:\s*form\.scoreName\.trim\(\)/)
  assert.match(drawerSource, /mode=['"]enhanced['"]/)
  assert.match(drawerSource, /showOverlay={true}/)
  assert.match(drawerSource, /showConfirm={false}/)
  assert.match(drawerSource, /showCancel={false}/)
  assert.match(drawerSource, /form={formId}/)
  assert.match(drawerSource, /currentStep={step}/)
  assert.match(drawerSource, /task\?\.scoreName/)
  assert.match(drawerSource, /Number\.isFinite/)
  assert.match(drawerSource, /isValidTimeOfDay/)
  assert.match(drawerSource, /周期性执行只支持 Trace 过滤/)
  assert.match(drawerSource, /disabled={form\.frequency\.mode === 'RECURRING'}/)
  assert.match(drawerSource, /toIsoFromDateTimeLocal/)
  assert.match(drawerSource, /toDateTimeLocalValue/)
  assert.match(drawerSource, /form\.frequency\.mode === 'ONCE'/)
  assert.match(drawerSource, /请选择有效的单次执行时间/)
  assert.match(drawerSource, /buildTraceWindowFromFrequency/)
})

test('scheduled job drawer uses grouped basic cards and stacked auto evaluation config', () => {
  assert.match(drawerSource, /任务类型/)
  assert.match(drawerSource, /任务名称/)
  assert.match(drawerSource, /任务描述/)
  assert.match(drawerSource, /Score Name/)
  assert.match(drawerSource, /执行频率/)
  assert.match(drawerSource, /执行时间/)
  assert.match(drawerSource, /<Field label='任务类型'>[\s\S]*?<BasicCard>/)
  assert.match(
    drawerSource,
    /md:grid-cols-2[\s\S]*?<Field label='任务名称'>[\s\S]*?<Field label='Score Name'>/
  )
  assert.doesNotMatch(drawerSource, /任务信息/)
  assert.doesNotMatch(drawerSource, /定义定时任务的类型、名称和用途说明。/)
  assert.doesNotMatch(drawerSource, /调度设置/)
  assert.doesNotMatch(drawerSource, /设置评测分数字段和定时任务的执行节奏。/)
  assert.match(drawerSource, /评估器列表/)
  assert.match(drawerSource, /选择一个工作流评估器用于定时自动评测/)
  assert.match(drawerSource, /搜索评估器/)
  assert.match(drawerSource, /evaluatorKeyword/)
  assert.match(drawerSource, /filteredEvaluators/)
  assert.match(drawerSource, /暂无匹配的评估器/)
  assert.match(drawerSource, /变量映射/)
  assert.match(drawerSource, /variableMapping/)
  assert.match(drawerSource, /scheduledJobMockMappingFields/)
  assert.match(drawerSource, /toMappingTemplate/)
  assert.match(drawerSource, /getMappingSelectValue/)
  assert.match(mockDataSource, /sample\.input/)
  assert.match(mockDataSource, /sample\.output/)
  assert.match(drawerSource, /选择映射字段/)
  assert.match(drawerSource, /评测数据来源/)
  assert.match(drawerSource, /className='grid gap-5'/)
  assert.doesNotMatch(drawerSource, /lg:grid-cols-\[320px_1fr\]/)
})

test('scheduled job drawer supports trace filter fields and schedule-aligned windows', () => {
  assert.match(drawerSource, /固定时间范围/)
  assert.match(drawerSource, /快捷时间范围/)
  assert.match(drawerSource, /环境/)
  assert.match(drawerSource, /User ID/)
  assert.match(drawerSource, /Session ID/)
  assert.match(drawerSource, /Tags/)
  assert.match(drawerSource, /Trace 数据范围/)
  assert.match(drawerSource, /createRoundedRollingTraceWindowRange/)
  assert.match(drawerSource, /每次执行默认取当前整点向前/)
  assert.match(drawerSource, /formatTraceWindowSummary/)
  assert.match(
    drawerSource,
    /formatTraceWindowSummary\(\s*form\.frequency,\s*form\.traceEstimatedCount\s*\)/
  )
  assert.match(drawerSource, /buildTraceWindowFromFrequency\(frequency, form\)/)
  assert.doesNotMatch(drawerSource, /<Field label='评测数据来源'>/)
  assert.doesNotMatch(
    drawerSource,
    /<div className='font-medium'>TRACE_FILTER<\/div>/
  )
  assert.match(typesSource, /variableMapping/)
  assert.match(typesSource, /createdAtRange/)
  assert.match(mockDataSource, /scheduledJobMockMappingFields/)
  assert.match(mockDataSource, /sample\.context/)
})

test('scheduled job drawer moves sampling controls into execution config card', () => {
  assert.match(drawerSource, /title='执行配置'/)
  assert.match(
    drawerSource,
    /description='配置报告模板、采样比例和 Badcase 规则。'/
  )
  assert.match(drawerSource, /报告模板/)
  assert.match(drawerSource, /scheduledJobMockReportTemplates/)
  assert.match(drawerSource, /Badcase/)
  assert.match(drawerSource, /Badcase 阈值/)
  assert.match(drawerSource, /badcase/)
  assert.match(drawerSource, /reportTemplateId/)
  assert.match(drawerSource, /抽样比例/)
  assert.match(drawerSource, /预估样本量/)
  assert.match(drawerSource, /生效样本量/)
  assert.match(
    drawerSource,
    /title='选择评测数据来源'[\s\S]*?<\/SectionCard>\s*<SectionCard\s+title='执行配置'/
  )
  assert.doesNotMatch(
    drawerSource,
    /title='选择评测数据来源'[\s\S]*?<Field label='抽样比例'>[\s\S]*?<\/SectionCard>\s*<SectionCard\s+title='执行配置'/
  )
  assert.match(typesSource, /reportTemplateId/)
  assert.match(typesSource, /badcase/)
  assert.match(mockDataSource, /scheduledJobMockReportTemplates/)
})

test('scheduled jobs local mock data and status labels are defined', () => {
  assert.match(typesSource, /未启动/)
  assert.match(typesSource, /已暂停/)
  assert.match(typesSource, /执行成功/)
  assert.match(typesSource, /执行失败/)
  assert.match(typesSource, /手动执行/)
  assert.match(typesSource, /scoreName/)
  assert.match(typesSource, /scoreName:\s*string/)
  assert.match(mockDataSource, /scheduledJobMockTasks/)
  assert.match(mockDataSource, /scheduledJobMockLogs/)
  assert.match(mockDataSource, /scheduledJobMockEvaluators/)
  assert.match(mockDataSource, /scheduledJobMockDatasets/)
  assert.match(mockDataSource, /scoreName:\s*'customer_quality_score'/)
  assert.match(mockDataSource, /taskType/)
  assert.match(mockDataSource, /autoEvaluationTaskPath/)
  assert.match(mockDataSource, /evaluationReportPath/)
})

test('scheduled jobs mock logs include log table link fields', () => {
  assert.ok(scheduledJobMockLogs.length > 0)

  for (const log of scheduledJobMockLogs) {
    assert.equal(log.taskType, 'AUTO_EVALUATION')
    assert.match(
      log.autoEvaluationTaskPath ?? '',
      /\/evaluation\/auto-evaluations\//
    )
    assert.match(log.evaluationReportPath ?? '', /\/evaluation\/reports\//)
  }
})

test('scheduled jobs recurring mock tasks only use trace filter data source', () => {
  const recurringTasks = scheduledJobMockTasks.filter(
    (task) => task.runMode === 'RECURRING'
  )

  assert.ok(recurringTasks.length > 0)
  assert.deepEqual(
    recurringTasks.map((task) => task.dataSource.type),
    recurringTasks.map(() => 'TRACE_FILTER')
  )
})

test('scheduled jobs mock helpers contain job trigger naming and sample warning rules', () => {
  assert.match(storeSource, /【JOB触发】/)
  assert.match(storeSource, /formatJobTriggeredAutoEvaluationName/)
  assert.match(storeSource, /getEffectiveSampleCount/)
  assert.match(storeSource, /shouldShowSampleWarning/)
  assert.match(storeSource, /> 1000/)
  assert.doesNotMatch(storeSource, /localStorage/)
})

test('scheduled jobs mock helpers calculate sample warning rules', () => {
  assert.equal(shouldShowSampleWarning(1001, 100), true)
  assert.equal(shouldShowSampleWarning(1000, 100), false)
  assert.equal(getEffectiveSampleCount(1280, 50), 640)
})

test('scheduled jobs mock helpers format job triggered evaluation names', () => {
  assert.equal(
    formatJobTriggeredAutoEvaluationName(
      'xxxx',
      new Date('2026-07-09T01:00:00+08:00')
    ),
    '【JOB触发】xxxx-202607090100'
  )
})

test('scheduled jobs mock helpers return deep cloned tasks', () => {
  const projectId = 'project_3da8d83d6d3d4b5d923a5f1466a4ad3c'
  const firstClone = cloneMockTasks(projectId)
  const originalName = firstClone[0]?.name

  assert.ok(firstClone[0])
  firstClone[0].name = 'mutated name'

  const secondClone = cloneMockTasks(projectId)

  assert.equal(secondClone[0]?.name, originalName)
})

test('scheduled jobs mock helpers support deterministic time and ids', () => {
  assert.equal(
    calculateNextRunAt(
      { kind: 'EVERY_MINUTES', intervalMinutes: 30 },
      new Date('2026-07-09T01:00:00+08:00')
    ),
    '2026-07-08T17:30:00.000Z'
  )

  assert.equal(
    formatFrequencyLabel({
      kind: 'ONCE',
      runAt: '2026-07-09T01:00:00+08:00',
    }),
    '单次执行：2026-07-09T01:00:00+08:00'
  )
  assert.equal(
    formatFrequencyLabel({
      kind: 'WEEKLY',
      weekdays: [1, 3],
      timeOfDay: '09:30',
    }),
    '每周 周一、周三 09:30'
  )

  const [task] = cloneMockTasks('project_3da8d83d6d3d4b5d923a5f1466a4ad3c')
  assert.ok(task)

  const log = createExecutionLog(task, 'JOB', {
    id: 'pajoblog_test',
    now: new Date('2026-07-09T01:00:00+08:00'),
  })

  assert.equal(log.id, 'pajoblog_test')
  assert.equal(log.startedAt, '2026-07-08T17:00:00.000Z')
  assert.equal(log.taskType, 'AUTO_EVALUATION')
  assert.ok(log.autoEvaluationTaskPath)
  assert.ok(log.evaluationReportPath)
  assert.equal(
    log.autoEvaluationTaskName,
    '【JOB触发】每日客服质量评测-202607090100'
  )

  const manualLog = createExecutionLog(task, 'MANUAL', {
    id: 'pajoblog_manual_test',
    now: new Date('2026-07-09T01:00:00+08:00'),
  })

  assert.equal(manualLog.taskType, 'AUTO_EVALUATION')
  assert.match(
    manualLog.autoEvaluationTaskPath ?? '',
    /\/evaluation\/auto-evaluations\//
  )
  assert.match(manualLog.evaluationReportPath ?? '', /\/evaluation\/reports\//)
})
