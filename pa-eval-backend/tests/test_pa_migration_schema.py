from pathlib import Path


MIGRATIONS_DIR = Path(__file__).resolve().parents[1] / "migrations" / "versions"
AUDIT_COLUMNS = ("create_by", "update_by", "create_date", "update_date")
PA_TABLES = (
    "pa_evaluators",
    "pa_evaluation_report_templates",
    "pa_project_api_keys",
    "pa_auto_evaluation_tasks",
    "pa_auto_evaluation_runs",
    "pa_evaluation_reports",
    "pa_evaluation_report_items",
    "pa_evaluation_report_badcases",
    "pa_evaluation_report_flowbacks",
    "pa_project_model_settings",
    "pa_audit_logs",
    "pa_dataset_export_jobs",
    "pa_scheduled_jobs",
    "pa_scheduled_job_execution_logs",
    "pa_annotation_queue_settings",
    "pa_annotation_queue_item_assignments",
    "pa_annotation_export_jobs",
    "pa_trace_bulk_jobs",
    "pa_evaluation_jobs",
)
DEPRECATED_MODEL_TABLES = (
    "pa_project_llm_connections",
    "pa_project_model_definitions",
)


def test_pa_schema_migrations_are_defined_in_order() -> None:
    migration_files = sorted(
        path for path in MIGRATIONS_DIR.glob("*.py") if path.name != "__init__.py"
    )

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
        "20260714_0013_add_evaluator_outputs_and_score_mapping.py",
        "20260718_0014_deprecate_redundant_project_model_tables.py",
        "20260719_0014_create_pa_trace_bulk_jobs.py",
        "20260723_0015_create_evaluation_jobs.py",
    ]


def test_evaluation_jobs_migration_is_reversible_and_complete() -> None:
    migration = MIGRATIONS_DIR / "20260723_0015_create_evaluation_jobs.py"
    content = migration.read_text(encoding="utf-8")

    assert '"pa_evaluation_jobs"' in content
    assert "def downgrade()" in content
    assert 'op.drop_table("pa_evaluation_jobs")' in content
    assert "NOW()" in content
    for column in (
        "job_type",
        "routing_key",
        "idempotency_key",
        "status",
        "attempt_count",
        "max_attempts",
        "next_attempt_at",
        "lease_owner",
        "lease_expires_at",
        "heartbeat_at",
        "payload",
        "result_summary",
        "raw_result_object_key",
        "error_code",
        "error_message",
    ):
        assert f'"{column}"' in content


def test_evaluation_jobs_migration_orders_upgrade_and_downgrade_operations() -> None:
    migration = MIGRATIONS_DIR / "20260723_0015_create_evaluation_jobs.py"
    content = migration.read_text(encoding="utf-8")
    upgrade = content[content.index("def upgrade()") : content.index("def downgrade()")]
    downgrade = content[content.index("def downgrade()") :]

    run_columns = (
        "config_snapshot",
        "idempotency_key",
        "cancel_requested_at",
        "queued_at",
        "sample_manifest_object_key",
        "sample_manifest_hash",
    )
    assert max(upgrade.index(f'"{column}"') for column in run_columns) < upgrade.index(
        'op.create_table(\n        "pa_evaluation_jobs"'
    )
    assert downgrade.index('op.drop_table("pa_evaluation_jobs")') < min(
        downgrade.index(f'"{column}"') for column in run_columns
    )
    downgrade_positions = [
        downgrade.index(f'"{column}"') for column in reversed(run_columns)
    ]
    assert downgrade_positions == sorted(downgrade_positions)


def test_evaluation_jobs_migration_defines_constraints_and_indexes() -> None:
    migration = MIGRATIONS_DIR / "20260723_0015_create_evaluation_jobs.py"
    content = migration.read_text(encoding="utf-8")

    for constraint in (
        "pa_evaluation_jobs_job_type_check",
        "pa_evaluation_jobs_status_check",
        "pa_evaluation_jobs_batch_range_check",
        "pa_evaluation_jobs_attempt_count_check",
    ):
        assert constraint in content
    assert "batch_start IS NOT NULL AND batch_end IS NOT NULL" in content
    assert "pa_evaluation_jobs_ready_idx" in content
    assert "pa_evaluation_jobs_running_lease_idx" in content
    assert "status = 'RUNNING'" in content




