# Project API Keys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 项目设置 API Keys 使用真实数据，按项目保存可重复查看的 `LANGFUSE_PUBLIC_KEY` 和 `LANGFUSE_SECRET_KEY`。

**Architecture:** 后端在 PA 自定义表 `pa_project_api_keys` 中保存项目密钥，接口挂在 `/api/projects/{projectId}/settings/api-keys`。前端项目设置 API Keys 页通过统一 API client 查询、创建、更新备注和删除，不再使用 mock 数据。

**Tech Stack:** FastAPI、psycopg、Alembic、React、TanStack Query、TypeScript、shadcn/ui。

## Global Constraints

- 不修改 `langfuse/` 目录。
- 不修改 Langfuse 原生表结构。
- 新增 PA 表必须以 `pa_` 开头。
- 新增 PA 表包含 `create_by`、`create_date`、`update_by`、`update_date`，且 `create_date`、`update_date` 默认当前时间。
- API 响应格式使用 `{ code, message, data, txId }`。
- 分页参数使用 `page`、`pageSize`，分页响应 `data` 使用 `{ total, datas }`。
- 不自动提交或推送代码。

---

### Task 1: 后端项目 API Keys 表和接口

**Files:**
- Modify: `pa-eval-backend/migrations/versions/20260705_0001_create_pa_eval_tables.py`
- Modify: `pa-eval-backend/app/langfuse_db.py`
- Modify: `pa-eval-backend/app/projects.py`
- Test: `pa-eval-backend/tests/test_project_api_keys.py`
- Test: `pa-eval-backend/tests/test_pa_migration_schema.py`

**Interfaces:**
- Produces: `GET /api/projects/{project_id}/settings/api-keys`
- Produces: `POST /api/projects/{project_id}/settings/api-keys`
- Produces: `PATCH /api/projects/{project_id}/settings/api-keys/{key_id}`
- Produces: `DELETE /api/projects/{project_id}/settings/api-keys/{key_id}`
- Produces payload fields: `id`, `projectId`, `note`, `publicKey`, `secretKey`, `status`, `lastUsedAt`, `createdAt`, `updatedAt`

- [ ] **Step 1: Write failing backend tests**

Add tests that override `get_current_user_context` and `get_langfuse_db_reader`, then assert list/create/update/delete endpoints return real payloads and include full `secretKey` on repeated list calls.

- [ ] **Step 2: Run red tests**

Run: `uv run pytest tests/test_project_api_keys.py -q`

Expected: FAIL because routes/methods do not exist yet.

- [ ] **Step 3: Add migration table**

Add `pa_project_api_keys` with `id`, `project_id`, `note`, `public_key`, `secret_key`, `status`, `last_used_at`, audit columns, and project/status indexes.

- [ ] **Step 4: Add database methods and routes**

Add CRUD methods to `LangfuseDatabaseReader` and route functions in `projects.py`. Generate keys as `pk-lf-{uuid}` and `sk-lf-{uuid}`. Use physical delete.

- [ ] **Step 5: Run green tests**

Run: `uv run pytest tests/test_project_api_keys.py tests/test_pa_migration_schema.py -q`

Expected: PASS.

### Task 2: 前端项目设置 API Keys 接口化

**Files:**
- Modify: `pa-eval-frontend/src/api/registry.ts`
- Modify: `pa-eval-frontend/src/modules/project-settings/types.ts`
- Create: `pa-eval-frontend/src/modules/project-settings/api/api-keys-api.ts`
- Modify: `pa-eval-frontend/src/modules/project-settings/views/api-keys.tsx`
- Test: `pa-eval-frontend/src/modules/project-settings/api/api-keys-api.test.ts`

**Interfaces:**
- Consumes: 后端 Task 1 API。
- Produces: API Keys 页面真实列表、创建、备注更新、删除、复制密钥。

- [ ] **Step 1: Write failing frontend API test**

Assert create sends `{ note }`, update sends `{ note }`, and list uses `page/pageSize`.

- [ ] **Step 2: Run red test**

Run: `node --test src/modules/project-settings/api/api-keys-api.test.ts`

Expected: FAIL because API wrapper does not exist.

- [ ] **Step 3: Implement API wrapper and registry**

Add project settings API key endpoints to `apiRegistry` and wrapper functions.

- [ ] **Step 4: Replace mock UI state**

Use TanStack Query for list/create/update/delete. Show full `secretKey` in the table with copy buttons. Keep a visible warning that Secret 可重复查看但需妥善保管。

- [ ] **Step 5: Run frontend checks**

Run: `node --test src/modules/project-settings/api/api-keys-api.test.ts`
Run: `npm run typecheck`
Run: `npm run lint`

Expected: tests/typecheck pass; lint has no new errors.

### Task 3: Local migration and browser verification

**Files:**
- No source files unless verification finds bugs.

**Interfaces:**
- Consumes: backend and frontend changes from Tasks 1-2.

- [ ] **Step 1: Apply idempotent migration locally**

Run: `uv run alembic stamp base && uv run alembic upgrade head`

Expected: existing PA tables remain, missing `pa_project_api_keys` is created.

- [ ] **Step 2: Restart backend if needed**

Run backend on `http://localhost:8000`.

- [ ] **Step 3: Browser verify**

Open `http://localhost:5173/projects/cmqoenkom000dry080q62b5kq/settings/api-keys`, create a key, confirm both `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` can be viewed again after refresh, update note, then delete it.

- [ ] **Step 4: Full verification**

Run backend tests, backend ruff, frontend typecheck, frontend lint, frontend build.

