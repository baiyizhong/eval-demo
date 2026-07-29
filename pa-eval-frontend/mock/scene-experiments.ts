import { db } from './_data.ts'
import {
  body,
  failure,
  id,
  keywordIncludes,
  nowIso,
  paginate,
  pathParam,
  success,
} from './_utils.ts'

const projectId = (req: any) => pathParam(req, 'projectId')
const datasetId = (req: any) => pathParam(req, 'datasetId')

function segmentAfter(req: any, marker: string) {
  const segments = String(req.url ?? '')
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .map(decodeURIComponent)
  const index = segments.indexOf(marker)
  return index >= 0 ? segments[index + 1] ?? '' : ''
}

function sceneDetail(scene: any) {
  return scene
}

function evaluatorSnapshot(evaluator: any) {
  return {
    id: evaluator.id,
    name: evaluator.name,
    type: evaluator.type,
    version: evaluator.version,
    outputVariables: evaluator.outputVariables ?? [],
    outputVariableMappings: evaluator.outputVariableMappings ?? [],
  }
}

function createScoreResults(evaluators: any[], serviceIndex: number) {
  return evaluators.flatMap((evaluator, evaluatorIndex) => {
    const mappings = evaluator.outputVariableMappings?.length
      ? evaluator.outputVariableMappings
      : (evaluator.outputVariables ?? ['score']).map((variableName: string) => ({
          variableName,
          scoreConfigName: variableName,
        }))
    return mappings.map((mapping: any, variableIndex: number) => {
      const value = Math.max(
        0.55,
        Math.min(0.98, 0.92 - serviceIndex * 0.045 - evaluatorIndex * 0.012 - variableIndex * 0.008)
      )
      return {
        key: `${evaluator.id}:${mapping.variableName}`,
        evaluatorId: evaluator.id,
        evaluatorName: evaluator.name,
        variableName: mapping.variableName,
        scoreName: mapping.scoreConfigName || mapping.variableName,
        value: Number(value.toFixed(3)),
        standardDeviation: Number((0.008 + serviceIndex * 0.006).toFixed(3)),
      }
    })
  })
}

function buildReportResults(report: any) {
  const items = db.datasetItems.filter(
    (item: any) => item.datasetId === report.datasetId && item.status === 'ACTIVE'
  )
  const scores = report.scoreResults
  report.itemCount = items.length
  report.successfulItemCount = items.length
  report.failedItemCount = 0
  report.roundResults = Array.from(
    { length: report.runParameters.rounds },
    (_, index) => ({
      round: index + 1,
      scores: Object.fromEntries(
        scores.map((score: any) => [
          score.key,
          Number((score.value - (report.runParameters.rounds - index - 1) * 0.004).toFixed(3)),
        ])
      ),
      successCount: items.length,
      failureCount: 0,
    })
  )
  report.itemResults = items.map((item: any, itemIndex: number) => ({
    itemId: item.id,
    input: item.input,
    expectedOutput: item.expectedOutput,
    output: {
      answer: `由 ${report.webhookSnapshot.name} 生成的模拟回答 ${itemIndex + 1}`,
    },
    scores: Object.fromEntries(
      scores.map((score: any) => [
        score.key,
        Number((score.value + (itemIndex % 2 ? -0.018 : 0.018)).toFixed(3)),
      ])
    ),
    status: 'PASSED',
  }))
}

function progressReport(report: any) {
  if (!['QUEUED', 'RUNNING', 'SCORING'].includes(report.status)) return report
  const elapsed = Date.now() - new Date(report.createdAt).getTime()
  if (elapsed < 1200) {
    report.status = 'QUEUED'
    report.progress = 0
  } else if (elapsed < 6500) {
    report.status = 'RUNNING'
    report.progress = Math.min(92, Math.round(((elapsed - 1200) / 5300) * 92))
  } else if (elapsed < 8200) {
    report.status = 'SCORING'
    report.progress = 96
  } else if (report.shouldFail) {
    report.status = 'FAILED'
    report.progress = 100
    report.failureReason = 'Webhook 服务连续重试后仍未返回有效响应'
    report.completedAt = nowIso()
  } else {
    report.status = 'COMPLETED'
    report.progress = 100
    report.completedAt = nowIso()
    buildReportResults(report)
  }
  return report
}

