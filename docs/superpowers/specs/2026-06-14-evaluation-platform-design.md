# Evaluation Platform Design

Date: 2026-06-14

## Goal

Build a platform-grade evaluation system based on the high-fidelity UI in
`Enterprise Admin Dashboard DesignV3`.

The platform is an independent frontend/backend service that connects to a
source-deployed Langfuse instance. It must prefer Langfuse public APIs for
Trace, Dataset, Evaluator, Rule, and Score operations. It must not modify
Langfuse table structures. Platform-owned state may be stored in new tables in
the same Langfuse Postgres database, using an `eval_platform_*` prefix.

The first production workflow is:

1. Select and filter Langfuse Traces.
2. Create an evaluation task from selected or sampled Traces.
3. Execute evaluations in the Python platform worker.
4. Write results back to Langfuse through the Scores API.
5. Display progress, reports, score distribution, and Bad Cases in the
   Enterprise Admin Dashboard UI.

## Confirmed Decisions

- Architecture: independent platform, frontend/backend separated.
- Langfuse deployment: source deployment, with its existing web, worker,
  Postgres, ClickHouse, Redis, and object storage stack.
- Backend: Python FastAPI.
- Worker model: modular monolith API with asynchronous worker queue.
- Database: same Langfuse Postgres, but only new `eval_platform_*` tables.
- Execution: Python platform executes evaluations, then writes scores to
  Langfuse.
- Authentication: platform-owned users, roles, and project access.
- Evaluation types in first version: LLM Judge, simple rule evaluators, and an
  adapter for a selected set of OpenJudge built-in graders.

## Non-Goals

- Do not modify existing Langfuse tables or migrations.
- Do not depend on Langfuse web sessions for platform authentication.
- Do not implement the full manual annotation workflow in the first release.
- Do not split the platform into multiple services before the core evaluation
  workflow is proven.
- Do not let the frontend call Langfuse APIs directly.

## Architecture

The platform uses a modular monolith backend plus an async worker.

Frontend:

- React app based on `Enterprise Admin Dashboard DesignV3`.
- Uses the existing navigation structure: projects, traces, evaluation tasks,
  evaluators, datasets, settings, users, tenants, and system settings.
- Calls only the platform FastAPI backend.

Backend:

- FastAPI REST API.
- Modules:
  - `auth`: platform users, roles, sessions, and authorization.
  - `projects`: platform project and Langfuse project mappings.
  - `langfuse_client`: API client and read-only fallback repositories.
  - `traces`: Trace search, filtering, detail loading, and sampling.
  - `datasets`: Langfuse Dataset listing and dataset-related actions.
  - `evaluators`: LLM Judge, rule, and OpenJudge evaluator definitions.
  - `tasks`: evaluation task lifecycle.
  - `workers`: async execution orchestration.
  - `reports`: aggregation, Bad Case extraction, and report snapshots.
  - `audit`: platform operation logging.

Worker:

- Processes queued task items.
- Supports concurrency, retries, cancellation, and future pause/resume.
- Executes evaluations through a common evaluator interface.
- Writes results to Langfuse Scores API.
- Updates platform task/item/report tables.

Infrastructure:

- Langfuse remains source-deployed with its own services.
- Platform compose adds `frontend`, `api`, and `worker`.
- Platform API and worker connect to the same Postgres and Redis as Langfuse,
  but own only the `eval_platform_*` tables and queues.
- Alembic manages only platform-owned tables.

## Data Ownership

Langfuse remains the source of truth for:

- Projects and API credentials on the Langfuse side.
- Traces, Observations, Sessions, and ingestion data.
- Datasets and Dataset Runs where Langfuse APIs cover the workflow.
- Scores written by the evaluation platform.
- Native Langfuse evaluator metadata when the platform syncs or references it.

The evaluation platform is the source of truth for:

- Platform users, roles, and project permissions.
- Langfuse connection mappings.
- Evaluation task definitions and execution status.
- Evaluator definitions owned by the platform.
- Per-task execution item state.
- Report snapshots and Bad Case lists.
- Platform audit logs.

## Proposed Tables

All platform tables use the `eval_platform_*` prefix.

### `eval_platform_users`

Stores platform users, roles, and account status.

Core fields:

- `id`
- `email`
- `name`
- `password_hash` or external identity reference
- `role`
- `status`
- `created_at`
- `updated_at`

### `eval_platform_projects`

Maps a platform project to a Langfuse project.

Core fields:

- `id`
- `name`
- `description`
- `langfuse_base_url`
- `langfuse_project_id`
- `langfuse_public_key`
- `langfuse_secret_key_encrypted`
- `status`
- `created_by`
- `created_at`
- `updated_at`

### `eval_platform_evaluators`

Stores platform evaluator definitions.

Core fields:

- `id`
- `project_id`
- `name`
- `type`: `llm_judge`, `rule`, or `openjudge`
- `status`
- `config_json`
- `output_schema_json`
- `created_by`
- `created_at`
- `updated_at`

### `eval_platform_tasks`

Stores the evaluation task lifecycle and configuration.

Core fields:

- `id`
- `project_id`
- `name`
- `description`
- `status`: `pending`, `running`, `completed`, `failed`, `cancelled`
- `source_type`: `trace` initially; dataset support can reuse the field later
- `trace_filter_json`
- `sampling_strategy_json`
- `evaluator_id`
- `runtime_config_json`: concurrency, retries, cache policy, timeout
- `total_items`
- `completed_items`
- `failed_items`
- `created_by`
- `started_at`
- `completed_at`
- `created_at`
- `updated_at`

### `eval_platform_task_items`

Stores execution state for each Trace or Observation evaluated by a task.

Core fields:

- `id`
- `task_id`
- `project_id`
- `langfuse_trace_id`
- `langfuse_observation_id`
- `status`: `pending`, `running`, `completed`, `failed`, `cancelled`
- `attempt_count`
- `evaluation_input_json`
- `score`
- `passed`
- `reason`
- `dimension_scores_json`
- `metadata_json`
- `error_type`
- `error_message`
- `langfuse_score_id`
- `created_at`
- `updated_at`

### `eval_platform_reports`

Stores report snapshots for task detail and analytics pages.

Core fields:

- `id`
- `task_id`
- `project_id`
- `summary_json`
- `score_distribution_json`
- `dimension_radar_json`
- `bad_cases_json`
- `generated_at`
- `created_at`
- `updated_at`

### `eval_platform_audit_logs`

Stores platform-level operations.

Core fields:

- `id`
- `project_id`
- `user_id`
- `resource_type`
- `resource_id`
- `action`
- `before_json`
- `after_json`
- `created_at`

### Reserved Future Tables

- `eval_platform_dataset_views`: stores platform-only dataset category, labels,
  and version notes without copying Langfuse Dataset contents.
- `eval_platform_eval_runs`: separates repeat executions from task definitions
  if comparison workflows require multiple runs per task.

## Core Workflow

### 1. Connect Project

An admin creates a platform project and stores the Langfuse base URL, project
id, public key, and encrypted secret key. The backend validates the connection
through a Langfuse API call before marking the project active.

### 2. Filter Traces

The Trace page sends filter criteria to the platform backend. The backend first
uses Langfuse APIs. If a read path is not available through public APIs, the
backend may use a read-only repository against Langfuse storage. This fallback
must not modify Langfuse tables.

### 3. Create Task

The user selects Traces directly or configures sampling. The backend creates an
`eval_platform_tasks` row and one `eval_platform_task_items` row per selected
Trace or Observation.

### 4. Execute Evaluation

The worker claims pending items and builds normalized evaluator input:

- `input`
- `output`
- `expected`
- `metadata`
- `trace_id`
- `observation_id`

Each evaluator returns:

- `score`
- `passed`
- `reason`
- `metadata`
- `dimension_scores`

### 5. Write Scores

The worker writes each result to Langfuse through the Scores API and stores the
returned `score_id` in `eval_platform_task_items.langfuse_score_id`.

If score write-back fails after evaluation succeeds, the worker keeps the
evaluation result in the task item and retries only the write-back step.

### 6. Generate Report

After task completion, the backend aggregates task item results and any needed
Langfuse Score data. It stores a report snapshot in `eval_platform_reports`.
Reports include summary metrics, score distribution, dimension radar data,
failed-item details, and Bad Cases.

## API Design

The backend exposes REST endpoints with a consistent envelope:

```json
{
  "data": {},
  "meta": {},
  "error": null
}
```

First-version endpoints:

- `GET /api/projects`
- `POST /api/projects`
- `PATCH /api/projects/{project_id}`
- `POST /api/projects/{project_id}/connection/test`
- `GET /api/projects/{project_id}/traces`
- `POST /api/projects/{project_id}/traces/sample`
- `GET /api/projects/{project_id}/datasets`
- `GET /api/projects/{project_id}/evaluators`
- `POST /api/projects/{project_id}/evaluators`
- `PATCH /api/projects/{project_id}/evaluators/{evaluator_id}`
- `POST /api/projects/{project_id}/evaluators/{evaluator_id}/test`
- `GET /api/projects/{project_id}/tasks`
- `POST /api/projects/{project_id}/tasks`
- `GET /api/projects/{project_id}/tasks/{task_id}`
- `POST /api/projects/{project_id}/tasks/{task_id}/cancel`
- `POST /api/projects/{project_id}/tasks/{task_id}/retry`
- `GET /api/projects/{project_id}/reports/{task_id}`

Progress is exposed through polling in the first version. The API may add SSE or
WebSocket updates later without changing task storage.

## Frontend Scope

The UI follows `Enterprise Admin Dashboard DesignV3`.

Pages with real data in the first version:

- `ProjectList`: platform projects and Langfuse connection setup.
- `TraceLogs`: Trace listing, filtering, selection, sampling preview, and task
  launch.
- `Evaluators`: evaluator management and evaluator test runs.
- `EvaluationTasks`: task list, progress, details, retry, cancellation, report,
  and Bad Case review.
- `Datasets`: Langfuse Dataset list and basic dataset actions where Langfuse
  APIs support them.
- `Settings`: Langfuse connection, model provider keys, and default evaluation
  runtime settings.

