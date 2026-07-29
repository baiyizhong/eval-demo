import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  consumeSceneCreateRequest,
  createInitialSceneCreateRequestState,
  getSceneQueryKeys,
  requestSceneCreate,
} from '../../modules/scene-experiments/lib/scene-management.ts'

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8')

test('scene create requests are consumed once and consecutive requests stay distinct', () => {
  const initial = createInitialSceneCreateRequestState()
  const first = requestSceneCreate(initial)
  assert.equal(first.pendingRequestId, 1)

  const consumed = consumeSceneCreateRequest(first, first.pendingRequestId)
  assert.equal(consumed.pendingRequestId, 0)
  assert.equal(
    consumeSceneCreateRequest(consumed, first.pendingRequestId),
    consumed
  )

  const second = requestSceneCreate(consumed)
  assert.equal(second.pendingRequestId, 2)
  assert.equal(second.nextRequestId, 2)
})

test('scene query keys retain api identity for lists and details', () => {
  const api = { name: 'api' }
  const keys = getSceneQueryKeys(api, 'proj_a', 'scene_a')

  assert.deepEqual(keys.projectScenes, ['project-scenes', api, 'proj_a'])
  assert.deepEqual(keys.availableScenes, ['available-scenes', api, 'proj_a'])
  assert.deepEqual(keys.projectScene, [
    'project-scene',
    api,
    'proj_a',
    'scene_a',
  ])
})

test('scene management routes expose list and independent detail pages', () => {
  const routes = read('../../routes/sidebar-routes.tsx')
  const lazyPages = read('../../routes/lazy-pages.tsx')
  assert.ok(routes.includes("path: 'projects/:projectId/scenes'"))
  assert.ok(routes.includes("path: 'projects/:projectId/scenes/:sceneId'"))
  assert.ok(lazyPages.includes('ProjectScenes'))
  assert.ok(lazyPages.includes('ProjectSceneDetail'))
})

test('scene form drawer follows the six-step experiment configuration workflow', () => {
  const source = read(
    '../../modules/scene-experiments/components/scene-form-drawer.tsx'
  )
  for (const label of [
    '基础信息',
    '选择数据集',
    '选择评估器',
    'Webhook 服务配置',
    '运行参数配置',
    '确认创建',
  ]) {
    assert.ok(source.includes(label), label)
  }
  assert.ok(!source.includes("title: '执行配置'"))
  assert.ok(source.includes('ExperimentDatasetStep'))
  assert.ok(source.includes('ExperimentEvaluatorStep'))
  assert.ok(source.includes('listActiveProjectEvaluators'))
  assert.ok(!source.includes('<ExperimentSelectableCard'))
  assert.ok(source.includes('evaluatorIds'))
  assert.ok(source.includes('datasetId'))
  assert.ok(source.includes('Webhook 服务'))
  assert.ok(source.includes('默认执行轮次'))
  assert.ok(source.includes("mode='enhanced'"))
})

