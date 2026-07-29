# Experiment Report Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:superpowers-subagent-driven-development (recommended) or superpowers:superpowers-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在数据集试验报告列表中实现独立 Mock 基线关系、设置/替换弹窗和一键“对比基线”流程。

**Architecture:** 使用独立 `ExperimentReportBaseline` 记录表达 `projectId + datasetId + sceneId + serviceFamily` 唯一基线，不修改报告实体。列表容器查询报告与基线、执行 Mutation；列定义只渲染行状态；设置后复用现有对比分析路由与 API。

**Tech Stack:** React 19、TypeScript、React Query、TanStack Table、Tailwind CSS v4、shadcn/ui `FormDialog`、Vite Mock、Node test runner。

---

### Task 1: Baseline Domain Rules

**Files:**

- Modify: `pa-eval-frontend/src/tests/scene-experiments/domain-rules.test.ts`
- Modify: `pa-eval-frontend/src/modules/scene-experiments/lib/experiment-rules.ts`
- Modify: `pa-eval-frontend/src/modules/scene-experiments/types.ts`

- [x] Add failing tests for `buildExperimentBaselineScopeKey`, `findMatchingBaseline`, current-baseline detection, and non-matching scene/service-family behavior.
- [x] Run `node --test src/tests/scene-experiments/domain-rules.test.ts` and confirm failure is caused by missing baseline helpers/types.
- [x] Add `ExperimentReportBaseline` and implement the pure baseline helper functions with exact `datasetId + sceneId + serviceFamily` semantics.
- [x] Re-run the focused test and confirm it passes.

### Task 2: Mock Baseline Contract

**Files:**

- Modify: `pa-eval-frontend/src/tests/scene-experiments/mock-contract.test.ts`
- Modify: `pa-eval-frontend/mock/scene-experiment-seed.ts`
- Modify: `pa-eval-frontend/mock/_data.ts`
- Modify: `pa-eval-frontend/mock/scene-experiments.ts`
- Modify: `pa-eval-frontend/src/api/registry.ts`
- Modify: `pa-eval-frontend/src/modules/scene-experiments/api/scene-experiment-api.ts`

- [x] Add failing tests that require seeded baseline data, GET/PUT aliases and routes, completed-report validation, same-scope replacement, and isolation across different scopes.
- [x] Run `node --test src/tests/scene-experiments/mock-contract.test.ts` and confirm the new contract is absent.
- [x] Seed one `support-agent` baseline and expose it through `db.experimentReportBaselines`.
- [x] Add `GET /api/projects/:projectId/datasets/:datasetId/experiment-report-baselines` and `PUT /api/projects/:projectId/experiment-report-baselines` Mock handlers.
- [x] Add registry aliases `getExperimentReportBaselines` and `setExperimentReportBaseline` plus typed API helper functions.
- [x] Re-run the focused contract test and confirm replacement, validation, and scope isolation pass.

### Task 3: Baseline Dialog And Row Actions

**Files:**

- Modify: `pa-eval-frontend/src/tests/scene-experiments/dataset-experiment-source.test.ts`
- Create: `pa-eval-frontend/src/modules/scene-experiments/components/experiment-baseline-dialog.tsx`
- Modify: `pa-eval-frontend/src/modules/scene-experiments/components/experiment-report-columns.tsx`

- [x] Add failing source assertions for `ExperimentBaselineDialog`, `设为基线`, `当前基线`, `对比基线`, `设为新基线`, removal of `ArrowUpRight`, fixed `w-[94px]`, and fixed action-column width.
- [x] Run `node --test src/tests/scene-experiments/dataset-experiment-source.test.ts` and confirm failure.
- [x] Implement the module-private `FormDialog` summary for new and replacement baselines, including old/new report summaries and pending confirm state.
- [x] Change the column factory to receive baselines plus `onSetBaseline` and `onCompareBaseline` callbacks, remove the old view icon, and render three unified operations only for completed reports. For reports with another baseline, use a fixed-width split button whose left side compares and whose right-side menu opens `设为新基线`.
- [x] Re-run the focused source test and confirm it passes.

### Task 4: List Data Flow And Navigation

**Files:**

- Modify: `pa-eval-frontend/src/tests/scene-experiments/dataset-experiment-source.test.ts`
- Modify: `pa-eval-frontend/src/modules/scene-experiments/components/dataset-experiment-reports.tsx`

- [x] Add failing assertions for baseline query, baseline mutation, query invalidation, success toasts, dialog wiring, and `reportIds=${baseline.id},${report.id}` comparison navigation.
- [x] Run the focused test and confirm the data flow is missing.
- [x] Query the dataset baselines, build the enriched columns, manage the selected report and matching old baseline, and wire the set/replace Mutation.
- [x] On success, close the dialog, show the correct success toast, invalidate baseline/report queries, and update every matching historical row immediately.
- [x] Navigate “对比基线” to the existing compare route with baseline ID first and current report ID second.
- [x] Re-run the focused test and confirm it passes.

### Task 5: Verification And Visual QA

**Files:**

- Modify only files required by defects found during verification.

- [x] Run `node --test src/tests/scene-experiments/*.test.ts`.
- [x] Run `npm run typecheck`.
- [x] Run `npm run lint`（已运行；两处非本次文件的既有错误阻断全量通过）。
- [x] Run `npm run build`.
- [x] Start or reuse `npm run dev:mock` and verify desktop behavior at the dataset reports URL.
- [x] Verify `设为基线`, replacement summary, `当前基线`, immediate historical-row updates, `对比基线` navigation, and the `设为新基线` split-button menu.
- [x] Verify a mobile viewport has no overlapping button, dialog, table, or text content.
- [x] Inspect `git diff --check` and `git status --short`; confirm no backend, `langfuse/`, or `dify/` files changed and no commit was created.

## Plan Self-Review

- Every confirmed design requirement maps to Tasks 1-5.
- Types and helper names are consistent across the plan.
- The plan contains no placeholder or deferred implementation item.
- Automatic commit steps are intentionally omitted to comply with the project rule forbidding commits unless explicitly requested.