def test_trace_bulk_jobs_table_is_defined_with_comments_and_recovery_indexes() -> None:
    migration = MIGRATIONS_DIR / "20260719_0014_create_pa_trace_bulk_jobs.py"
    content = migration.read_text(encoding="utf-8")
    business_columns = (
        "id",
        "project_id",
        "user_id",
        "job_type",
        "status",
        "selection_type",
        "selection_payload",
        "operation_payload",
        "cursor_payload",
        "result_payload",
        "total_count",
        "completed_count",
        "success_count",
        "failure_count",
        "attempt_count",
        "error_message",
        "started_at",
        "completed_at",
        "expires_at",
        "lock_owner",
        "lock_until",
    )

    assert 'down_revision = "20260714_0013"' in content
    assert "COMMENT ON TABLE pa_trace_bulk_jobs" in content
    assert "pa_trace_bulk_jobs_job_type_check" in content
    assert "pa_trace_bulk_jobs_status_check" in content
    assert "pa_trace_bulk_jobs_selection_type_check" in content
    assert "pa_trace_bulk_jobs_claim_idx" in content
    assert "pa_trace_bulk_jobs_project_user_update_idx" in content
    assert 'ondelete="CASCADE"' in content
    assert '_drop_table_if_exists("pa_trace_bulk_jobs")' in content

    for column in business_columns:
        assert f'"{column}"' in content

    for column in (*AUDIT_COLUMNS, *business_columns):
        assert f"COMMENT ON COLUMN pa_trace_bulk_jobs.{column}" in content


def test_annotation_export_jobs_table_is_defined_with_comments() -> None:
    migration = MIGRATIONS_DIR / "20260711_0012_create_pa_annotation_export_jobs.py"
    content = migration.read_text(encoding="utf-8")
    business_columns = (
        "id",
        "project_id",
        "queue_id",
        "scope",
        "format",
        "status",
        "total_count",
        "exported_count",
        "file_name",
        "file_path",
        "file_size",
        "error_message",
        "started_at",
        "completed_at",
        "expires_at",
        "metadata",
    )

    assert "pa_annotation_export_jobs" in content
    assert "COMMENT ON TABLE pa_annotation_export_jobs" in content
    assert "'{}'::jsonb" in content
    assert "pa_annotation_export_jobs_scope_check" in content
    assert "pa_annotation_export_jobs_format_check" in content
    assert "pa_annotation_export_jobs_status_check" in content
    assert "pa_annotation_export_jobs_project_queue_idx" in content
    assert "pa_annotation_export_jobs_project_update_idx" in content

    for column in business_columns:
        assert f'"{column}"' in content

    for column in (*AUDIT_COLUMNS, *business_columns):
        assert f"COMMENT ON COLUMN pa_annotation_export_jobs.{column}" in content


def test_annotation_assignment_tables_are_defined_with_comments() -> None:
    migration = MIGRATIONS_DIR / "20260711_0011_create_annotation_assignment_tables.py"
    content = migration.read_text(encoding="utf-8")

    assert "pa_annotation_queue_settings" in content
    assert "pa_annotation_queue_item_assignments" in content
    assert "assignment_strategy" in content
    assert "assignment_weights" in content
    assert "assignee_user_id" in content
    assert "COMMENT ON TABLE pa_annotation_queue_settings" in content
    assert "COMMENT ON TABLE pa_annotation_queue_item_assignments" in content
    assert (
        "COMMENT ON COLUMN pa_annotation_queue_settings.assignment_strategy" in content
    )
    assert (
        "COMMENT ON COLUMN pa_annotation_queue_item_assignments.assignee_user_id"
        in content
    )


def test_audit_action_normalization_migration_is_defined() -> None:
    migration = MIGRATIONS_DIR / "20260707_0005_normalize_pa_audit_actions.py"
    content = migration.read_text(encoding="utf-8")

    assert "UPDATE pa_audit_logs" in content
    assert "UPPER(action)" in content
    assert "UPPER(status)" in content


