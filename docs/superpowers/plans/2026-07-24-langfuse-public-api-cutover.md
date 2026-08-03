# Langfuse Public API Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve all PA API contracts while making Langfuse the sole fact source and sink for evaluation business entities.

**Architecture:** Extend the typed `LangfusePublicClient`, then replace route dependencies domain by domain with small adapters. PA persistence remains only for authentication, audit, reporting, export and scheduling control state; unsupported native mutations fail closed without SQL fallback.

**Tech Stack:** Python 3.11, FastAPI, httpx, Pydantic, pytest, uv, Langfuse Public API/SDK.

## Global Constraints

- Do not modify `langfuse/` or `dify/`.
- Do not commit, push or create a PR unless the user explicitly requests it.
- Use `uv` for Python commands and dependency management.
- Keep configuration and credentials in environment variables.
- Preserve existing PA routes and response envelopes.
- Never write Langfuse native tables through SQL.
- Write and observe a failing test before each production behavior change.

---

### Task 1: Typed Public API foundation

**Files:**
- Modify: `pa-eval-backend/app/langfuse/public_client.py`
- Modify: `pa-eval-backend/app/config.py`
- Test: `pa-eval-backend/tests/test_langfuse_public_client.py`

**Interfaces:**
- Produces project-authenticated methods for traces, observations v2 and metrics v2.
- Produces generic safe request/error and pagination behavior reused by later tasks.

- [ ] Add failing contract tests for exact method, path, auth, query encoding and error translation.
- [ ] Run `uv run pytest tests/test_langfuse_public_client.py -q` and verify the new cases fail because methods are missing.
- [ ] Implement the minimal client methods and bounded pagination helpers.
- [ ] Run the focused tests and `uv run python -m compileall app`.

### Task 2: Observability read cutover

**Files:**
- Modify: `pa-eval-backend/app/observability.py`
- Create: `pa-eval-backend/app/langfuse/observability_adapter.py`
- Test: `pa-eval-backend/tests/test_observability.py`

**Interfaces:**
- Consumes Task 1 trace/observation/metrics methods.
- Produces current trace list/detail/observation/metrics DTOs without direct ClickHouse/PostgreSQL reads.

- [ ] Add failing route tests proving Langfuse adapter usage and current response compatibility.
- [ ] Implement DTO/filter/pagination conversion and dependency wiring.
- [ ] Run `uv run pytest tests/test_observability.py tests/test_langfuse_public_client.py -q`.

### Task 3: Dataset read/write cutover

**Files:**
- Modify: `pa-eval-backend/app/langfuse/public_client.py`
- Create: `pa-eval-backend/app/langfuse/datasets_adapter.py`
- Modify: `pa-eval-backend/app/datasets.py`
- Test: `pa-eval-backend/tests/test_datasets.py`

**Interfaces:**
- Produces dataset v2 and dataset-item list/get/create/delete operations.
- Dataset item update/archive use the documented same-ID upsert; unsupported dataset-level update/delete raise stable capability errors and never call SQL.

- [ ] Add failing Public API and route contract tests.
- [ ] Implement client/adapter methods and route dependency wiring.
- [ ] Run focused dataset/export tests.

### Task 4: Annotation queues, score configs and scores cutover

**Files:**
- Modify: `pa-eval-backend/app/langfuse/public_client.py`
- Create: `pa-eval-backend/app/langfuse/annotations_adapter.py`
- Modify: `pa-eval-backend/app/annotations.py`
- Test: `pa-eval-backend/tests/test_annotations.py`

**Interfaces:**
- Produces queue/item/assignment, score-config and score API operations.
- Preserves PA weighted assignment only as control state linked to Langfuse queue/item IDs.

- [ ] Add failing client and route contract tests for every supported operation.
- [ ] Implement direct and aggregate adapters.
- [ ] Fail closed for queue update/delete and score-config archive/restore.
- [ ] Run annotation and export tests.

### Task 5: Organization, project and membership cutover

**Files:**
- Modify: `pa-eval-backend/app/langfuse/public_client.py`
- Create: `pa-eval-backend/app/langfuse/administration_adapter.py`
- Modify: `pa-eval-backend/app/organizations.py`
- Modify: `pa-eval-backend/app/projects.py`
- Test: `pa-eval-backend/tests/test_organizations.py`
- Test: `pa-eval-backend/tests/test_projects.py`

**Interfaces:**
- Superseded: current implementation cannot use Langfuse organization-scoped auth. Organization/project membership and project/API-key operations stay on the historical database-backed reader path.

- [ ] Add failing organization-auth and route compatibility tests.
- [ ] Implement organization-key isolation and project/member adapters.
- [ ] Keep organization CRUD and project archive/restore blocked without SQL fallback.
- [ ] Run organization/project/model-setting tests.

### Task 6: Evaluators, rules and experiment workflow cutover

**Files:**
- Modify: `pa-eval-backend/app/langfuse/public_client.py`
- Create: `pa-eval-backend/app/langfuse/evaluation_adapter.py`
- Modify: `pa-eval-backend/app/evaluators.py`
- Modify: `pa-eval-backend/app/auto_evaluations.py`
- Test: `pa-eval-backend/tests/test_evaluators.py`
- Test: `pa-eval-backend/tests/test_auto_evaluations.py`

**Interfaces:**
- Produces evaluator/rule CRUD, evaluator-version replacement and experiment/scores integration.

- [ ] Add failing evaluator/rule/experiment contract tests.
- [ ] Implement Langfuse evaluator as sole evaluator definition for supported types.
- [ ] Route realtime work to evaluation rules and historical work to SDK experiment workflow.
- [ ] Run evaluator, auto-evaluation, report and scheduler tests.

### Task 7: Remove native business writes and add guardrails

**Files:**
- Modify: `pa-eval-backend/app/langfuse_db.py`
- Modify: `pa-eval-backend/app/langfuse_clickhouse.py`
- Create: `pa-eval-backend/tests/test_no_langfuse_native_writes.py`
- Update: `codex-quality-system/IMPLEMENTATION_DECISIONS.md`

**Interfaces:**
- Produces a static regression test that rejects INSERT/UPDATE/DELETE against Langfuse native business tables.

- [ ] Add the failing static guard test with the explicit native-table denylist.
- [ ] Remove or isolate obsolete mutation methods until the guard passes.
- [ ] Confirm PA control-plane tables remain writable through SQLAlchemy/Alembic only.

### Task 8: Production verification

**Files:**
- Update: `docs/api/2026-07-23-langfuse-public-api-alignment.md`
- Update: `codex-quality-system/LANGFUSE_API_RESEARCH.md`
- Update: `codex-quality-system/IMPLEMENTATION_DECISIONS.md`

**Interfaces:**
- Produces test and deployment evidence for the complete cutover.

- [ ] Run `uv run pytest -q` and require zero failures.
- [ ] Run `uv run python -m compileall app`.
- [ ] Run the native-write guard and secret scan.
- [ ] Record supported, adapter, extension and blocked endpoints with verification evidence.
