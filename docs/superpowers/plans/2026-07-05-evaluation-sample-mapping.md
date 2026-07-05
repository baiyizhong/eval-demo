# Evaluation Sample Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified evaluation sample and field mapping path so evaluators can run against both Langfuse datasets and Trace-derived samples.

**Architecture:** Dataset and Trace sources are normalized into an internal `EvaluationSample` dictionary before evaluator execution. Evaluator default `config.inputMapping` and task-level `variableMapping` are resolved against `sample.*` paths to produce workflow inputs.

**Tech Stack:** FastAPI, psycopg, Pydantic, React, TypeScript, React Hook Form, Vitest/pytest, uv, npm.

## Global Constraints

- Always respond in Chinese-simplified.
- Do not modify `langfuse/`.
- Do not modify Langfuse native table schemas.
- Do not add tables for this phase.
- PA custom table names must use `pa_` if future tables are required.
- Python commands must use `uv`.
- Do not run `git commit`, `git push`, or create PRs.
- API pagination uses `page` and `pageSize`.
- API response format remains `{ code, message, data, txId }`.

---

## File Structure

- Modify `pa-eval-backend/app/auto_evaluations.py`
  - Add sample normalization helpers.
  - Add mapping resolver helpers.
  - Use mapping resolver before calling workflow evaluators.
- Modify `pa-eval-backend/tests/test_auto_evaluations.py`
  - Add focused unit tests for normalization and mapping.
- Modify `pa-eval-frontend/src/modules/app-evaluation/api/auto-evaluation-api.ts`
  - Include `variableMapping` in create task request body.
- Modify `pa-eval-frontend/src/modules/app-evaluation/components/auto-evaluation-task-form.tsx`
  - Replace hard-coded `trace.*`/`dataset.*` options with `sample.*` options.
  - Send task-level variable mapping.
- Modify or add `pa-eval-frontend/src/modules/app-evaluation/api/auto-evaluation-api.test.ts`
  - Verify create payload includes variable mapping.

---

### Task 1: 后端样本归一化

**Files:**
- Modify: `pa-eval-backend/app/auto_evaluations.py`
- Modify: `pa-eval-backend/tests/test_auto_evaluations.py`

**Interfaces:**
- Produces: `_normalize_dataset_item_sample(item: dict[str, Any]) -> dict[str, Any]`
- Produces: `_get_path_value(source: dict[str, Any], path: str) -> Any`

- [ ] **Step 1: Write failing tests**

Add tests to `pa-eval-backend/tests/test_auto_evaluations.py`:

```python
from app.auto_evaluations import _get_path_value, _normalize_dataset_item_sample


def test_normalize_dataset_item_sample_exposes_sample_fields() -> None:
    sample = _normalize_dataset_item_sample(
        {
            "id": "item-1",
            "input": {
                "input": "怎么申请退款？",
                "output": "可在订单详情页提交退款申请。",
                "context": "客服场景",
            },
            "expected_output": "退款申请",
            "metadata": {"channel": "web"},
            "source_trace_id": "trace-1",
            "source_observation_id": "obs-1",
        }
    )

    assert sample["sourceType"] == "DATASET_ITEM"
    assert sample["sourceId"] == "item-1"
    assert sample["input"] == "怎么申请退款？"
    assert sample["output"] == "可在订单详情页提交退款申请。"
    assert sample["expectedOutput"] == "退款申请"
    assert sample["context"] == "客服场景"
    assert sample["metadata"] == {"channel": "web"}
    assert sample["trace"]["id"] == "trace-1"
    assert sample["observation"]["id"] == "obs-1"
    assert sample["datasetItem"]["id"] == "item-1"


def test_get_path_value_reads_nested_sample_paths() -> None:
    source = {"sample": {"metadata": {"channel": "web"}}}

    assert _get_path_value(source, "sample.metadata.channel") == "web"
    assert _get_path_value(source, "sample.metadata.missing") == ""
```

- [ ] **Step 2: Verify tests fail**