function selectedReports(req: any) {
  const ids = Array.isArray(body(req).reportIds) ? body(req).reportIds : []
  return db.experimentReports
    .map(progressReport)
    .filter(
      (report: any) =>
        ids.includes(report.id) && report.projectId === projectId(req)
    )
}

function baselineScope(report: any) {
  return {
    projectId: report.projectId,
    datasetId: report.datasetId,
    sceneId: report.sceneId,
    serviceFamily: report.webhookSnapshot?.serviceFamily,
  }
}

function isSameBaselineScope(baseline: any, scope: any) {
  return (
    baseline.projectId === scope.projectId &&
    baseline.datasetId === scope.datasetId &&
    baseline.sceneId === scope.sceneId &&
    baseline.serviceFamily === scope.serviceFamily
  )
}

export default [
  {
    url: '/api/projects/:projectId/datasets/:datasetId/experiment-report-baselines',
    method: 'get',
    response: (req: any) =>
      success(
        db.experimentReportBaselines.filter(
          (baseline: any) =>
            baseline.projectId === projectId(req) &&
            baseline.datasetId === datasetId(req)
        )
      ),
  },
  {
    url: '/api/projects/:projectId/experiment-report-baselines',
    method: 'put',
    response: (req: any) => {
      const report = db.experimentReports
        .map(progressReport)
        .find(
          (item: any) =>
            item.id === body(req).reportId &&
            item.projectId === projectId(req)
        )
      if (!report) return failure(2003, '试验报告不存在')
      if (report.status !== 'COMPLETED') {
        return failure(2010, '仅已完成报告可设为基线')
      }

      const scope = baselineScope(report)
      if (!scope.datasetId || !scope.sceneId || !scope.serviceFamily) {
        return failure(2011, '试验报告缺少基线作用域信息')
      }

      const existingIndex = db.experimentReportBaselines.findIndex(
        (baseline: any) => isSameBaselineScope(baseline, scope)
      )
      const updatedAt = nowIso()
      if (existingIndex >= 0) {
        db.experimentReportBaselines[existingIndex] = {
          ...db.experimentReportBaselines[existingIndex],
          reportId: report.id,
          updatedAt,
        }
        return success(db.experimentReportBaselines[existingIndex])
      }

      const baseline = {
        id: id('experiment_report_baseline'),
        ...scope,
        reportId: report.id,
        createdAt: updatedAt,
        updatedAt,
      }
      db.experimentReportBaselines.unshift(baseline)
      return success(baseline)
    },
  },
  {
    url: '/api/projects/:projectId/experiment-reports/aggregate',
    method: 'post',
    response: (req: any) => {
      const reports = selectedReports(req)
      if (
        reports.length < 2 ||
        reports.some((report: any) => report.status !== 'COMPLETED') ||
        reports.some(
          (report: any) => report.datasetId !== reports[0]?.datasetId
        ) ||
        reports.some(
          (report: any) =>
            report.experimentGroupId !== reports[0]?.experimentGroupId
        )
      ) {
        return failure(2001, '聚合报告需要选择同一次试验的至少两份已完成报告')
      }
      const averages = reports.map((report: any) => ({
        id: report.id,
        value:
          report.scoreResults.reduce((sum: number, score: any) => sum + score.value, 0) /
          Math.max(1, report.scoreResults.length),
      }))
      const best = averages.sort((a: any, b: any) => b.value - a.value)[0]
      return success({
        title: `${reports[0].experimentName} · 聚合报告`,
        reports,
        bestReportId: best?.id ?? reports[0].id,
        differenceItemCount: Math.max(1, Math.round(reports[0].itemCount * 0.18)),
        insight: [
          `${reports.find((report: any) => report.id === best?.id)?.webhookSnapshot.name} 综合评分最高。`,
          '准确性差异主要集中在多轮上下文和事实检索问题。',
          '各服务安全性接近，未发现新增高风险退化项。',
        ],
      })
    },
  },
  {
    url: '/api/projects/:projectId/experiment-reports/compare',
    method: 'post',
    response: (req: any) => {
      const reports = selectedReports(req)
      if (
        reports.length < 2 ||
        reports.some((report: any) => report.status !== 'COMPLETED') ||
        reports.some(
          (report: any) => report.datasetId !== reports[0]?.datasetId
        ) ||
        reports.some((report: any) => report.sceneId !== reports[0]?.sceneId) ||
        reports.some(
          (report: any) =>
            report.webhookSnapshot.serviceFamily !==
            reports[0]?.webhookSnapshot.serviceFamily
        )
      ) {
        return failure(2002, '对比分析需要选择同一场景、同一服务系列的至少两份已完成报告')
      }
      const keys = Array.from(
        new Set(
          reports.flatMap((report: any) =>
            report.scoreResults.map((score: any) => score.key)
          )
        )
      )
      const scoreRows = keys.map((key) => {
        const firstScore = reports
          .flatMap((report: any) => report.scoreResults)
          .find((score: any) => score.key === key)
        const values = Object.fromEntries(
          reports.map((report: any) => [
            report.id,
            report.scoreResults.find((score: any) => score.key === key)?.value ?? 0,
          ])
        )
        return {
          key,
          label: firstScore?.scoreName ?? key,
          evaluatorName: firstScore?.evaluatorName ?? '',
          values,
          bestValue: Math.max(...Object.values(values).map(Number)),
        }
      })
      return success({
        title: `${reports[0].webhookSnapshot.serviceFamily} · 版本对比`,
        reports,
        scoreRows,
        insight: [
          '最新版本在主要评分维度中保持领先。',
          '准确性提升最明显，安全性维度保持稳定。',
          '建议将最佳版本作为候选基线，并保留旧版本用于回归。',
        ],
      })
    },
  },
  {
    url: '/api/projects/:projectId/experiment-reports/:reportId',
    method: 'get',
    response: (req: any) => {
      const reportId = segmentAfter(req, 'experiment-reports')
      const report = db.experimentReports.find(
        (item: any) =>
          item.id === reportId && item.projectId === projectId(req)
      )
      return report ? success(progressReport(report)) : failure(2003, '试验报告不存在')
    },
  },
  {
    url: '/api/projects/:projectId/datasets/:datasetId/experiment-reports',
    method: 'get',
    response: (req: any) => {
      const rows = db.experimentReports
        .filter(
          (report: any) =>
            report.projectId === projectId(req) && report.datasetId === datasetId(req)
        )
        .map(progressReport)
        .filter((report: any) => keywordIncludes(report, req.query?.keyword))
        .sort(
          (a: any, b: any) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      return success(paginate(rows, req.query, 10))
    },
  },
  {
    url: '/api/projects/:projectId/datasets/:datasetId/experiments',
    method: 'post',
    response: (req: any) => {
      const input = body(req)
      const scene = db.scenes.find(
        (item: any) => item.id === input.sceneId && item.projectId === projectId(req)
      )
      if (!scene?.enabled) return failure(2004, '所选场景不可用')
      const webhooks = scene.webhooks.filter((item: any) =>
        input.webhookIds?.includes(item.id)
      )
      const requestedEvaluatorIds = Array.isArray(input.evaluatorIds)
        ? input.evaluatorIds
        : []
      const evaluators = db.evaluators.filter((item: any) =>
        input.evaluatorIds?.includes(item.id)
      )
      if (!webhooks.length || requestedEvaluatorIds.length === 0) {
        return failure(2005, '请至少选择一个 Webhook 服务和一个评估器')
      }
      if (evaluators.length !== requestedEvaluatorIds.length) {
        return failure(2007, '所选评估器不存在')
      }
      if (evaluators.some((item: any) => item.projectId !== projectId(req))) {
        return failure(2008, '所选评估器不属于当前项目')
      }
      const createdAt = nowIso()
      const group = {
        id: id('experiment_group'),
        projectId: projectId(req),
        datasetId: datasetId(req),
        name: input.name,
        description: input.description ?? '',
        sceneId: scene.id,
        sceneSnapshot: structuredClone(scene),
        evaluatorSnapshots: evaluators.map(evaluatorSnapshot),
        runParameters: input.runParameters,
        createdAt,
      }
      db.experimentGroups.unshift(group)
      const reports = webhooks.map((webhook: any, serviceIndex: number) => ({
        id: id('experiment_report'),
        projectId: group.projectId,
        datasetId: group.datasetId,
        experimentGroupId: group.id,
        experimentName: group.name,
        name: `${group.name} - ${webhook.name}`,
        sceneId: scene.id,
        sceneSnapshot: structuredClone(scene),
        webhookSnapshot: structuredClone(webhook),
        evaluatorSnapshots: evaluators.map(evaluatorSnapshot),
        runParameters: input.runParameters,
        status: 'QUEUED',
        progress: 0,
        itemCount: db.datasetItems.filter(
          (item: any) => item.datasetId === group.datasetId && item.status === 'ACTIVE'
        ).length,
        successfulItemCount: 0,
        failedItemCount: 0,
        scoreResults: createScoreResults(evaluators, serviceIndex),
        roundResults: [],
        itemResults: [],
        insight: '试验完成后生成智能聚合结论。',
        createdAt,
      }))
      db.experimentReports.unshift(...reports)
      return success({ group, reports })
    },
  },
  {
    url: '/api/projects/:projectId/scenes/:sceneId',
    method: 'get',
    response: (req: any) => {
      const scene = db.scenes.find(
        (item: any) =>
          item.projectId === projectId(req) && item.id === pathParam(req, 'sceneId')
      )
      return scene ? success(sceneDetail(scene)) : failure(2006, '场景不存在')
    },
  },
  {
    url: '/api/projects/:projectId/scenes/:sceneId',
    method: 'patch',
    response: (req: any) => {
      const index = db.scenes.findIndex(
        (item: any) =>
          item.projectId === projectId(req) && item.id === pathParam(req, 'sceneId')
      )
      if (index < 0) return failure(2006, '场景不存在')
      db.scenes[index] = {
        ...db.scenes[index],
        ...body(req),
        updatedAt: nowIso(),
      }
      return success(sceneDetail(db.scenes[index]))
    },
  },
  {
    url: '/api/projects/:projectId/scenes/:sceneId',
    method: 'delete',
    response: (req: any) => {
      const sceneId = pathParam(req, 'sceneId')
      db.scenes = db.scenes.filter((item: any) => item.id !== sceneId)
      return success({ id: sceneId })
    },
  },
  {
    url: '/api/projects/:projectId/scenes',
    method: 'get',
    response: (req: any) => {
      const enabled = req.query?.enabled
      const rows = db.scenes
        .filter((scene: any) => scene.projectId === projectId(req))
        .filter((scene: any) => keywordIncludes(scene.name, req.query?.keyword))
        .filter(
          (scene: any) =>
            enabled === undefined || String(scene.enabled) === String(enabled)
        )
        .sort(
          (a: any, b: any) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
      return success(paginate(rows, req.query, 10))
    },
  },
  {
    url: '/api/projects/:projectId/scenes',
    method: 'post',
    response: (req: any) => {
      const input = body(req)
      const scene = {
        id: id('scene'),
        projectId: projectId(req),
        name: input.name,
        description: input.description ?? '',
        enabled: input.enabled ?? true,
        supportsScheduledExecution:
          input.supportsScheduledExecution ?? false,
        defaultScheduledWebhookIds: input.defaultScheduledWebhookIds ?? [],
        datasetId: input.datasetId ?? '',
        evaluatorIds: input.evaluatorIds ?? [],
        webhooks: input.webhooks ?? [],
        runParameters: input.runParameters ?? {
          concurrency: 5,
          timeoutSeconds: 30,
          retryCount: 2,
          rounds: 1,
        },
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      db.scenes.unshift(scene)
      return success(sceneDetail(scene))
    },
  },
]