test('scene form drawer places webhook before evaluator without changing step content', () => {
  const source = read(
    '../../modules/scene-experiments/components/scene-form-drawer.tsx'
  )

  assert.match(
    source,
    /const sceneSteps = \[[\s\S]*id: 'webhook'[\s\S]*id: 'evaluator'/
  )
  assert.match(
    source,
    /step === 2[\s\S]*<WebhookList[\s\S]*<WebhookEditor[\s\S]*step === 3[\s\S]*<ExperimentEvaluatorStep/
  )
})

test('scene evaluator step supports active multi-select and name search', () => {
  const source = read(
    '../../modules/scene-experiments/components/experiment-evaluator-step.tsx'
  )

  assert.ok(source.includes('filterEvaluatorsByName'))
  assert.ok(source.includes("placeholder='搜索评估器名称'"))
  assert.ok(source.includes('<Checkbox'))
  assert.ok(source.includes('onSelectionChange'))
  assert.ok(source.includes('当前项目暂无有效评估器'))
  assert.ok(source.includes('未找到匹配的有效评估器'))
  assert.ok(source.includes('outputVariables'))
})

test('scene form and run drawer only expose active evaluators in their scene scope', () => {
  const sceneForm = read(
    '../../modules/scene-experiments/components/scene-form-drawer.tsx'
  )
  const runDrawer = read(
    '../../modules/scene-experiments/components/experiment-run-drawer.tsx'
  )

  assert.ok(sceneForm.includes('activeEvaluatorIds'))
  assert.ok(sceneForm.includes('validEvaluatorIds'))
  assert.ok(sceneForm.includes('activeEvaluatorIds.has(id)'))
  assert.ok(sceneForm.includes('evaluatorIds: [...validEvaluatorIds]'))
  assert.ok(runDrawer.includes('listActiveProjectEvaluators'))
  assert.ok(runDrawer.includes('filterSceneBoundEvaluators'))
  assert.match(
    runDrawer,
    /filterSceneBoundEvaluators\([\s\S]*projectEvaluators[\s\S]*selectedScene\?\.evaluatorIds/
  )
  assert.doesNotMatch(runDrawer, /projectEvaluators\.map\(\(evaluator\) =>/)
})

test('scene form drawer separates webhook and run parameter steps', () => {
  const source = read(
    '../../modules/scene-experiments/components/scene-form-drawer.tsx'
  )

  assert.match(
    source,
    /step === 2[\s\S]*<WebhookList[\s\S]*<WebhookEditor[\s\S]*step === 4[\s\S]*<RunParameters/
  )
  assert.doesNotMatch(
    source,
    /step === 2[\s\S]*<WebhookEditor[\s\S]*<RunParameters[\s\S]*step === 4/
  )
})

test('scene scheduling configuration persists evaluator and webhook selections', () => {
  const source = read(
    '../../modules/scene-experiments/components/scene-form-drawer.tsx'
  )

  assert.match(source, /支持定时执行/)
  assert.match(source, /可在定时任务模块中配置调度/)
  assert.match(source, /checked=\{draft\.supportsScheduledExecution\}/)
  assert.match(
    source,
    /draft\.supportsScheduledExecution &&[\s\S]*validEvaluatorIds\.length === 0[\s\S]*evaluators\[0\]/
  )
  assert.match(
    source,
    /supportsScheduledExecution: checked[\s\S]*defaultScheduledWebhookIds:/
  )
  assert.match(
    source,
    /scene\.defaultScheduledWebhookIds \?\?[\s\S]*scene\.defaultScheduledWebhookId/
  )
  assert.match(source, /defaultScheduledWebhookIds: \[\]/)
})

test('scene webhook list exposes scheduled service multi-select only when scheduling is enabled', () => {
  const source = read(
    '../../modules/scene-experiments/components/scene-form-drawer.tsx'
  )

  assert.ok(source.includes("from '@/components/ui/checkbox'"))
  assert.match(
    source,
    /showScheduledSelection=\{draft\.supportsScheduledExecution\}/
  )
  assert.match(source, /scheduledWebhookIds=\{validScheduledWebhookIds\}/)
  assert.match(source, /<Checkbox/)
  assert.match(
    source,
    /aria-label=\{`选择定时执行服务：\$\{webhook\.name \|\| '未命名服务'\}`\}/
  )
})

test('scene scheduling keeps selections while disabled and repairs them after deletion', () => {
  const source = read(
    '../../modules/scene-experiments/components/scene-form-drawer.tsx'
  )

  assert.match(
    source,
    /const validScheduledWebhookIds = draft\.defaultScheduledWebhookIds\.filter\([\s\S]*webhookIds\.has\(id\)/
  )
  assert.match(
    source,
    /const nextScheduledWebhookIds = draft\.defaultScheduledWebhookIds\.filter\([\s\S]*nextScheduledWebhookIds\.length === 0[\s\S]*next\[0\]\?\.id/
  )
  assert.match(source, /defaultScheduledWebhookIds: validScheduledWebhookIds/)
})

test('scene summary presents scheduled execution and selected webhooks', () => {
  const source = read(
    '../../modules/scene-experiments/components/scene-form-drawer.tsx'
  )

  assert.match(source, /label='支持定时执行'/)
  assert.match(source, /定时执行服务（\$\{scheduledWebhooks\.length\}）/)
  assert.match(source, /scheduledWebhooks\.map/)
})

test('scene scheduling validates evaluator and webhook selections when advancing or submitting', () => {
  const source = read(
    '../../modules/scene-experiments/components/scene-form-drawer.tsx'
  )

  assert.match(
    source,
    /targetStep > 3[\s\S]*draft\.supportsScheduledExecution[\s\S]*validEvaluatorIds\.length === 0[\s\S]*支持定时执行时请至少选择一个评估器[\s\S]*setStep\(3\)/
  )
  assert.match(
    source,
    /targetStep > 2[\s\S]*draft\.supportsScheduledExecution[\s\S]*validScheduledWebhookIds\.length === 0[\s\S]*支持定时执行时请至少选择一个 Webhook 服务[\s\S]*setStep\(2\)/
  )
  assert.doesNotMatch(
    source,
    /onSelectionChange=\{\(nextEvaluatorIds\) => \{[\s\S]*支持定时执行时需保留一个默认评估器/
  )
})

test('scene list and detail omit evaluator presentation', () => {
  const list = read(
    '../../modules/scene-experiments/components/scene-management-table.tsx'
  )
  const columns = read(
    '../../modules/scene-experiments/components/scene-columns.tsx'
  )
  const source = read('../../modules/scene-experiments/views/scene-detail.tsx')

  assert.ok(list.includes('listProjectScenes'))
  assert.ok(list.includes('搜索场景名称'))
  assert.ok(list.includes('SceneFormDrawer'))
  assert.ok(list.includes('saveProjectScene'))
  assert.ok(list.includes('deleteProjectScene'))
  assert.ok(list.includes('patchProjectScene'))
  assert.ok(list.includes('useEffect'))
  assert.ok(list.includes('onCreateRequestConsumed'))
  assert.ok(!list.includes('key={createRequestId'))
  assert.ok(list.includes("mode: editingScene ? 'edit' : 'create'"))
  assert.ok(list.includes('saveMutation.isPending'))
  assert.ok(list.includes('toggleMutation.isPending'))
  assert.ok(list.includes('deleteMutation.isPending'))
  assert.ok(list.includes('getSceneQueryKeys'))
  assert.ok(list.includes('canEdit'))
  assert.ok(columns.includes('readOnly'))
  assert.ok(columns.includes('pending'))
  assert.ok(columns.includes('disabled={pending}'))
  assert.ok(columns.includes("accessorKey: 'enabled'"))
  assert.ok(list.includes('columnVisibility: { enabled: false }'))
  assert.ok(source.includes('SceneFormDrawer'))
  assert.ok(source.includes("can('project:dataset:edit')"))
  assert.ok(source.includes('buildProjectScenesHref(projectId)'))
  assert.ok(!columns.includes("header: '评估器'"))
  assert.ok(!list.includes("evaluators: '评估器'"))
  assert.ok(!list.includes('scene-evaluators'))
  assert.ok(source.includes('默认数据集'))
  assert.ok(source.includes('默认评估器'))

  for (const label of [
    'Webhook 服务',
    '并发数',
    '超时时间',
    '重试次数',
    '默认执行轮次',
  ]) {
    assert.ok(source.includes(label), label)
  }
})

test('scene form drawer blocks repeated submit and closing while pending', () => {
  const source = read(
    '../../modules/scene-experiments/components/scene-form-drawer.tsx'
  )

  assert.ok(source.includes('pending?: boolean'))
  assert.ok(source.includes('if (pending) return'))
  assert.ok(source.includes('disabled={pending}'))
  assert.ok(source.includes('onOpenChange={handleOpenChange}'))
  assert.ok(source.includes('catch'))
})
