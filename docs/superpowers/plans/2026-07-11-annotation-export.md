# Annotation Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the artificial annotation export dialog and asynchronous backend zip export flow described in `docs/superpowers/specs/2026-07-11-annotation-export-design.md`.

**Architecture:** The frontend opens one reusable export dialog for filtered and selected annotation items, previews the first 20 rows, creates an export job, polls until completion, and downloads a zip. The backend stores job state in a new PA extension table, generates xlsx/csv/txt plus `manifest.json` in a zip, and never exposes server `file_path` to the client.

**Tech Stack:** React, TypeScript, TanStack Query/Table, shadcn/Radix dialog controls, FastAPI, Pydantic, psycopg, Alembic, Python stdlib `csv`/`json`/`zipfile`, custom minimal XLSX writer.

---

## Guardrails

- Do not run `git commit`, `git push`, or create a PR. The repository rule forbids automatic commits.
- Do not modify `langfuse/` or `dify/`.
- Use `uv` for backend commands.
- Keep all new database structures in PA tables with `pa_` prefix.
- The new migration must put `create_by`, `update_by`, `create_date`, `update_date` first and include table/column comments.
- Preserve the existing API response envelope and do not return `filePath` to the frontend.

## File Map

Create:

- `pa-eval-backend/migrations/versions/20260711_0012_create_pa_annotation_export_jobs.py`: Alembic migration for export jobs.
- `pa-eval-backend/app/annotation_exports.py`: annotation export preview helpers and file generation.
- `pa-eval-backend/tests/test_annotation_exports.py`: API and file-generation tests.
- `pa-eval-frontend/src/modules/app-evaluation/components/annotation-export-dialog.tsx`: export dialog UI and job orchestration.
- `pa-eval-frontend/src/tests/app-evaluation/annotation-export-view.test.ts`: source-level frontend regression tests.

Modify:

- `pa-eval-backend/app/annotations.py`: add payload models and export preview/job/download endpoints.
- `pa-eval-backend/app/langfuse_db.py`: add annotation export job persistence methods.
- `pa-eval-backend/tests/test_pa_migration_schema.py`: include the new migration and PA table in schema assertions.
- `pa-eval-frontend/src/api/registry.ts`: register annotation export endpoints.
- `pa-eval-frontend/src/modules/app-evaluation/types.ts`: add annotation export types.
- `pa-eval-frontend/src/modules/app-evaluation/api/annotation-api.ts`: add API helpers and polling.
- `pa-eval-frontend/src/modules/app-evaluation/views/annotation-queue-detail.tsx`: add top-level export action and mount dialog.
- `pa-eval-frontend/src/modules/app-evaluation/components/annotation-queue-item-bulk-actions.tsx`: replace direct JSON download with dialog trigger.
- `pa-eval-frontend/src/modules/app-evaluation/components/format.ts`: add shared `downloadBlob` helper and refactor the dataset page to use it.

## Task 1: Migration

**Files:**

- Create: `pa-eval-backend/migrations/versions/20260711_0012_create_pa_annotation_export_jobs.py`
- Modify: `pa-eval-backend/tests/test_pa_migration_schema.py`

- [ ] **Step 1: Write failing migration tests**

Add `pa_annotation_export_jobs` to `PA_TABLES` and append the migration filename to the expected order:

```python
PA_TABLES = (
    # existing entries
    "pa_annotation_queue_settings",
    "pa_annotation_queue_item_assignments",
    "pa_annotation_export_jobs",
)
```

```python
assert [path.name for path in migration_files] == [
    "20260705_0001_create_pa_eval_tables.py",
    "20260705_0002_legacy_compatibility_checkpoint.py",
    "20260707_0002_create_project_model_settings.py",
    "20260707_0003_align_legacy_pa_tables.py",
    "20260707_0004_create_pa_audit_logs.py",
    "20260707_0005_normalize_pa_audit_actions.py",
    "20260707_0006_create_pa_dataset_export_jobs.py",
    "20260707_0007_normalize_langfuse_score_config_categories.py",
    "20260708_0008_align_auto_eval_compat_columns.py",
    "20260708_0009_add_report_flowback_compat_columns.py",
    "20260709_0010_create_scheduled_jobs.py",
    "20260711_0011_create_annotation_assignment_tables.py",
    "20260711_0012_create_pa_annotation_export_jobs.py",
]
```

Add a focused comment test:

```python
def test_annotation_export_jobs_table_is_defined_with_comments() -> None:
    migration = MIGRATIONS_DIR / "20260711_0012_create_pa_annotation_export_jobs.py"
    content = migration.read_text(encoding="utf-8")

    assert "pa_annotation_export_jobs" in content
    assert "COMMENT ON TABLE pa_annotation_export_jobs" in content
    assert "COMMENT ON COLUMN pa_annotation_export_jobs.queue_id" in content
    assert "COMMENT ON COLUMN pa_annotation_export_jobs.scope" in content
    assert "COMMENT ON COLUMN pa_annotation_export_jobs.metadata" in content
```

