import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import * as workbenchPrototype from '../../modules/app-evaluation/lib/badcase-workbench-prototype.ts'

const workbenchSource = readFileSync(
  'src/modules/app-evaluation/views/badcase-workbench.tsx',
  'utf8'
)

test('badcase workbench keeps its lifecycle rail horizontal and non-wrapping', () => {
  assert.match(workbenchSource, /BadcaseLifecycleTrack/)
  assert.match(workbenchSource, /<BadcaseListPanel/)
  assert.match(workbenchSource, /<BadcaseItemDrawer/)

  const lifecycleSource = readFileSync(
    'src/modules/app-evaluation/components/badcase-workbench/badcase-lifecycle-track.tsx',
    'utf8'
  )

  assert.match(lifecycleSource, /overflow-x-auto/)
  assert.match(lifecycleSource, /grid-cols-7/)
  assert.match(lifecycleSource, /min-w-\[980px\]/)
  assert.doesNotMatch(lifecycleSource, /flex-wrap/)
})

test('governance workspace uses full-width list and drawer instead of right detail panel', () => {
  const lifecycleSource = readFileSync(
    'src/modules/app-evaluation/components/badcase-workbench/badcase-lifecycle-track.tsx',
    'utf8'
  )

  assert.match(lifecycleSource, /全部/)
  assert.doesNotMatch(lifecycleSource, /ArrowRight/)
  assert.doesNotMatch(workbenchSource, /BadcaseDetailPanel/)
  assert.doesNotMatch(
    workbenchSource,
    /grid-cols-\[minmax\(0,7fr\)_minmax\(320px,3fr\)\]/
  )
  assert.match(workbenchSource, /selectedDrawerItemId/)
  assert.match(workbenchSource, /setSelectedDrawerItemId\(itemId\)/)
})

test('badcase lifecycle header does not show personal todo count', () => {
  const workbenchPageSource = readFileSync(
    'src/modules/app-evaluation/views/badcase-workbench.tsx',
    'utf8'
  )
  const lifecycleSource = readFileSync(
    'src/modules/app-evaluation/components/badcase-workbench/badcase-lifecycle-track.tsx',
    'utf8'
  )

  assert.doesNotMatch(lifecycleSource, /我的待办/)
  assert.doesNotMatch(lifecycleSource, /myTodoCount/)
  assert.doesNotMatch(workbenchPageSource, /myTodoCount/)
})

test('badcase item drawer uses editable form and compact trace source details', () => {
  const drawerSource = readFileSync(
    'src/modules/app-evaluation/components/badcase-workbench/badcase-item-drawer.tsx',
    'utf8'
  )

  assert.match(drawerSource, /Drawer/)
  assert.match(drawerSource, /BaseForm/)
  assert.match(drawerSource, /MixEditor/)
  assert.match(drawerSource, /Badcase 表单详情/)
  assert.match(drawerSource, /Badcase item 数据详情/)
  assert.match(drawerSource, /处理人/)
  assert.match(drawerSource, /状态/)
  assert.match(drawerSource, /优先级/)
  assert.match(drawerSource, /根因分析/)
  assert.match(drawerSource, /预计修复时间/)
  assert.match(drawerSource, /实际修复时间/)
  assert.match(drawerSource, /备注/)
  assert.match(drawerSource, /Input/)
  assert.match(drawerSource, /Expected Output/)
  assert.match(drawerSource, /Metadata/)
  assert.match(drawerSource, /关联 Trace ID/)
  assert.match(drawerSource, /buildTraceLogsHref/)
  assert.match(drawerSource, /observability\/traces\/logs\?traceId=/)
  assert.doesNotMatch(drawerSource, /title='Output'/)
  assert.doesNotMatch(drawerSource, /title='关联 Trace 信息'/)
  assert.doesNotMatch(drawerSource, /LLMTraceChain/)
})

