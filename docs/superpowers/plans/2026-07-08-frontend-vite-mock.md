# Frontend Vite Mock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move frontend mock data into `pa-eval-frontend/mock` so `npm run dev:mock` can run without the backend for all non-download APIs in `src/api/registry.ts`.

**Architecture:** Use `vite-plugin-mock` route modules grouped by backend resource domain. Mock handlers return the backend envelope `{ code, message, data, txId }`, keep lightweight in-memory state for CRUD flows, and omit blob download behavior by design.

**Tech Stack:** Vite 8, vite-plugin-mock, TypeScript, React frontend API registry, Node built-in test runner for route coverage checks.

---

### Task 1: Add Mock Route Coverage Test

**Files:**
- Create: `pa-eval-frontend/src/tests/mock-api-registry-coverage.test.ts`

- [ ] Write a test that imports `apiRegistry`, scans `pa-eval-frontend/mock`, and verifies every non-blob endpoint has a matching `url` and `method`.
- [ ] Run the test and verify it fails because only `/api/permissions` is currently mocked.

### Task 2: Add Shared Mock Utilities

**Files:**
- Create: `pa-eval-frontend/mock/_utils.ts`

- [ ] Add `success`, `failure`, `paginate`, `nowIso`, `id`, and path/query/body helpers for vite-plugin-mock request handlers.
- [ ] Keep helper output aligned to backend response envelope.

### Task 3: Implement System, Organization, Project, Evaluator, and Settings Mocks

**Files:**
- Modify: `pa-eval-frontend/mock/permissions.ts`
- Create: `pa-eval-frontend/mock/system.ts`
- Create: `pa-eval-frontend/mock/organizations.ts`
- Create: `pa-eval-frontend/mock/projects.ts`
- Create: `pa-eval-frontend/mock/evaluators.ts`

- [ ] Cover `/permissions`, `/sidebar`, `/admin/overview`, `/audit-logs`.
- [ ] Cover organizations and organization members CRUD/import.
- [ ] Cover projects, project members, API keys, and model settings CRUD.
- [ ] Cover evaluator list/detail/create/delete.

### Task 4: Implement Observability and Evaluation Mocks

**Files:**
- Create: `pa-eval-frontend/mock/observability.ts`
- Create: `pa-eval-frontend/mock/datasets.ts`
- Create: `pa-eval-frontend/mock/annotations.ts`
- Create: `pa-eval-frontend/mock/auto-evaluations.ts`
- Create: `pa-eval-frontend/mock/evaluation-reports.ts`

- [ ] Cover trace metrics, trace list/detail/patch.
- [ ] Cover datasets, dataset items, metrics, and export job metadata. Do not implement blob download.
- [ ] Cover score configs, annotation users, queues, queue items, batch preview/save, and trace-to-dataset actions.
- [ ] Cover report templates, auto-evaluation tasks, summaries, runs, reports, badcases, and flowbacks.

### Task 5: Remove Mock Proxy and Resolve Legacy Mock Data

**Files:**
- Modify: `pa-eval-frontend/.env.mock`
- Modify or delete: `pa-eval-frontend/src/tests/mock-real-api-routes.test.ts`
- Delete or leave only non-mock schema/data files under `pa-eval-frontend/src/modules/**/data/mock-*`

- [ ] Remove `VITE_API_PROXY_TARGET` from `.env.mock`.
- [ ] Replace the old test that blocked `/api/projects`, `/api/organizations`, and `/api/sidebar`.
- [ ] Remove obsolete module mock data files only when no imports remain.

### Task 6: Verify

**Files:**
- All files touched above.

- [ ] Run the new mock route coverage test.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build` because Vite/env/mock behavior changed.