- [ ] **Step 2: Run migration tests and verify failure**

Run:

```bash
cd pa-eval-backend
uv run pytest tests/test_pa_migration_schema.py -q
```

Expected: FAIL because `20260711_0012_create_pa_annotation_export_jobs.py` does not exist and the table cannot be found.

- [ ] **Step 3: Create migration**

Create `20260711_0012_create_pa_annotation_export_jobs.py` with:

```python
"""create pa annotation export jobs

Revision ID: 20260711_0012
Revises: 20260711_0011
Create Date: 2026-07-11 16:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260711_0012"
down_revision = "20260711_0011"
branch_labels = None
depends_on = None


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    return _inspector().has_table(table_name)


def _index_exists(table_name: str, index_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(index["name"] == index_name for index in _inspector().get_indexes(table_name))


def _create_index_once(index_name: str, table_name: str, columns: list[str]) -> None:
    if not _index_exists(table_name, index_name):
        op.create_index(index_name, table_name, columns)


def _drop_index_if_exists(index_name: str, table_name: str) -> None:
    if _index_exists(table_name, index_name):
        op.drop_index(index_name, table_name=table_name)


def _drop_table_if_exists(table_name: str) -> None:
    if _table_exists(table_name):
        op.drop_table(table_name)


def _audit_columns() -> list[sa.Column]:
    return [
        sa.Column("create_by", sa.Text(), nullable=False, server_default="system"),
        sa.Column("update_by", sa.Text(), nullable=False, server_default="system"),
        sa.Column(
            "create_date",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "update_date",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    ]


def upgrade() -> None:
    if not _table_exists("pa_annotation_export_jobs"):
        op.create_table(
            "pa_annotation_export_jobs",
            *_audit_columns(),
            sa.Column("id", sa.Text(), primary_key=True),
            sa.Column("project_id", sa.Text(), nullable=False),
            sa.Column("queue_id", sa.Text(), nullable=False),
            sa.Column("scope", sa.Text(), nullable=False),
            sa.Column("format", sa.Text(), nullable=False),
            sa.Column("status", sa.Text(), nullable=False, server_default="PENDING"),
            sa.Column("total_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("exported_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("file_name", sa.Text(), nullable=False, server_default=""),
            sa.Column("file_path", sa.Text(), nullable=False, server_default=""),
            sa.Column("file_size", sa.BigInteger(), nullable=False, server_default="0"),
            sa.Column("error_message", sa.Text(), nullable=False, server_default=""),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column(
                "metadata",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.CheckConstraint(
                "scope IN ('filtered', 'selected')",
                name="pa_annotation_export_jobs_scope_check",
            ),
            sa.CheckConstraint(
                "format IN ('xlsx', 'csv', 'txt')",
                name="pa_annotation_export_jobs_format_check",
            ),
            sa.CheckConstraint(
                "status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')",
                name="pa_annotation_export_jobs_status_check",
            ),
        )

    _create_index_once(
        "pa_annotation_export_jobs_project_queue_idx",
        "pa_annotation_export_jobs",
        ["project_id", "queue_id"],
    )
    _create_index_once(
        "pa_annotation_export_jobs_project_update_idx",
        "pa_annotation_export_jobs",
        ["project_id", "update_date"],
    )

    op.execute("COMMENT ON TABLE pa_annotation_export_jobs IS 'PA 人工标注导出任务表'")
    comments = {
        "create_by": "创建人",
        "update_by": "更新人",
        "create_date": "创建时间",
        "update_date": "更新时间",
        "id": "导出任务 ID",
        "project_id": "项目 ID",
        "queue_id": "人工标注任务 ID",
        "scope": "导出范围 filtered 或 selected",
        "format": "导出格式 xlsx/csv/txt",
        "status": "导出任务状态",
        "total_count": "导出总量",
        "exported_count": "已导出数量",
        "file_name": "返回给前端的 zip 文件名",
        "file_path": "服务器文件路径",
        "file_size": "zip 文件大小",
        "error_message": "失败原因",
        "started_at": "开始时间",
        "completed_at": "完成时间",
        "expires_at": "过期时间",
        "metadata": "导出配置快照",
    }
    for column, comment in comments.items():
        op.execute(
            f"COMMENT ON COLUMN pa_annotation_export_jobs.{column} IS '{comment}'"
        )


def downgrade() -> None:
    _drop_index_if_exists(
        "pa_annotation_export_jobs_project_update_idx",
        "pa_annotation_export_jobs",
    )
    _drop_index_if_exists(
        "pa_annotation_export_jobs_project_queue_idx",
        "pa_annotation_export_jobs",
    )
    _drop_table_if_exists("pa_annotation_export_jobs")
```

- [ ] **Step 4: Run migration tests**

Run:

```bash
cd pa-eval-backend
uv run pytest tests/test_pa_migration_schema.py -q
```

Expected: PASS.

## Task 2: Backend Export Serialization

**Files:**

- Create: `pa-eval-backend/app/annotation_exports.py`
- Create/modify tests in: `pa-eval-backend/tests/test_annotation_exports.py`

- [ ] **Step 1: Write focused serializer tests**

Create `test_annotation_exports.py` with tests for:

```python
from pathlib import Path
from zipfile import ZipFile

from app.annotation_exports import (
    EXCEL_CELL_LIMIT,
    build_annotation_export_preview,
    generate_annotation_export_archive,
    score_to_label,
)


def test_score_to_label_uses_category_label() -> None:
    score_config = {
        "id": "cfg-1",
        "name": "准确性",
        "dataType": "CATEGORICAL",
        "categories": [{"label": "通过", "value": 1}],
    }
    score = {"configId": "cfg-1", "value": 1, "stringValue": ""}

    assert score_to_label(score_config, score) == "通过"


def test_preview_expands_top_level_metadata_keys() -> None:
    payload = build_annotation_export_preview(
        queue={"id": "queue-1", "name": "客服标注", "description": ""},
        items=[
            _item("item-1", metadata={"channel": "app", "nested": {"a": 1}}),
            _item("item-2", metadata={"region": "华东"}),
        ],
        score_configs=[],
        preview_limit=20,
        split_metadata=True,
    )

    assert payload["metadataKeys"] == ["channel", "nested", "region"]
    assert payload["previewItems"][0]["metadata.channel"] == "app"
    assert payload["previewItems"][0]["metadata.nested"] == '{"a": 1}'


def test_generate_csv_zip_contains_manifest_and_csv(tmp_path: Path) -> None:
    archive_path = generate_annotation_export_archive(
        output_dir=tmp_path,
        base_file_name="客服标注-1-20260711-160000",
        export_format="csv",
        queue={"id": "queue-1", "name": "客服标注", "description": ""},
        metrics={"total": 1, "completed": 1, "pending": 0},
        score_configs=[],
        items=[_item("item-1")],
        split_metadata=False,
    )

    with ZipFile(archive_path) as archive:
        assert "manifest.json" in archive.namelist()
        assert "客服标注-1-20260711-160000.csv" in archive.namelist()


def test_generate_xlsx_truncates_long_cells(tmp_path: Path) -> None:
    long_text = "x" * (EXCEL_CELL_LIMIT + 100)
    archive_path = generate_annotation_export_archive(
        output_dir=tmp_path,
        base_file_name="客服标注-1-20260711-160000",
        export_format="xlsx",
        queue={"id": "queue-1", "name": "客服标注", "description": ""},
        metrics={"total": 1, "completed": 1, "pending": 0},
        score_configs=[{"id": "cfg-1", "name": "准确性", "dataType": "TEXT"}],
        items=[_item("item-1", input_value=long_text)],
        split_metadata=False,
    )

    with ZipFile(archive_path) as archive:
        xlsx_name = "客服标注-1-20260711-160000.xlsx"
        with ZipFile(archive.open(xlsx_name)) as workbook:
            sheet_xml = workbook.read("xl/worksheets/sheet3.xml").decode("utf-8")
            assert "x" * EXCEL_CELL_LIMIT in sheet_xml
```

Add `_item()` helper inside the test file:

```python
def _item(
    item_id: str,
    *,
    metadata: dict | None = None,
    input_value: object | None = None,
) -> dict:
    return {
        "id": item_id,
        "status": "COMPLETED",
        "assignee": {"id": "user-1", "name": "李雷", "email": "li@example.com"},
        "completedBy": {"id": "user-1", "name": "李雷", "email": "li@example.com"},
        "source": {
            "traceId": "trace-1",
            "observationId": "obs-1",
            "sessionId": "session-1",
            "userId": "end-user-1",
            "input": input_value if input_value is not None else {"q": "退款"},
            "output": {"a": "请在订单详情申请"},
            "metadata": metadata or {},
        },
        "scores": [],
    }
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cd pa-eval-backend
uv run pytest tests/test_annotation_exports.py -q
```

Expected: FAIL because `app.annotation_exports` does not exist.

- [ ] **Step 3: Implement `annotation_exports.py`**

Create these functions and constants:

```python
EXCEL_CELL_LIMIT = 32767
EXPORT_FORMATS = {"xlsx", "csv", "txt"}
EXPORT_STATUS_DONE = {"SUCCEEDED", "FAILED"}


def score_to_label(score_config: dict[str, Any], score: dict[str, Any] | None) -> str:
    if not score:
        return ""
    data_type = score_config.get("dataType") or score_config.get("data_type")
    categories = score_config.get("categories") or []
    value = score.get("value")
    string_value = score.get("stringValue") or score.get("string_value") or ""
    if data_type in {"CATEGORICAL", "BOOLEAN", "NUMERIC"}:
        for category in categories:
            if category.get("value") == value:
                return str(category.get("label") or "")
    if data_type == "BOOLEAN":
        if value is True or value == 1:
            return "True"
        if value is False or value == 0:
            return "False"
    if data_type == "TEXT":
        return str(string_value)
    if value is None:
        return ""
    return str(value)
```