Run:

```bash
cd /Users/john/PycharmProjects/eval-demo/pa-eval-backend
uv run pytest tests/test_auto_evaluations.py -q
```

Expected: import errors for `_normalize_dataset_item_sample` and `_get_path_value`.

- [ ] **Step 3: Implement minimal helpers**

Add to `pa-eval-backend/app/auto_evaluations.py` near existing sample helpers:

```python
def _normalize_dataset_item_sample(item: dict[str, Any]) -> dict[str, Any]:
    raw_input = item.get("input")
    input_payload = raw_input if isinstance(raw_input, dict) else {}
    metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}

    return {
        "sourceType": "DATASET_ITEM",
        "sourceId": _stringify_value(item.get("id")),
        "input": _stringify_value(input_payload.get("input", raw_input)),
        "output": _stringify_value(input_payload.get("output", "")),
        "expectedOutput": _stringify_value(item.get("expected_output")),
        "context": _stringify_value(input_payload.get("context", metadata.get("context", ""))),
        "metadata": metadata,
        "trace": {"id": _stringify_value(item.get("source_trace_id"))},
        "observation": {"id": _stringify_value(item.get("source_observation_id"))},
        "datasetItem": item,
    }


def _get_path_value(source: dict[str, Any], path: str) -> Any:
    current: Any = source
    for segment in path.split("."):
        if isinstance(current, dict) and segment in current:
            current = current[segment]
        else:
            return ""
    return current
```

- [ ] **Step 4: Verify tests pass**

Run:

```bash
cd /Users/john/PycharmProjects/eval-demo/pa-eval-backend
uv run pytest tests/test_auto_evaluations.py -q
```

Expected: all tests pass.

- [ ] **Step 5: Check diff, do not commit**

Run:

```bash
git diff -- pa-eval-backend/app/auto_evaluations.py pa-eval-backend/tests/test_auto_evaluations.py
```

Expected: only helper and test changes.

---

### Task 2: 后端评估器输入映射执行

**Files:**
- Modify: `pa-eval-backend/app/auto_evaluations.py`
- Modify: `pa-eval-backend/tests/test_auto_evaluations.py`

**Interfaces:**
- Produces: `_resolve_mapping_template(template: str, sample: dict[str, Any]) -> str`
- Produces: `_build_workflow_inputs(sample: dict[str, Any], evaluator: dict[str, Any], task_mapping: dict[str, Any] | None) -> dict[str, str]`
- Consumes: `_normalize_dataset_item_sample`

- [ ] **Step 1: Write failing tests**

Add tests:

```python
from app.auto_evaluations import _build_workflow_inputs, _resolve_mapping_template


def test_resolve_mapping_template_replaces_sample_paths() -> None:
    sample = {
        "input": "问题",
        "output": "回答",
        "expectedOutput": "期望",
        "metadata": {"channel": "web"},
    }

    assert _resolve_mapping_template("{{ sample.input }}", sample) == "问题"
    assert _resolve_mapping_template("渠道：{{ sample.metadata.channel }}", sample) == "渠道：web"


def test_build_workflow_inputs_prefers_task_mapping_over_evaluator_mapping() -> None:
    sample = {
        "input": "问题",
        "output": "回答",
        "expectedOutput": "期望",
        "context": "上下文",
    }
    evaluator = {
        "variables": ["input", "answer"],
        "config": {
            "inputMapping": {
                "input": "{{ sample.input }}",
                "answer": "{{ sample.output }}",
            }
        },
    }

    inputs = _build_workflow_inputs(
        sample,
        evaluator,
        {"answer": "{{ sample.expectedOutput }}"},
    )

    assert inputs == {"input": "问题", "answer": "期望"}
```

- [ ] **Step 2: Verify tests fail**

Run:

```bash
cd /Users/john/PycharmProjects/eval-demo/pa-eval-backend
uv run pytest tests/test_auto_evaluations.py -q
```

Expected: import errors for mapping helpers.

