# Scene Experiment Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:superpowers-subagent-driven-development (recommended) or superpowers:superpowers-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 PA Eval 前端与 `dev:mock` 中实现项目级场景管理、数据集场景试验、服务级报告、聚合报告和版本对比分析的完整高保真交互闭环。

**Architecture:** 新增 `scene-experiments` 项目级模块承载场景与试验领域类型、API 和页面；场景只保存 Webhook 服务与默认运行参数，评估器在每次试验中从当前项目动态选择。数据集详情仅组合该模块提供的试验抽屉和报告视图，不改现有数据项业务。Mock 层复用现有内存数据库与评估器、数据集数据，试验提交校验评估器项目归属、保存快照并按时间推进报告状态。

**Tech Stack:** React 19、TypeScript、React Router 8、React Query、TanStack Table、Tailwind CSS v4、shadcn/ui/Radix、Recharts、Vite Mock、Node test runner。

---

### Task 1: Domain Rules And Navigation

**Files:**

- Create: `pa-eval-frontend/src/tests/scene-experiments/domain-rules.test.ts`
- Create: `pa-eval-frontend/src/modules/scene-experiments/lib/experiment-rules.ts`
- Modify: `pa-eval-frontend/src/hooks/use-sidebar-data.test.ts`
- Modify: `pa-eval-frontend/src/lib/sidebar-data.ts`

- [ ] Write failing tests for report naming, score keys, estimated call count, aggregate eligibility, compare eligibility, and the new project sidebar item.
- [ ] Run the focused Node tests and confirm failures are caused by missing domain rules and navigation.
- [ ] Implement pure domain helpers and add the `场景管理` project-scoped sidebar link.
- [ ] Re-run focused tests and confirm they pass.

### Task 2: Mock Data And API Contract

**Files:**

- Create: `pa-eval-frontend/src/tests/scene-experiments/mock-contract.test.ts`
- Create: `pa-eval-frontend/mock/scene-experiments.ts`
- Modify: `pa-eval-frontend/mock/_data.ts`
- Modify: `pa-eval-frontend/mock/_utils.ts`
- Modify: `pa-eval-frontend/src/api/registry.ts`
- Create: `pa-eval-frontend/src/modules/scene-experiments/api/scene-experiment-api.ts`
- Create: `pa-eval-frontend/src/modules/scene-experiments/types.ts`

- [ ] Write failing tests for seeded scenes without evaluator bindings, default execution round, API aliases, current-project evaluator validation, report snapshots, and status progression.
- [ ] Run tests and confirm the new contract is absent.
- [ ] Add typed entities, seed data, Mock CRUD endpoints, experiment creation, report list/detail, aggregate, and compare endpoints.
- [ ] Add frontend API aliases and typed request helpers.
- [ ] Re-run focused tests and confirm they pass.

### Task 3: Scene Management Module

**Files:**

- Create: `pa-eval-frontend/src/modules/scene-experiments/components/scene-columns.tsx`
- Create: `pa-eval-frontend/src/modules/scene-experiments/components/scene-form-drawer.tsx`
- Create: `pa-eval-frontend/src/modules/scene-experiments/components/scene-status-badge.tsx`
- Create: `pa-eval-frontend/src/modules/scene-experiments/views/scenes.tsx`
- Create: `pa-eval-frontend/src/modules/scene-experiments/views/scene-detail.tsx`
- Modify: `pa-eval-frontend/src/routes/lazy-pages.tsx`
- Modify: `pa-eval-frontend/src/routes/sidebar-routes.tsx`

- [ ] Write source/route tests that require the scene routes, three-step drawer, no evaluator column or binding UI, default execution round, and list actions.
- [ ] Run tests and confirm failures.
- [ ] Implement the scene list with search, status filtering, enable switch, row actions, and deletion confirmation.
- [ ] Implement the independent detail page with Webhooks and four default run parameters, without evaluator summaries.
- [ ] Implement the create/edit enhanced Drawer with three-step validation and no evaluator query or selection.
- [ ] Re-run focused tests and confirm they pass.

### Task 4: Dataset Experiment Wizard And Report Tab

**Files:**

- Create: `pa-eval-frontend/src/modules/scene-experiments/components/experiment-run-drawer.tsx`
- Create: `pa-eval-frontend/src/modules/scene-experiments/components/experiment-report-columns.tsx`
- Create: `pa-eval-frontend/src/modules/scene-experiments/components/dataset-experiment-reports.tsx`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/views/dataset-detail.tsx`

- [ ] Write source tests requiring the `场景试验` action, `试验报告` tab, five steps, current-project evaluator filtering, explicit multi-select, execution round, and call-count summary.
- [ ] Run tests and confirm failures.
- [ ] Add the data-items/reports tab shell without changing existing item CRUD behavior.
- [ ] Implement the five-step experiment Drawer, query evaluator candidates independently from the scene, retain only records whose `projectId` equals the current project ID, and submit selected evaluator IDs.
- [ ] Implement the report table, polling, status badges, score chips, multi-selection, and analysis actions.
- [ ] Re-run focused tests and confirm they pass.

### Task 5: Report Detail And Analysis Pages

**Files:**

- Create: `pa-eval-frontend/src/modules/scene-experiments/views/experiment-report-detail.tsx`
- Create: `pa-eval-frontend/src/modules/scene-experiments/views/experiment-aggregate.tsx`
- Create: `pa-eval-frontend/src/modules/scene-experiments/views/experiment-compare.tsx`
- Modify: `pa-eval-frontend/src/routes/lazy-pages.tsx`
- Modify: `pa-eval-frontend/src/routes/sidebar-routes.tsx`

- [ ] Write route/source tests for report detail, aggregate, compare, and score difference highlighting.
- [ ] Run tests and confirm failures.
- [ ] Implement service-level report detail with summary, scores, round stability, item results, and failures.
- [ ] Implement aggregate page with metric summaries, score chart, and Mock insight text.
- [ ] Implement compare page with horizontal score matrix and `0.03` difference highlighting.
- [ ] Re-run focused tests and confirm they pass.

### Task 6: Verification And Visual QA

**Files:**

- Modify only files required by defects found during verification.

- [ ] Run all focused Node tests for the new module and navigation.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Restart the frontend with `npm run dev:mock` through the managed service session.
- [ ] Verify scene CRUD, five-step run, status progression, report detail, aggregate, and compare in the browser on desktop and mobile widths.
- [ ] Inspect the final Git diff and confirm no backend, `langfuse/`, or `dify/` files changed.