def test_langfuse_score_config_normalization_migration_is_defined() -> None:
    migration = (
        MIGRATIONS_DIR / "20260707_0007_normalize_langfuse_score_config_categories.py"
    )
    content = migration.read_text(encoding="utf-8")

    assert "UPDATE score_configs" in content
    assert "data_type::text IN ('NUMERIC', 'TEXT')" in content
    assert '"label":"True"' in content
    assert "jsonb_array_elements(categories)" in content


def test_pa_tables_use_physical_delete_and_uniform_audit_fields() -> None:
    contents = [
        path.read_text(encoding="utf-8")
        for path in sorted(MIGRATIONS_DIR.glob("*.py"))
        if path.name != "__init__.py"
    ]
    content = "\n".join(contents)

    assert "deleted_at" not in content
    assert "ON DELETE CASCADE" in content or 'ondelete="CASCADE"' in content

    for column in AUDIT_COLUMNS:
        assert f'"{column}"' in content

    for table_name in PA_TABLES:
        table_block = _find_table_block(contents, table_name)

        assert "*_audit_columns()" in table_block


def test_pa_tables_define_audit_columns_first() -> None:
    contents = [
        path.read_text(encoding="utf-8")
        for path in sorted(MIGRATIONS_DIR.glob("*.py"))
        if path.name != "__init__.py"
    ]

    for table_name in PA_TABLES:
        table_block = _find_table_block(contents, table_name)
        first_column = table_block.find("sa.Column(")
        audit_columns = table_block.find("*_audit_columns()")

        assert audit_columns != -1
        assert audit_columns < first_column


def test_audit_columns_keep_required_order() -> None:
    migration = MIGRATIONS_DIR / "20260705_0001_create_pa_eval_tables.py"
    content = migration.read_text(encoding="utf-8")
    helper_start = content.index("def _audit_columns()")
    helper_end = content.index("\n\ndef upgrade()", helper_start)
    helper_block = content[helper_start:helper_end]

    positions = [helper_block.index(f'"{column}"') for column in AUDIT_COLUMNS]

    assert positions == sorted(positions)


def test_project_api_keys_do_not_use_status_or_last_used_columns() -> None:
    migration = MIGRATIONS_DIR / "20260705_0001_create_pa_eval_tables.py"
    content = migration.read_text(encoding="utf-8")
    table_start = content.index('op.create_table(\n            "pa_project_api_keys"')
    next_table_start = content.find("op.create_table(", table_start + 1)
    table_end = next_table_start if next_table_start != -1 else len(content)
    table_block = content[table_start:table_end]

    assert '"status"' not in table_block
    assert '"last_used_at"' not in table_block
    assert "pa_project_api_keys_project_status_idx" not in content


def test_redundant_project_model_tables_are_deprecated_by_migration() -> None:
    migration = (
        MIGRATIONS_DIR / "20260718_0014_deprecate_redundant_project_model_tables.py"
    )
    content = migration.read_text(encoding="utf-8")

    assert "Langfuse LLM Connections" in content
    assert "Langfuse models" in content
    for table_name in DEPRECATED_MODEL_TABLES:
        assert table_name not in PA_TABLES
        assert f'_drop_table_if_exists("{table_name}")' in content
        assert f'"{table_name}"' in content


def test_final_migration_does_not_use_incremental_column_patches() -> None:
    migration = MIGRATIONS_DIR / "20260705_0001_create_pa_eval_tables.py"
    content = migration.read_text(encoding="utf-8")

    assert "_add_column_once" not in content
    assert "op.add_column" not in content


def _find_table_block(contents: list[str], table_name: str) -> str:
    for content in contents:
        marker = f'op.create_table(\n            "{table_name}"'
        if marker not in content:
            marker = f'op.create_table(\n        "{table_name}"'
        if marker not in content:
            continue
        table_start = content.index(marker)
        next_table_start = content.find("op.create_table(", table_start + 1)
        table_end = next_table_start if next_table_start != -1 else len(content)
        return content[table_start:table_end]
    raise AssertionError(f"table {table_name} not found in migrations")