- [ ] **Step 3: Implement mapping helpers and use them**

Add helpers:

```python
def _resolve_mapping_template(template: str, sample: dict[str, Any]) -> str:
    result = template
    while "{{" in result and "}}" in result:
        start = result.index("{{")
        end = result.index("}}", start) + 2
        expression = result[start + 2 : end - 2].strip()
        value = _get_path_value({"sample": sample}, expression)
        result = f"{result[:start]}{_stringify_value(value)}{result[end:]}"
    return result


def _build_workflow_inputs(
    sample: dict[str, Any],
    evaluator: dict[str, Any],
    task_mapping: dict[str, Any] | None,
) -> dict[str, str]:
    config = evaluator.get("config") or {}
    evaluator_mapping = config.get("inputMapping") if isinstance(config.get("inputMapping"), dict) else {}
    mapping = {**_default_input_mapping(evaluator), **evaluator_mapping}
    if task_mapping:
        mapping.update(task_mapping)
    return {
        key: _resolve_mapping_template(str(value), sample)
        for key, value in mapping.items()
    }


def _default_input_mapping(evaluator: dict[str, Any]) -> dict[str, str]:
    variables = evaluator.get("variables") if isinstance(evaluator.get("variables"), list) else []
    defaults = {
        "input": "{{ sample.input }}",
        "output": "{{ sample.output }}",
        "expected_output": "{{ sample.expectedOutput }}",
        "context": "{{ sample.context }}",
    }
    return {variable: defaults.get(variable, "") for variable in variables}
```

In `_run_auto_evaluation_background`, replace:

```python
inputs = _build_dify_inputs_from_dataset_item(sample)
```

with:

```python
normalized_sample = _normalize_dataset_item_sample(sample)
inputs = _build_workflow_inputs(
    normalized_sample,
    evaluator,
    payload.variable_mapping,
)
```

and append `{"sample": sample, "normalizedSample": normalized_sample, **result}`.

- [ ] **Step 4: Add payload field**

Add to `CreateAutoEvaluationPayload`:

```python
variable_mapping: dict[str, Any] = Field(default_factory=dict, alias="variableMapping")
```

- [ ] **Step 5: Verify tests pass**

Run:

```bash
cd /Users/john/PycharmProjects/eval-demo/pa-eval-backend
uv run pytest tests/test_auto_evaluations.py -q
uv run ruff check app/auto_evaluations.py tests/test_auto_evaluations.py
```

Expected: tests and ruff pass.

- [ ] **Step 6: Check diff, do not commit**

Run:

```bash
git diff -- pa-eval-backend/app/auto_evaluations.py pa-eval-backend/tests/test_auto_evaluations.py
```

Expected: mapping is used before workflow execution.

---

### Task 3: 前端发送变量映射

**Files:**
- Modify: `pa-eval-frontend/src/modules/app-evaluation/api/auto-evaluation-api.ts`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/components/auto-evaluation-task-form.tsx`
- Test: `pa-eval-frontend/src/modules/app-evaluation/api/auto-evaluation-api.test.ts`

**Interfaces:**
- Produces request field: `variableMapping`
- Consumes backend field: `CreateAutoEvaluationPayload.variableMapping`

- [ ] **Step 1: Write failing API test**

Add or extend `auto-evaluation-api.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { createProjectAutoEvaluationTask } from './auto-evaluation-api'