Implement:

- `_stringify(value: Any) -> str`: strings stay strings; `None` becomes `""`; other values become `json.dumps(..., ensure_ascii=False, default=str)`.
- `_excel_safe(value: Any) -> str`: `_stringify(value)[:EXCEL_CELL_LIMIT]`.
- `_collect_metadata_keys(items)`: sorted unique top-level keys from `item["source"]["metadata"]`.
- `_build_detail_rows(items, score_configs, split_metadata)`: fixed columns, optional `metadata.<key>` columns, dynamic score columns.
- `build_annotation_export_preview(queue, items, score_configs, preview_limit, split_metadata)`: returns queue, metrics, scoreConfigs, metadataKeys, previewItems.
- `generate_annotation_export_archive(...) -> Path`: writes main data file plus `manifest.json` into zip.

For XLSX, copy the existing minimal XML writer pattern from `pa-eval-backend/app/dataset_exports.py`, but extend workbook metadata to three sheets:

```python
sheet_specs = [
    ("基本信息", basic_info_rows),
    ("评分指标", score_config_rows),
    ("数据明细", detail_rows),
]
```

Add styles XML with yellow fill for highlighted header cells. Use style index `1` only for score metric header cells in the detail sheet:

```xml
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/>
  </cellXfs>
</styleSheet>
```

- [ ] **Step 4: Run serializer tests**

Run:

```bash
cd pa-eval-backend
uv run pytest tests/test_annotation_exports.py -q
```

Expected: PASS.

## Task 3: Backend Reader Methods

**Files:**

- Modify: `pa-eval-backend/app/langfuse_db.py`

- [ ] **Step 1: Add job creation method**

Add `create_annotation_export_job_for_user(...)` near dataset export job methods. It must:

- Validate project access with `_get_project_for_user`.
- Validate queue access with existing queue lookup helper or queue method.
- Generate ID with `_new_langfuse_id("paexport")`.
- Set `expires_at = datetime.now(timezone.utc) + timedelta(days=7)`.
- Insert into `pa_annotation_export_jobs`.
- Store export config in `metadata`.

Signature:

```python
async def create_annotation_export_job_for_user(
    self,
    project_id: str,
    queue_id: str,
    user_id: str,
    *,
    scope: str,
    export_format: str,
    filters: dict[str, Any],
    item_ids: list[str],
    split_metadata: bool,
    file_name: str,
) -> dict[str, Any]:
```

- [ ] **Step 2: Add job read/update methods**

Add:

```python
async def get_annotation_export_job_for_user(
    self,
    project_id: str,
    queue_id: str,
    job_id: str,
    user_id: str,
) -> dict[str, Any]:
```

```python
async def mark_annotation_export_job_running(
    self,
    project_id: str,
    queue_id: str,
    job_id: str,
) -> None:
```

```python
async def mark_annotation_export_job_succeeded(
    self,
    project_id: str,
    queue_id: str,
    job_id: str,
    *,
    total_count: int,
    file_name: str,
    file_path: str,
    file_size: int,
) -> None:
```

```python
async def mark_annotation_export_job_failed(
    self,
    project_id: str,
    queue_id: str,
    job_id: str,
    error_message: str,
) -> None:
```

- [ ] **Step 3: Add private mapper**

Add `_get_annotation_export_job_payload_cursor(...)` and `_to_annotation_export_job_payload(row)` mirroring dataset export mapper. Public payload must use camelCase and include:

```python
{
    "id": row["id"],
    "projectId": row["project_id"],
    "queueId": row["queue_id"],
    "scope": row["scope"],
    "format": row["format"],
    "status": row["status"],
    "totalCount": row["total_count"],
    "exportedCount": row["exported_count"],
    "fileName": row["file_name"],
    "filePath": row["file_path"],
    "fileSize": row["file_size"],
    "errorMessage": row["error_message"],
    "metadata": row["metadata"] or {},
    "createdAt": _to_iso(row["create_date"]),
    "updatedAt": _to_iso(row["update_date"]),
    "expiresAt": _to_iso(row["expires_at"]),
}
```

Use the same date conversion helper already used by adjacent mappers.

## Task 4: Backend Routes

**Files:**

- Modify: `pa-eval-backend/app/annotations.py`
- Modify: `pa-eval-backend/tests/test_annotation_exports.py`

- [ ] **Step 1: Add route tests**

Extend `test_annotation_exports.py` with a `FakeAnnotationExportReader` that implements:

- `get_annotation_queue_for_user`
- `get_annotation_queue_metrics_for_user`
- `list_annotation_queue_items_for_user`
- `create_annotation_export_job_for_user`
- `get_annotation_export_job_for_user`
- `mark_annotation_export_job_running`
- `mark_annotation_export_job_succeeded`
- `mark_annotation_export_job_failed`

Test preview:

```python
def test_previews_annotation_export_with_selected_scope() -> None:
    fake_reader = FakeAnnotationExportReader()
    override_reader(fake_reader)
    try:
        response = TestClient(app).post(
            "/api/projects/project-1/annotation-queues/queue-1/export-preview",
            json={
                "scope": "selected",
                "itemIds": ["item-1"],
                "previewLimit": 20,
                "splitMetadata": True,
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert body["data"]["metrics"] == {"total": 1, "completed": 1, "pending": 0}
    assert body["data"]["metadataKeys"] == ["channel"]
```

Test job creation rejects empty selected scope:

```python
def test_rejects_empty_selected_annotation_export_job() -> None:
    fake_reader = FakeAnnotationExportReader()
    override_reader(fake_reader)
    try:
        response = TestClient(app).post(
            "/api/projects/project-1/annotation-queues/queue-1/export-jobs",
            json={"scope": "selected", "format": "xlsx", "itemIds": []},
        )
    finally:
        clear_overrides()

    assert response.status_code == 400
    assert response.json()["code"] != 0
```

Test create/get:

```python
def test_creates_and_gets_annotation_export_job() -> None:
    fake_reader = FakeAnnotationExportReader()
    override_reader(fake_reader)
    try:
        create_response = TestClient(app).post(
            "/api/projects/project-1/annotation-queues/queue-1/export-jobs",
            json={"scope": "filtered", "format": "csv", "splitMetadata": True},
        )
        get_response = TestClient(app).get(
            "/api/projects/project-1/annotation-queues/queue-1/export-jobs/export-job-1"
        )
    finally:
        clear_overrides()

    assert create_response.status_code == 200
    assert create_response.json()["data"]["filePath"] is None if "filePath" in create_response.json()["data"] else True
    assert get_response.status_code == 200
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cd pa-eval-backend
uv run pytest tests/test_annotation_exports.py -q
```

Expected: FAIL because routes are missing.

- [ ] **Step 3: Add Pydantic payloads**

In `annotations.py` add:

```python
AnnotationExportScope = Literal["filtered", "selected"]
AnnotationExportFormat = Literal["xlsx", "csv", "txt"]


class AnnotationExportPreviewPayload(BaseModel):
    scope: AnnotationExportScope = "filtered"
    filters: AnnotationBatchFiltersPayload = Field(
        default_factory=AnnotationBatchFiltersPayload
    )
    item_ids: list[str] = Field(default_factory=list, alias="itemIds")
    preview_limit: int = Field(default=20, ge=1, le=100, alias="previewLimit")
    split_metadata: bool = Field(default=False, alias="splitMetadata")


class AnnotationExportJobPayload(BaseModel):
    scope: AnnotationExportScope = "filtered"
    format: AnnotationExportFormat
    filters: AnnotationBatchFiltersPayload = Field(
        default_factory=AnnotationBatchFiltersPayload
    )
    item_ids: list[str] = Field(default_factory=list, alias="itemIds")
    split_metadata: bool = Field(default=False, alias="splitMetadata")
```

- [ ] **Step 4: Add route helpers**

Add helpers:

```python
def _to_public_annotation_export_job(job: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in job.items() if key != "filePath"}


def _default_annotation_export_file_name(queue: dict[str, Any], total_count: int) -> str:
    timestamp = datetime.now(timezone.utc).astimezone().strftime("%Y%m%d-%H%M%S")
    name = queue.get("name") or queue.get("id") or "annotation-export"
    return _safe_file_name(f"{name}-{total_count}-{timestamp}")
```

Import `_safe_file_name` or expose one from `annotation_exports.py`.

- [ ] **Step 5: Add endpoints**

Add:

```python
@router.post("/annotation-queues/{queue_id}/export-preview")
async def preview_annotation_queue_export(...):
```

Flow:

1. Load queue.
2. Load all queue items for user.
3. Enrich trace source using `_enrich_annotation_items_with_trace_source`.
4. Filter by `payload.filters`.
5. If `scope == "selected"`, limit to `payload.item_ids`.
6. Compute metrics from scoped items.
7. Return `build_annotation_export_preview(...)`.

Add:

```python
@router.post("/annotation-queues/{queue_id}/export-jobs")
async def create_annotation_export_job(...):
```

Flow:

1. Reject `scope == "selected"` with no item IDs using `BusinessError(1030, "请选择要导出的标注数据", 400)`.
2. Compute scoped item count with same filter logic.
3. Reject zero scoped items using `BusinessError(1031, "当前范围无可导出数据", 400)`.
4. Generate base filename from queue name, count and current time.
5. Call reader create method.
6. Add background task `generate_annotation_export_file`.
7. Return public job.