Pages retained as framework or minimal versions:

- `LLMJudge`: functionality folds into the Evaluators create/edit wizard.
- `HumanAnnotation`: navigation and empty state only in the first version.
- `TenantManagement`: minimal structure for future platform tenant controls.
- `UserManagement`: basic platform users and roles.
- `SystemSettings`: minimal global configuration.

## Evaluator Design

All evaluator implementations use one interface:

```python
class Evaluator:
    async def evaluate(self, input: EvaluationInput) -> EvaluationResult:
        ...
```

`EvaluationInput` includes normalized `input`, `output`, `expected`, metadata,
Trace id, Observation id, and task context.

`EvaluationResult` includes score, pass/fail, reason, metadata, and optional
dimension scores.

Evaluator types:

- `LLMJudgeEvaluator`: executes prompt-based judge calls against configured
  model providers.
- `RuleEvaluator`: executes simple deterministic checks such as JSON validity,
  keyword presence, length thresholds, string matching, regex matching, or
  numeric ranges. The first version supports only predefined rule types with
  user-provided parameters; it does not execute arbitrary user code.
- `OpenJudgeEvaluator`: adapts selected OpenJudge graders to the platform
  interface.

The first version must include at least one working evaluator for each type.

Initial OpenJudge adapter candidates:

- Text graders: `StringMatchGrader`, `NumberAccuracyGrader`, and similarity
  graders where their dependencies are available.
- Common quality graders: relevance, correctness, hallucination, harmfulness,
  and instruction following.
- Agent response graders: response helpfulness and response completeness.

OpenJudge graders that require unsafe code execution, multimodal assets, or
heavy external dependencies are out of scope for the first version unless they
can run inside a controlled sandbox with explicit configuration.

## Error Handling

- Langfuse connection failure: connection test fails and tasks cannot start for
  that project.
- Trace read failure: affected task item is marked failed and can be retried.
- Evaluator execution failure: task item records error type, message, and
  attempt count.
- Score write-back failure: evaluation result is retained and only the
  write-back step is retried.
- Task cancellation: no new items are dispatched; running items finish their
  current step and then respect cancellation before any new work begins.
- Report generation failure: scores remain in Langfuse and reports can be
  regenerated from task items.

## Security

- Platform users and roles are independent from Langfuse sessions.
- Langfuse secret keys and model provider keys are encrypted at rest.
- Frontend never receives Langfuse secret keys.
- Backend enforces project access on every endpoint.
- Audit logs are written for connection changes, evaluator changes, task
  creation, task cancellation, retry operations, and settings updates.

## Deployment

Langfuse remains source-deployed. The platform adds its own services:

- `frontend`
- `api`
- `worker`

Required environment values:

- `DATABASE_URL`
- `REDIS_URL`
- `LANGFUSE_DEFAULT_BASE_URL`
- `PLATFORM_SECRET_KEY`
- `KEY_ENCRYPTION_SECRET`
- model provider keys or references

Migrations:

- Use Alembic for platform tables.
- Migration scripts must only create or modify `eval_platform_*` tables.

## Testing Strategy

Backend unit tests:

- evaluator interface and evaluator implementations
- Trace sampling logic
- task and item state transitions
- report aggregation
- credential encryption helpers

Backend integration tests:

- mock Langfuse datasets, traces, and scores APIs
- project connection validation
- score write-back success and failure handling
- report regeneration

Worker tests:

- item claiming
- retry behavior
- cancellation behavior
- idempotent score write-back

Frontend tests:

- smoke tests for first-version pages
- Trace filter and sampling form behavior
- evaluator create/test flow
- task creation flow
- task detail and report rendering

End-to-end tests:

- create project connection
- list/filter traces
- create an evaluation task
- execute a small task with a test evaluator
- write scores to a mocked or local Langfuse
- render the completed report

## Implementation Phasing

Phase 1: foundation

- Project scaffold for frontend, FastAPI backend, worker, migrations, and
  Docker compose.
- Platform auth and project connection model.
- Langfuse client wrapper and connection test.

Phase 2: core evaluation workflow

- Trace list/filter adapter.
- Evaluator CRUD for LLM Judge, rule, and OpenJudge.
- Task creation and worker execution.
- Langfuse Scores API write-back.

Phase 3: reporting and UI completion

- Task list/detail/progress UI.
- Report aggregation and Bad Case extraction.
- Dataset list integration.
- Settings and basic user management.

Phase 4: hardening

- Retry and cancellation polish.
- Security review for encrypted credentials.
- Integration and end-to-end tests.
- Deployment documentation.

## Acceptance Criteria

- A user can connect the platform to a source-deployed Langfuse project.
- A user can filter Langfuse Traces in the platform UI.
- A user can create a task from selected or sampled Traces.
- The worker can evaluate task items with LLM Judge, rule, and OpenJudge
  evaluators.
- The worker writes evaluation results to Langfuse Scores API.
- The platform stores task status and score references in `eval_platform_*`
  tables only.
- The report page shows summary score, progress, score distribution, dimension
  metrics, failed items, and Bad Cases.
- No existing Langfuse table structure is changed.