describe('createProjectAutoEvaluationTask', () => {
  it('sends task variable mapping', async () => {
    const createAutoEvaluationTask = vi.fn().mockResolvedValue({ id: 'task-1' })

    await createProjectAutoEvaluationTask(
      { createAutoEvaluationTask } as never,
      'project-1',
      {
        name: '任务',
        description: '',
        scoreName: 'quality',
        evaluatorId: 'eval-1',
        sampleRate: 100,
        dataSource: { type: 'DATASET', datasetId: 'dataset-1' },
        variableMapping: {
          input: '{{ sample.input }}',
          output: '{{ sample.output }}',
        },
      }
    )

    expect(createAutoEvaluationTask).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          variableMapping: {
            input: '{{ sample.input }}',
            output: '{{ sample.output }}',
          },
        }),
      })
    )
  })
})
```

- [ ] **Step 2: Verify test fails**

Run:

```bash
cd /Users/john/PycharmProjects/eval-demo/pa-eval-frontend
npm run test -- auto-evaluation-api.test.ts
```

Expected: payload does not include `variableMapping`.

- [ ] **Step 3: Update API input type and body**

In `createProjectAutoEvaluationTask`, add `variableMapping` to input type:

```typescript
variableMapping: AutoEvaluationTaskFormInput['variableMapping']
```

and include in request body:

```typescript
variableMapping: input.variableMapping,
```

- [ ] **Step 4: Send form mapping**

In `AutoEvaluationTaskForm.handleSubmit`, pass:

```typescript
variableMapping: form.variableMapping,
```

- [ ] **Step 5: Replace mapping options with sample fields**

Replace the current options array with:

```typescript
const sampleFieldOptions = [
  'sample.input',
  'sample.output',
  'sample.expectedOutput',
  'sample.context',
  'sample.metadata',
  'sample.trace.id',
  'sample.observation.id',
  'sample.datasetItem.id',
]
```

When saving select value, store template form:

```typescript
[variable]: `{{ ${value} }}`
```

When rendering select value, strip template:

```typescript
getMappingSelectValue(form.variableMapping[variable])
```

Add:

```typescript
function toMappingTemplate(value: string) {
  return `{{ ${value} }}`
}

function getMappingSelectValue(value?: string) {
  return value?.replace(/^{{\s*/, '').replace(/\s*}}$/, '') ?? ''
}
```

- [ ] **Step 6: Verify frontend**

Run:

```bash
cd /Users/john/PycharmProjects/eval-demo/pa-eval-frontend
npm run typecheck
npm run lint
```

Expected: typecheck passes; lint has no new errors.

- [ ] **Step 7: Check diff, do not commit**

Run:

```bash
git diff -- pa-eval-frontend/src/modules/app-evaluation/api/auto-evaluation-api.ts pa-eval-frontend/src/modules/app-evaluation/components/auto-evaluation-task-form.tsx
```

Expected: frontend sends `variableMapping` and displays `sample.*` mapping options.

---

### Task 4: Smoke verification

**Files:**
- No required code files.

**Interfaces:**
- Consumes all previous tasks.

- [ ] **Step 1: Restart backend if needed**

Run:

```bash
cd /Users/john/PycharmProjects/eval-demo/pa-eval-backend
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Expected: backend listens on `http://localhost:8000`.

- [ ] **Step 2: Verify UI flow**

Open:

```text
http://localhost:5173/projects/f5f19fce55c642a6bc2cdc57ae4da0cd/evaluation/auto-evaluations/new
```

Expected:

- Workflow evaluators are selectable.
- Mapping fields show `sample.*` options.
- Creating a task sends `variableMapping`.
- Task starts as `RUNNING`.
- Background run completes or fails with visible status.

- [ ] **Step 3: Final verification commands**

Run:

```bash
cd /Users/john/PycharmProjects/eval-demo/pa-eval-backend
uv run pytest tests/test_auto_evaluations.py
uv run ruff check app/auto_evaluations.py tests/test_auto_evaluations.py
```

Run:

```bash
cd /Users/john/PycharmProjects/eval-demo/pa-eval-frontend
npm run typecheck
npm run lint
```

Expected: all tests/checks pass, except existing lint warnings if unchanged.

---

## Self-Review

- Spec coverage: dataset normalization, mapping resolver, task-level mapping, frontend payload, and smoke verification are covered.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: backend uses `variable_mapping` with alias `variableMapping`; frontend sends `variableMapping`.
- Scope: Trace real query implementation is intentionally deferred; this plan prepares the mapping layer and keeps data source adapters isolated.