Add:

```python
@router.get("/annotation-queues/{queue_id}/export-jobs/{job_id}")
async def get_annotation_export_job(...):
```

Add:

```python
@router.get("/annotation-queues/{queue_id}/export-jobs/{job_id}/download")
async def download_annotation_export_job(...):
```

Return `FileResponse(file_path, media_type="application/zip", filename=job["fileName"])`.

- [ ] **Step 6: Run backend route tests**

Run:

```bash
cd pa-eval-backend
uv run pytest tests/test_annotation_exports.py -q
```

Expected: PASS.

## Task 5: Frontend Types and API

**Files:**

- Modify: `pa-eval-frontend/src/modules/app-evaluation/types.ts`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/api/annotation-api.ts`
- Modify: `pa-eval-frontend/src/api/registry.ts`
- Create: `pa-eval-frontend/src/tests/app-evaluation/annotation-export-view.test.ts`

- [ ] **Step 1: Add source-level failing tests**

Create `annotation-export-view.test.ts`:

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const registry = readFileSync('src/api/registry.ts', 'utf8')
const apiSource = readFileSync(
  'src/modules/app-evaluation/api/annotation-api.ts',
  'utf8'
)
const typesSource = readFileSync(
  'src/modules/app-evaluation/types.ts',
  'utf8'
)

test('annotation export async job endpoints are registered', () => {
  assert.match(registry, /previewProjectAnnotationExport/)
  assert.match(registry, /createProjectAnnotationExportJob/)
  assert.match(registry, /getProjectAnnotationExportJob/)
  assert.match(registry, /downloadProjectAnnotationExportJob/)
  assert.match(registry, /annotation-queues\/:queueId\/export-jobs/)
})

test('annotation export api helpers support preview create poll and download', () => {
  assert.match(apiSource, /previewProjectAnnotationExport/)
  assert.match(apiSource, /createProjectAnnotationExportJob/)
  assert.match(apiSource, /pollAnnotationExportJob/)
  assert.match(apiSource, /downloadProjectAnnotationExportJob/)
})

test('annotation export types include scope format and preview payload', () => {
  assert.match(typesSource, /AnnotationExportScope/)
  assert.match(typesSource, /AnnotationExportFormat/)
  assert.match(typesSource, /AnnotationExportPreview/)
  assert.match(typesSource, /AnnotationExportJobRecord/)
})
```

- [ ] **Step 2: Run frontend test and verify failure**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
node --test src/tests/app-evaluation/annotation-export-view.test.ts
```

Expected: typecheck may pass before edits; node test FAILS because strings are missing.

- [ ] **Step 3: Add types**

In `types.ts` add:

```ts
export type AnnotationExportScope = 'filtered' | 'selected'
export type AnnotationExportFormat = 'xlsx' | 'csv' | 'txt'
export type AnnotationExportJobStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'

export type AnnotationExportPreviewRow = Record<string, string>

export type AnnotationExportPreview = {
  queue: AnnotationQueueRecord
  metrics: {
    total: number
    completed: number
    pending: number
  }
  scoreConfigs: ScoreConfigRecord[]
  metadataKeys: string[]
  previewItems: AnnotationExportPreviewRow[]
}

export type AnnotationExportJobRecord = {
  id: string
  projectId: string
  queueId: string
  scope: AnnotationExportScope
  format: AnnotationExportFormat
  status: AnnotationExportJobStatus
  totalCount: number
  exportedCount: number
  fileName: string
  fileSize: number
  errorMessage: string
  metadata: JsonObject
  createdAt: string
  updatedAt: string
  expiresAt: string
}
```

- [ ] **Step 4: Register endpoints**

In `registry.ts` after annotation item endpoints add:

```ts
previewProjectAnnotationExport: {
  method: 'POST',
  url: '/projects/:projectId/annotation-queues/:queueId/export-preview',
},
createProjectAnnotationExportJob: {
  method: 'POST',
  url: '/projects/:projectId/annotation-queues/:queueId/export-jobs',
},
getProjectAnnotationExportJob: {
  method: 'GET',
  url: '/projects/:projectId/annotation-queues/:queueId/export-jobs/:jobId',
},
downloadProjectAnnotationExportJob: {
  method: 'GET',
  url: '/projects/:projectId/annotation-queues/:queueId/export-jobs/:jobId/download',
  responseType: 'blob',
},
```

- [ ] **Step 5: Add API helpers**

Extend `AnnotationApiClient` with the four aliases.

Add helper input:

```ts
export type AnnotationExportRequestInput = {
  scope: AnnotationExportScope
  format?: AnnotationExportFormat
  filters?: AnnotationBatchFiltersInput
  itemIds?: string[]
  previewLimit?: number
  splitMetadata?: boolean
}
```

Add:

```ts
export function previewProjectAnnotationExport(
  api: AnnotationApiClient,
  projectId: string,
  queueId: string,
  input: AnnotationExportRequestInput
) {
  return api.previewProjectAnnotationExport<AnnotationExportPreview>({
    path: { projectId, queueId },
    body: {
      scope: input.scope,
      filters: input.filters ?? {},
      itemIds: input.itemIds ?? [],
      previewLimit: input.previewLimit ?? 20,
      splitMetadata: input.splitMetadata ?? false,
    },
  })
}
```

Add create/get/download/poll helpers mirroring dataset export helpers. `pollAnnotationExportJob` should use `intervalMs = 1200`, `timeoutMs = 120000`, and throw `new Error('导出任务仍在处理中，请稍后刷新后下载')` on timeout.

- [ ] **Step 6: Run frontend API tests**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
node --test src/tests/app-evaluation/annotation-export-view.test.ts
```