test('badcase item drawer edits governance form values and submits saves', () => {
  const drawerSource = readFileSync(
    'src/modules/app-evaluation/components/badcase-workbench/badcase-item-drawer.tsx',
    'utf8'
  )
  const workbenchPageSource = readFileSync(
    'src/modules/app-evaluation/views/badcase-workbench.tsx',
    'utf8'
  )

  assert.match(drawerSource, /BaseForm/)
  assert.match(drawerSource, /badcaseItemFormSchema/)
  assert.match(drawerSource, /onSave/)
  assert.match(drawerSource, /name='stage'/)
  assert.match(drawerSource, /label='状态'/)
  assert.match(drawerSource, /lifecycleStages\.map/)
  assert.match(drawerSource, /name='owner'/)
  assert.match(drawerSource, /label='处理人'/)
  assert.match(drawerSource, /<Input/)
  assert.match(drawerSource, /name='priority'/)
  assert.match(drawerSource, /name='rootCause'/)
  assert.match(drawerSource, /name='note'/)
  assert.match(drawerSource, /confirmText='保存'/)
  assert.match(drawerSource, /BADCASE_ITEM_FORM_ID = 'badcase-item-form'/)
  assert.match(drawerSource, /confirmProps=\{\{ form: BADCASE_ITEM_FORM_ID, type: 'submit' \}\}/)
  assert.doesNotMatch(drawerSource, /<BaseDetail columns=\{2\} items=\{buildFormDetailItems\(item\)\}/)

  assert.match(workbenchPageSource, /handleDrawerSave/)
  assert.match(workbenchPageSource, /setItems\(\(current\) =>/)
  assert.match(workbenchPageSource, /setDatasets\(\(current\) =>/)
  assert.match(workbenchPageSource, /updateDatasetSummaryAfterDrawerSave/)
  assert.match(workbenchPageSource, /toast\.success\('Badcase 表单已保存'\)/)
  assert.match(workbenchPageSource, /onSave=\{handleDrawerSave\}/)
})

test('badcase form tab does not repeat stage action header copy', () => {
  const stageFormSource = readFileSync(
    'src/modules/app-evaluation/components/badcase-workbench/badcase-stage-form.tsx',
    'utf8'
  )

  assert.doesNotMatch(stageFormSource, /仅填写当前状态推进所需的信息/)
  assert.doesNotMatch(stageFormSource, /stageTitle\(/)
  assert.doesNotMatch(stageFormSource, /function stageTitle/)
})

test('badcase stage form uses text owners, rollback stage, and refined secondary actions', () => {
  const stageFormSource = readFileSync(
    'src/modules/app-evaluation/components/badcase-workbench/badcase-stage-form.tsx',
    'utf8'
  )
  const prototypeSource = readFileSync(
    'src/modules/app-evaluation/lib/badcase-workbench-prototype.ts',
    'utf8'
  )

  assert.match(stageFormSource, /Input/)
  assert.match(stageFormSource, /name='rollbackStage'/)
  assert.match(stageFormSource, /label='回退阶段'/)
  assert.match(stageFormSource, /PENDING_CONFIRM/)
  assert.match(stageFormSource, /PENDING_VERIFY/)
  assert.match(stageFormSource, /加入回归集/)
  assert.doesNotMatch(stageFormSource, /const owners/)
  assert.doesNotMatch(stageFormSource, /owners\.map/)
  assert.doesNotMatch(prototypeSource, /secondaryActions: \['复测失败'/)
  assert.doesNotMatch(prototypeSource, /secondaryActions: \['验证失败'/)
  assert.doesNotMatch(prototypeSource, /secondaryActions: \['关闭无效'/)
  assert.doesNotMatch(prototypeSource, /标记重复/)
  assert.doesNotMatch(prototypeSource, /调整优先级/)
  assert.doesNotMatch(prototypeSource, /转派/)
  assert.doesNotMatch(prototypeSource, /延期/)
  assert.doesNotMatch(prototypeSource, /记录阻塞/)
  assert.match(
    prototypeSource,
    /PENDING_CONFIRM:[\s\S]*secondaryActions: \['保存'\]/
  )
  assert.match(
    prototypeSource,
    /PENDING_ROOT_CAUSE:[\s\S]*secondaryActions: \['退回确认', '保存'\]/
  )
  assert.match(
    prototypeSource,
    /FIXING:[\s\S]*secondaryActions: \['保存', '退回归因'\]/
  )
  assert.match(prototypeSource, /secondaryActions: \['重新触发复测'\]/)
  assert.match(prototypeSource, /secondaryActions: \['加入回归集'\]/)
})

test('badcase fixing and retest forms carry expected fix time and repair owner defaults', () => {
  const stageFormSource = readFileSync(
    'src/modules/app-evaluation/components/badcase-workbench/badcase-stage-form.tsx',
    'utf8'
  )

  assert.match(stageFormSource, /label='预计修复时间'/)
  assert.match(stageFormSource, /value=\{item\.fixDueAt\}/)
  assert.match(stageFormSource, /readOnly/)
  assert.match(
    stageFormSource,
    /name='nextOwner'[\s\S]*value=\{field\.value \|\| defaultOwner/
  )
  assert.match(stageFormSource, /defaultOwner=\{[\s\S]*item\.fixOwner[\s\S]*\}/)
  assert.match(stageFormSource, /退回修复/)
  assert.doesNotMatch(stageFormSource, /复测失败并退回修复/)
})

test('badcase detail removes duplicate summary fields and keeps data entry in context header', () => {
  const drawerSource = readFileSync(
    'src/modules/app-evaluation/components/badcase-workbench/badcase-item-drawer.tsx',
    'utf8'
  )

  assert.doesNotMatch(drawerSource, /label:\s*'当前责任人'/)
  assert.doesNotMatch(drawerSource, /label:\s*'最近动态'/)
  assert.doesNotMatch(drawerSource, /label:\s*'SLA'/)
  assert.doesNotMatch(drawerSource, /治理历史/)
  assert.doesNotMatch(drawerSource, /当前处理上下文/)
})

test('badcase list exposes stage column and stage filters', () => {
  const listSource = readFileSync(
    'src/modules/app-evaluation/components/badcase-workbench/badcase-list-panel.tsx',
    'utf8'
  )

  assert.match(listSource, /accessorKey: 'stage'/)
  assert.match(listSource, /header: '状态'/)
  assert.match(listSource, /stageClassName/)
  assert.match(listSource, /id: 'stage'/)
  assert.match(listSource, /label: '生命周期状态'/)
  assert.match(listSource, /fieldId: 'stage'/)
  assert.match(listSource, /title: '状态'/)
  assert.match(listSource, /stageFilters/)
  assert.match(listSource, /stage: activeStage/)
})

test('badcase list exposes row action to start retest', () => {
  const listSource = readFileSync(
    'src/modules/app-evaluation/components/badcase-workbench/badcase-list-panel.tsx',
    'utf8'
  )
  const workbenchPageSource = readFileSync(
    'src/modules/app-evaluation/views/badcase-workbench.tsx',
    'utf8'
  )

  assert.match(listSource, /id: 'actions'/)
  assert.match(listSource, /header: '操作'/)
  assert.match(listSource, /发起复测/)
  assert.match(listSource, /onRetestAction\(row\.original\)/)
  assert.match(listSource, /actions: '操作'/)
  assert.match(workbenchPageSource, /handleRetestAction/)
  assert.match(workbenchPageSource, /onRetestAction=\{handleRetestAction\}/)
  assert.match(workbenchPageSource, /toast\.success\('已发起复测'/)
})

test('badcase list does not repeat dataset name and selected stage below its title', () => {
  const listSource = readFileSync(
    'src/modules/app-evaluation/components/badcase-workbench/badcase-list-panel.tsx',
    'utf8'
  )

  assert.doesNotMatch(listSource, /当前阶段：/)
  assert.doesNotMatch(listSource, /\{dataset\.name\}\s*·/)
  assert.doesNotMatch(listSource, /条样本/)
  assert.doesNotMatch(listSource, /items\.length\}\s*条样本/)
})

test('selection homepage only renders dataset selection and governance preview', () => {
  assert.match(
    workbenchSource,
    /\{activeDataset \? \(\s*<section[\s\S]*?<BadcaseLifecycleTrack/
  )
  assert.match(workbenchSource, /\) : \(\s*<BadcaseDatasetSelection/)

  const lifecycleSource = readFileSync(
    'src/modules/app-evaluation/components/badcase-workbench/badcase-lifecycle-track.tsx',
    'utf8'
  )
  assert.doesNotMatch(lifecycleSource, /治理路径/)
  assert.doesNotMatch(lifecycleSource, /selectionSteps/)
})

test('dataset selection opens workbench from name and keeps preview details as secondary action', () => {
  const selectionSource = readFileSync(
    'src/modules/app-evaluation/components/badcase-workbench/badcase-dataset-selection.tsx',
    'utf8'
  )

  assert.match(selectionSource, /buildDatasetColumns\(selectedDataset\?\.id, onSelect, onEnter\)/)
  assert.match(selectionSource, /onClick=\{\(\) => onEnter\(row\.original\.id\)\}/)
  assert.match(selectionSource, /数据集详情/)
  assert.match(selectionSource, /onClick=\{\(\) => onSelect\(row\.original\.id\)\}/)
  assert.doesNotMatch(selectionSource, />预览</)
  assert.doesNotMatch(selectionSource, /CardFooter/)
  assert.doesNotMatch(selectionSource, /查看数据集详情/)
  assert.doesNotMatch(selectionSource, /进入治理/)
})

test('dataset governance preview uses compact metric grid and horizontal stage bars', () => {
  const selectionSource = readFileSync(
    'src/modules/app-evaluation/components/badcase-workbench/badcase-dataset-selection.tsx',
    'utf8'
  )

  assert.match(selectionSource, /previewMetrics/)
  assert.match(selectionSource, /grid-cols-3/)
  assert.match(selectionSource, /label: '总 badcase'/)
  assert.match(selectionSource, /label: '最近更新'/)
  assert.match(selectionSource, /stageBarRows/)
  assert.match(selectionSource, /stageIconMap/)
  assert.match(selectionSource, /StageIcon/)
  assert.match(selectionSource, /lifecycleStages\.map/)
  assert.match(selectionSource, /dataset\.stageCounts\[stage\.value\]/)
  assert.match(selectionSource, /maxStageCount/)
  assert.match(selectionSource, /width: `\$\{row\.percent\}%`/)
  assert.match(selectionSource, /aria-label=\{`\$\{row\.label\} 数量 \$\{row\.count\}`\}/)
  assert.doesNotMatch(selectionSource, /<BaseDetail[\s\S]*总 badcase/)
  assert.doesNotMatch(selectionSource, /className='grid grid-cols-2 gap-2 p-3'/)
})

test('badcase pages compose the project public components', () => {
  const selectionSource = readFileSync(
    'src/modules/app-evaluation/components/badcase-workbench/badcase-dataset-selection.tsx',
    'utf8'
  )
  const listSource = readFileSync(
    'src/modules/app-evaluation/components/badcase-workbench/badcase-list-panel.tsx',
    'utf8'
  )
  const drawerSource = readFileSync(
    'src/modules/app-evaluation/components/badcase-workbench/badcase-item-drawer.tsx',
    'utf8'
  )
  const stageFormPath =
    'src/modules/app-evaluation/components/badcase-workbench/badcase-stage-form.tsx'
  assert.equal(existsSync(stageFormPath), true)
  if (!existsSync(stageFormPath)) return
  const stageFormSource = readFileSync(stageFormPath, 'utf8')

  assert.match(selectionSource, /DataTable/)
  assert.match(selectionSource, /Card/)
  assert.match(selectionSource, /Badge/)
  assert.match(listSource, /DataTable/)
  assert.match(listSource, /filterPanel/)
  assert.match(drawerSource, /BaseForm/)
  assert.match(drawerSource, /Drawer/)
  assert.match(stageFormSource, /BaseForm/)
  assert.match(stageFormSource, /\.object\(/)

  assert.doesNotMatch(selectionSource, /DatasetCell/)
  assert.doesNotMatch(listSource, /BadcaseQueueRow/)
  assert.doesNotMatch(listSource, /FilterMenu/)
})

test('badcase workbench remains frontend-only mock data', () => {
  assert.match(workbenchSource, /ProjectBadcaseWorkbench/)
  assert.doesNotMatch(workbenchSource, /useAPI\(/)
  assert.doesNotMatch(workbenchSource, /useQuery\(/)
  assert.doesNotMatch(workbenchSource, /fetch\(/)
  assert.doesNotMatch(workbenchSource, /axios/)
})

test('badcase list filtering combines lifecycle, priority, owner and overdue filters', () => {
  assert.equal(typeof workbenchPrototype.filterBadcaseItems, 'function')
  if (typeof workbenchPrototype.filterBadcaseItems !== 'function') return

  const result = workbenchPrototype.filterBadcaseItems(
    workbenchPrototype.badcaseItems,
    {
      keyword: '税号',
      stage: 'PENDING_VERIFY',
      priorities: ['P1'],
      owners: ['业务验证 / Huang'],
      failureTypes: ['CACHE_STALE'],
      overdueOnly: true,
    }
  )

  assert.deepEqual(
    result.map((item) => item.id),
    ['BC-20260817-0031']
  )
})

test('primary stage action updates the item and appends an auditable history event', () => {
  assert.equal(typeof workbenchPrototype.applyPrimaryTransition, 'function')
  if (typeof workbenchPrototype.applyPrimaryTransition !== 'function') return

  const source = workbenchPrototype.badcaseItems.find(
    (item) => item.stage === 'FIXING'
  )
  assert.ok(source)

  const transitioned = workbenchPrototype.applyPrimaryTransition(source, {
    note: '修复已发布，交由 QA 复测',
    nextOwner: 'QA / Li',
  })

  assert.equal(transitioned.stage, 'PENDING_RETEST')
  assert.equal(transitioned.owner, 'QA / Li')
  assert.equal(transitioned.lastAction, '提交修复')
  const lastHistory = transitioned.history[transitioned.history.length - 1]
  assert.equal(lastHistory?.from, 'FIXING')
  assert.equal(lastHistory?.to, 'PENDING_RETEST')
  assert.equal(lastHistory?.reason, '修复已发布，交由 QA 复测')
})
