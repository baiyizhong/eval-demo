import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(
  'src/modules/app-evaluation/components/evaluation-report-item-table.tsx',
  'utf8'
)
const badcaseSource = readFileSync(
  'src/modules/app-evaluation/components/evaluation-report-badcase-table.tsx',
  'utf8'
)
const detailSource = readFileSync(
  'src/modules/app-evaluation/views/evaluation-report-detail.tsx',
  'utf8'
)
const traceAnnotationDialogSource = readFileSync(
  'src/modules/app-observability/components/trace-annotation-dialog.tsx',
  'utf8'
)

test('evaluation report item table does not show the all-data flowback button', () => {
  const fixedActionSection = source.match(
    /return \(\s*<section[\s\S]*?<DataTable<EvaluationReportItemRecord>/
  )?.[0]

  assert.ok(fixedActionSection)
  assert.equal(fixedActionSection.includes('回流评测数据'), false)
  assert.equal(source.includes('回流已选择'), false)
})

test('evaluation report item table supports badcase-like bulk actions for evaluated data', () => {
  assert.match(source, /id:\s*'select'/)
  assert.match(source, /aria-label='全选评测数据'/)
  assert.match(source, /aria-label='选择评测数据'/)
  assert.match(source, /DataTableBulkActions/)
  assert.match(source, /selection=\{selection\}/)
  assert.match(source, /entityName='评测数据'/)
  assert.match(source, /导出 JSON/)
  assert.match(source, /加入数据集/)
  assert.match(source, /人工标注/)
  assert.match(source, /TraceDatasetDialog/)
  assert.match(source, /TraceAnnotationDialog/)
  assert.match(source, /createProjectEvaluationReportFlowback/)
  assert.match(source, /flowbackType:\s*'EVALUATION_DATA'/)
  assert.match(source, /createTraceAnnotationTask/)
  assert.match(source, /createProjectAnnotationQueue/)
  assert.match(source, /resolveSelectedTraceIds/)
  assert.doesNotMatch(source, /后端逻辑待接入/)
})

test('evaluation report badcase table does not show the all-badcase flowback button', () => {
  const fixedActionSection = badcaseSource.match(
    /return \(\s*<section[\s\S]*?<DataTable<EvaluationReportBadcaseRecord>/
  )?.[0]

  assert.ok(fixedActionSection)
  assert.equal(fixedActionSection.includes('回流 Badcase'), false)
  assert.equal(badcaseSource.includes('回流已选择'), false)
})

test('evaluation report badcase table supports trace-like bulk actions', () => {
  assert.match(badcaseSource, /id:\s*'select'/)
  assert.match(badcaseSource, /aria-label='全选 Badcase'/)
  assert.match(badcaseSource, /aria-label='选择 Badcase'/)
  assert.match(badcaseSource, /DataTableBulkActions/)
  assert.match(badcaseSource, /selection=\{selection\}/)
  assert.match(badcaseSource, /entityName='Badcase'/)
  assert.match(badcaseSource, /导出 JSON/)
  assert.match(badcaseSource, /加入数据集/)
  assert.match(badcaseSource, /人工标注/)
  assert.match(badcaseSource, /TraceDatasetDialog/)
  assert.match(badcaseSource, /TraceAnnotationDialog/)
  assert.match(badcaseSource, /addProjectTracesToDatasetTarget/)
  assert.match(badcaseSource, /createTraceAnnotationTask/)
  assert.match(badcaseSource, /createProjectAnnotationQueue/)
  assert.match(badcaseSource, /resolveSelectedTraceIds/)
  assert.doesNotMatch(badcaseSource, /后端逻辑待接入/)
})

test('evaluation report badcase annotation task uses report source default description', () => {
  assert.match(badcaseSource, /useSessionStore/)
  assert.match(badcaseSource, /currentUserEmail/)
  assert.match(badcaseSource, /buildBadcaseAnnotationDescription/)
  assert.match(badcaseSource, /数据来源：\$\{reportName\}-badcase/)
  assert.match(badcaseSource, /badcase数量：\$\{selectedCount\}条/)
  assert.match(badcaseSource, /创建人：\$\{creatorEmail \|\| '-'\}/)
  assert.match(badcaseSource, /defaultDescription=\{annotationDescription\}/)
  assert.match(traceAnnotationDialogSource, /defaultDescription\?: string/)
  assert.match(traceAnnotationDialogSource, /description: defaultDescription/)
})

test('evaluation report detail keeps top actions report-scoped', () => {
  assert.match(detailSource, /label:\s*'导出报告'/)
  assert.doesNotMatch(detailSource, /id:\s*'add-to-dataset'/)
  assert.doesNotMatch(detailSource, /label:\s*'加入数据集'/)
  assert.doesNotMatch(detailSource, /label:\s*'回流 Badcase'/)
  assert.doesNotMatch(detailSource, /label:\s*'回流评测数据'/)
})

test('evaluation report badcase table shows reason and score summary with batch hover card preview', () => {
  assert.match(badcaseSource, /title='score'/)
  assert.match(badcaseSource, /header:\s*'reason'/)
  assert.match(badcaseSource, /header:\s*'评分摘要'/)
  assert.match(badcaseSource, /HoverPreviewCell/)
  assert.match(badcaseSource, /@\/components\/common\/hover-preview-cell/)
  assert.doesNotMatch(badcaseSource, /@\/components\/ui\/hover-card/)
  assert.doesNotMatch(badcaseSource, /function ReasonCell/)
  assert.doesNotMatch(badcaseSource, /function ScoreSummaryCell/)
  assert.doesNotMatch(badcaseSource, /function SummaryHoverCell/)
  assert.doesNotMatch(
    badcaseSource,
    /accessorKey:\s*'scoreName',\s*header:\s*'Score'/
  )
})

test('evaluation report tables use stable query keys that can be invalidated by detail page', () => {
  assert.equal(
    source.includes("'project-evaluation-report-items',\n            $api,"),
    false
  )
  assert.equal(
    badcaseSource.includes(
      "'project-evaluation-report-badcases',\n            $api,"
    ),
    false
  )
  assert.equal(
    detailSource.includes(
      "['project-evaluation-report', $api, projectId, reportId]"
    ),
    false
  )
  assert.match(
    detailSource,
    /queryKey:\s*\['project-evaluation-report-items', projectId, reportId\]/
  )
})

test('evaluation report item table shows trace ids and score created_at columns', () => {
  assert.match(source, /accessorKey:\s*'traceId'/)
  assert.match(source, /accessorKey:\s*'traceId',\s*header:\s*'Trace ID'/)
  assert.doesNotMatch(
    source,
    /accessorKey:\s*'sourceId',\s*header:\s*'来源 ID'/
  )
  assert.doesNotMatch(source, /accessorKey:\s*'traceId',\s*header:\s*'来源 ID'/)
  assert.match(source, /header:\s*'created_at'/)
  assert.match(source, /score\.createdAt/)
  assert.match(source, /accessorKey:\s*'scoreSummary'/)
  assert.match(source, /header:\s*'评分摘要'/)
  assert.match(source, /HoverPreviewCell/)
  assert.match(source, /label='评分摘要'/)
  assert.match(source, /formatScoreSummary/)
})