Expected: PASS.

## Task 6: Export Dialog UI

**Files:**

- Create: `pa-eval-frontend/src/modules/app-evaluation/components/annotation-export-dialog.tsx`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/components/format.ts`
- Modify: `pa-eval-frontend/src/tests/app-evaluation/annotation-export-view.test.ts`

- [ ] **Step 1: Extend source-level UI test**

Append to `annotation-export-view.test.ts`:

```ts
const dialogSource = readFileSync(
  'src/modules/app-evaluation/components/annotation-export-dialog.tsx',
  'utf8'
)

test('annotation export dialog shows summary metrics preview and config controls', () => {
  assert.match(dialogSource, /基本信息/)
  assert.match(dialogSource, /评分指标/)
  assert.match(dialogSource, /数据明细/)
  assert.match(dialogSource, /Metadata/)
  assert.match(dialogSource, /Excel/)
  assert.match(dialogSource, /CSV/)
  assert.match(dialogSource, /TXT/)
  assert.match(dialogSource, /创建导出任务/)
})
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
cd pa-eval-frontend
node --test src/tests/app-evaluation/annotation-export-view.test.ts
```

Expected: FAIL because dialog file is missing.

- [ ] **Step 3: Add shared blob download helper**

In `format.ts` add:

```ts
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
```

Update `datasets.tsx` to import and use this helper, then remove the local `downloadBlob`.

- [ ] **Step 4: Implement dialog component**

Component signature:

```ts
type AnnotationExportDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  api: Parameters<typeof previewProjectAnnotationExport>[0]
  projectId: string
  queueId: string
  scope: AnnotationExportScope
  filters: AnnotationBatchFiltersInput
  itemIds?: string[]
}
```

State:

```ts
const [format, setFormat] = useState<AnnotationExportFormat>('xlsx')
const [splitMetadata, setSplitMetadata] = useState(false)
const [isExporting, setIsExporting] = useState(false)
```

Use React Query:

```ts
const previewQuery = useQuery({
  queryKey: [
    'project-annotation-export-preview',
    api,
    projectId,
    queueId,
    scope,
    filters,
    itemIds,
    splitMetadata,
  ],
  queryFn: () =>
    previewProjectAnnotationExport(api, projectId, queueId, {
      scope,
      filters,
      itemIds,
      previewLimit: 20,
      splitMetadata,
    }),
  enabled: open && Boolean(queueId),
})
```

Submit flow:

```ts
const handleCreateExport = async () => {
  if (!previewQuery.data || previewQuery.data.metrics.total <= 0) return
  setIsExporting(true)
  try {
    const job = await createProjectAnnotationExportJob(api, projectId, queueId, {
      scope,
      format,
      filters,
      itemIds,
      splitMetadata,
    })
    toast.info('导出任务已创建，正在生成文件')
    const completedJob = await pollAnnotationExportJob(
      api,
      projectId,
      queueId,
      job.id
    )
    if (completedJob.status === 'FAILED') {
      throw new Error(completedJob.errorMessage || '标注数据导出失败')
    }
    const blob = await downloadProjectAnnotationExportJob(
      api,
      projectId,
      queueId,
      completedJob.id
    )
    downloadBlob(blob, completedJob.fileName || `${queueId}-${job.id}.zip`)
    toast.success('导出完成')
    onOpenChange(false)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '标注数据导出失败')
  } finally {
    setIsExporting(false)
  }
}
```

UI controls:

- Use existing `Dialog`.
- Use `RadioGroup` or buttons for file type.
- Use `Checkbox` or `Switch` for metadata split.
- Render preview table with stable max height and horizontal overflow.
- Disable submit if `previewQuery.data?.metrics.total` is 0 or `isExporting`.

- [ ] **Step 5: Run UI source test**

Run:

```bash
cd pa-eval-frontend
node --test src/tests/app-evaluation/annotation-export-view.test.ts
npm run typecheck
```

Expected: PASS.

## Task 7: Wire Dialog Into Annotation Detail Page

**Files:**

- Modify: `pa-eval-frontend/src/modules/app-evaluation/views/annotation-queue-detail.tsx`
- Modify: `pa-eval-frontend/src/modules/app-evaluation/components/annotation-queue-item-bulk-actions.tsx`
- Modify: `pa-eval-frontend/src/tests/app-evaluation/annotation-export-view.test.ts`

- [ ] **Step 1: Extend source-level wiring test**

Append:

```ts
const detailSource = readFileSync(
  'src/modules/app-evaluation/views/annotation-queue-detail.tsx',
  'utf8'
)
const bulkSource = readFileSync(
  'src/modules/app-evaluation/components/annotation-queue-item-bulk-actions.tsx',
  'utf8'
)

