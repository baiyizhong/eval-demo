from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parent.parent
APP_ROOT = BACKEND_ROOT / "app"
SCRIPT_ROOT = BACKEND_ROOT / "scripts"

REMOVED_RUNTIME_MARKERS = {
    "pa_consolidated_writes_enabled",
    "pa_consolidated_reads_enabled",
    "pa_langfuse_native_resource_writes_enabled",
    "consolidated_writes_enabled",
    "consolidated_reads_enabled",
    "app.consolidation.backfill",
    "app.consolidation.verification",
    "app.consolidation.cli",
    "app.model_settings_migration",
    "sync_native_model_settings",
}

RETIRED_PA_TABLES = {
    "pa_project_model_settings",
    "pa_project_llm_connections",
    "pa_project_model_definitions",
    "pa_annotation_queue_settings",
    "pa_auto_evaluation_tasks",
    "pa_auto_evaluation_runs",
    "pa_scheduled_jobs",
    "pa_scheduled_job_execution_logs",
    "pa_dataset_export_jobs",
    "pa_annotation_export_jobs",
    "pa_trace_bulk_jobs",
    "pa_evaluation_report_flowbacks",
    "pa_evaluation_report_badcases",
}

REMOVED_NATIVE_WRITE_READER_METHODS = {
    "create_dataset_for_user",
    "update_dataset_for_user",
    "delete_dataset_for_user",
    "create_dataset_item_for_user",
    "update_dataset_item_for_user",
    "archive_dataset_item_for_user",
    "delete_dataset_item_for_user",
    "ensure_default_score_config_for_user",
    "create_score_config_for_user",
    "update_score_config_for_user",
    "set_score_config_archived_for_user",
    "create_annotation_queue_for_user",
    "update_annotation_queue_for_user",
    "delete_annotation_queue_for_user",
    "create_annotation_queue_item_for_user",
    "delete_annotation_queue_items_for_user",
    "create_trace_annotation_task_for_user",
    "create_langfuse_evaluator",
    "add_annotation_item_to_dataset_for_user",
    "add_traces_to_dataset_for_user",
    "save_annotation_scores_for_user",
    "complete_annotation_queue_item_for_user",
    "complete_annotation_queue_items_for_user",
    "_replace_annotation_assignments",
    "_ensure_default_score_configs",
    "_get_or_create_annotation_queue",
}


def _python_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return [path for path in sorted(root.rglob("*.py")) if "__pycache__" not in path.parts]


def test_runtime_code_does_not_expose_old_cutover_switches() -> None:
    violations: list[str] = []
    for path in _python_files(APP_ROOT) + _python_files(SCRIPT_ROOT):
        text = path.read_text(encoding="utf-8")
        for marker in REMOVED_RUNTIME_MARKERS:
            if marker in text:
                violations.append(f"{path.relative_to(BACKEND_ROOT)}: {marker}")

    assert violations == []


def test_runtime_code_does_not_reference_retired_pa_tables() -> None:
    violations: list[str] = []
    for path in _python_files(APP_ROOT) + _python_files(SCRIPT_ROOT):
        text = path.read_text(encoding="utf-8")
        for table in RETIRED_PA_TABLES:
            if table in text:
                violations.append(f"{path.relative_to(BACKEND_ROOT)}: {table}")

    assert violations == []


def test_database_reader_no_longer_defines_native_write_methods() -> None:
    source = (APP_ROOT / "langfuse_db.py").read_text(encoding="utf-8")

    violations = [
        method
        for method in sorted(REMOVED_NATIVE_WRITE_READER_METHODS)
        if f"async def {method}(" in source
    ]

    assert violations == []