test('annotation queue detail exposes filtered and selected export dialogs', () => {
  assert.match(detailSource, /导出数据/)
  assert.match(detailSource, /AnnotationExportDialog/)
  assert.match(detailSource, /scope='filtered'/)
  assert.match(bulkSource, /导出选中/)
  assert.match(bulkSource, /onExportSelected/)
  assert.doesNotMatch(bulkSource, /downloadJson/)
})
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
cd pa-eval-frontend
node --test src/tests/app-evaluation/annotation-export-view.test.ts
```

Expected: FAIL because the dialog is not wired.

- [ ] **Step 3: Add filtered export state to detail page**

In `annotation-queue-detail.tsx`:

```ts
const [exportDialogOpen, setExportDialogOpen] = useState(false)
```

Add PageAction button:

```ts
{
  id: 'export-data',
  label: '导出数据',
  icon: Download,
  iconPosition: 'start' as const,
  size: 'sm' as const,
  onClick: () => setExportDialogOpen(true),
}
```

Mount:

```tsx
<AnnotationExportDialog
  open={exportDialogOpen}
  onOpenChange={setExportDialogOpen}
  api={$api}
  projectId={projectId}
  queueId={queueId}
  scope='filtered'
  filters={buildAnnotationBatchFilters(queryState)}
/>
```

- [ ] **Step 4: Add selected export flow to bulk actions**

Change props:

```ts
onExportSelected?: (itemIds: string[]) => void
```

Replace current `handleExport` body with:

```ts
const handleExport = () => {
  onExportSelected?.(itemIds)
}
```

In detail page, keep:

```ts
const [selectedExportItemIds, setSelectedExportItemIds] = useState<string[]>([])
const [selectedExportDialogOpen, setSelectedExportDialogOpen] = useState(false)
```

Pass:

```tsx
onExportSelected={(ids) => {
  setSelectedExportItemIds(ids)
  setSelectedExportDialogOpen(true)
}}
```

Mount second dialog:

```tsx
<AnnotationExportDialog
  open={selectedExportDialogOpen}
  onOpenChange={setSelectedExportDialogOpen}
  api={$api}
  projectId={projectId}
  queueId={queueId}
  scope='selected'
  filters={{ itemIds: selectedExportItemIds }}
  itemIds={selectedExportItemIds}
/>
```

- [ ] **Step 5: Run frontend tests**

Run:

```bash
cd pa-eval-frontend
node --test src/tests/app-evaluation/annotation-export-view.test.ts
npm run typecheck
```

Expected: PASS.

## Task 8: End-to-End Verification

**Files:**

- No new files. This task verifies the full implementation.

- [ ] **Step 1: Run backend focused tests**

Run:

```bash
cd pa-eval-backend
uv run pytest tests/test_annotation_exports.py tests/test_pa_migration_schema.py -q
```

Expected: PASS.

- [ ] **Step 2: Run backend full tests**

Run:

```bash
cd pa-eval-backend
uv run pytest -q
```

Expected: PASS.

- [ ] **Step 3: Run frontend focused tests**

Run:

```bash
cd pa-eval-frontend
node --test src/tests/app-evaluation/annotation-export-view.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run frontend typecheck and build**

Run:

```bash
cd pa-eval-frontend
npm run typecheck
npm run build
```

Expected: PASS.

- [ ] **Step 5: Check git state without committing**

Run:

```bash
git status --short
```

Expected: only intended files from this plan plus the already approved spec/plan are changed. Do not commit unless the user explicitly asks.

## Self-Review

- Spec coverage: The plan covers dialog, preview, filtered/selected ranges, metadata split, xlsx/csv/txt, zip, async job, migration, safe file download, score label mapping, Excel truncation, and tests.
- Placeholder scan: The plan avoids open-ended placeholder wording. Each task names files, commands, and expected results.
- Type consistency: Frontend uses `AnnotationExportScope`, `AnnotationExportFormat`, `AnnotationExportPreview`, and `AnnotationExportJobRecord`; API helper names match registry aliases. Backend uses `scope`, `format`, `splitMetadata`, `itemIds`, and camelCase public job payloads consistently.
