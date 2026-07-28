from pathlib import Path


MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "migrations/versions/20260723_0016_contract_legacy_pa_tables.py"
)

DROP_TABLES = (
    "pa_evaluation_report_badcases",
    "pa_evaluation_report_flowbacks",
    "pa_trace_bulk_jobs",
    "pa_annotation_export_jobs",
    "pa_dataset_export_jobs",
    "pa_scheduled_job_execution_logs",
    "pa_auto_evaluation_runs",
    "pa_scheduled_jobs",
    "pa_auto_evaluation_tasks",
    "pa_annotation_queue_settings",
    "pa_project_model_settings",
)


def test_contract_migration_has_preflight_drop_and_reversible_restore() -> None:
    content = MIGRATION.read_text(encoding="utf-8")

    assert 'revision = "20260723_0016"' in content
    assert 'down_revision = "20260723_0015"' in content
    assert "_assert_contract_ready" in content
    assert "pa_evaluation_jobs" in content
    assert "pa_job_executions" in content
    assert "pa_resource_extensions" in content
    assert "RUNNING" in content
    assert "RUNNING consolidated jobs" in content

    drop_positions = []
    for table in DROP_TABLES:
        drop_marker = f'_drop_table_if_exists("{table}")'
        create_marker = f'_restore_{table}()'
        assert drop_marker in content
        assert create_marker in content
        assert f"COMMENT ON TABLE {table}" in content
        assert f"INSERT INTO {table}" in content
        drop_positions.append(content.index(drop_marker))

    assert drop_positions == sorted(drop_positions)


def test_contract_migration_declares_final_twelve_pa_tables() -> None:
    content = MIGRATION.read_text(encoding="utf-8")

    assert "FINAL_PA_TABLES" in content
    assert "len(FINAL_PA_TABLES) == 12" in content


def test_contract_preflight_locks_tables_and_compares_business_fields() -> None:
    content = MIGRATION.read_text(encoding="utf-8")

    assert "LOCK TABLE" in content
    assert "SHARE ROW EXCLUSIVE MODE" in content
    assert "_assert_zero" in content
    assert "LEFT JOIN" in content
    assert "FULL OUTER JOIN" not in content
    assert "IS DISTINCT FROM" in content
    assert "resource extension field mismatch" in content
    assert "evaluation job field mismatch" in content
    assert "execution field mismatch" in content
    assert "execution snapshot mismatch" in content
    assert "badcase snapshot mismatch" in content


def test_contract_preflight_requires_every_legacy_and_final_table() -> None:
    content = MIGRATION.read_text(encoding="utf-8")

    assert "LEGACY_PA_TABLES" in content
    assert "missing required table" in content
    assert "if all(" not in content


def test_contract_preflight_rejects_unexpected_pa_tables_and_orphan_references() -> None:
    content = MIGRATION.read_text(encoding="utf-8")
    preflight_content = content.split("def _assert_contract_ready()", 1)[1].split(
        "def upgrade()", 1
    )[0]

    assert "unexpected PA tables" in content
    assert "get_table_names" in content
    assert '"contract reference mismatch"' in preflight_content
    assert "ORPHAN_AUTO_EXECUTION_DEFINITION" in preflight_content
    assert "ORPHAN_ANNOTATION_ASSIGNMENT_ASSIGNEE" in preflight_content


def test_contract_preflight_does_not_use_reserved_keyword_aliases() -> None:
    content = MIGRATION.read_text(encoding="utf-8")
    preflight_content = content.split("def _assert_contract_ready()", 1)[1].split(
        "def upgrade()", 1
    )[0]

    assert ") references" not in preflight_content
    assert ") reference_checks" in preflight_content


def test_contract_left_joins_filter_each_consolidated_domain_first() -> None:
    content = MIGRATION.read_text(encoding="utf-8")
    preflight_content = content.split("def _assert_contract_ready()", 1)[1].split(
        "def upgrade()", 1
    )[0]
    mapped_field_checks = preflight_content.split(
        '"resource extension field mismatch"', 1
    )[1].split('"execution rollback snapshot mismatch"', 1)[0]

    assert "LEFT JOIN pa_resource_extensions" not in mapped_field_checks
    assert "LEFT JOIN pa_evaluation_jobs" not in mapped_field_checks
    assert "LEFT JOIN pa_job_executions" not in mapped_field_checks
    assert "FROM pa_resource_extensions\n" in mapped_field_checks
    assert "FROM pa_evaluation_jobs\n" in mapped_field_checks
    assert "FROM pa_job_executions\n" in mapped_field_checks


def test_contract_badcase_count_uses_lossless_snapshot_cardinality() -> None:
    content = MIGRATION.read_text(encoding="utf-8")

    assert "SUM(" in content
    assert "jsonb_array_length(item.extra -> 'paLegacyBadcases')" in content


def test_online_modules_do_not_reference_contracted_tables() -> None:
    backend_root = Path(__file__).resolve().parents[1]
    online_modules = (
        backend_root / "app/auto_evaluations.py",
        backend_root / "app/scheduled_jobs.py",
        backend_root / "app/langfuse_db.py",
    )

    for module in online_modules:
        content = module.read_text(encoding="utf-8")
        for table in DROP_TABLES:
            assert table not in content, f"{module.name} still references {table}"


def test_contract_downgrade_restores_latest_execution_fields_and_report_fk() -> None:
    content = MIGRATION.read_text(encoding="utf-8")

    assert "result_payload ->> 'autoEvaluationTaskId'" in content
    assert "result_payload ->> 'autoEvaluationRunId'" in content
    assert "WHEN 'SUCCEEDED' THEN 'COMPLETED'" in content
    assert "_restore_report_task_foreign_key" in content


def test_contract_downgrade_does_not_run_incompatible_legacy_alignment() -> None:
    content = MIGRATION.read_text(encoding="utf-8")

    assert "20260707_0003_align_legacy_pa_tables" not in content


def test_contract_downgrade_expands_lossless_legacy_snapshots() -> None:
    content = MIGRATION.read_text(encoding="utf-8")

    assert "payload ->> 'legacyId'" in content
    assert "jsonb_array_elements" in content
    assert "paLegacyBadcases" in content
    assert "legacy ->> 'scoreName'" in content
    assert "legacy ->> 'flowbackStatus'" in content
    assert "result_payload ->> 'durationText'" in content
    assert "result_payload -> 'triggerPayload'" in content
    assert "schedule_config -> 'paLegacy' -> 'executionStats'" in content
    assert "schedule_config -> 'paLegacy' ->> 'lockOwner'" in content
    assert "result_payload ->> 'itemId'" in content
    assert "result_payload -> 'payload'" in content


def test_contract_downgrade_comments_every_queue_settings_column() -> None:
    content = MIGRATION.read_text(encoding="utf-8")

    for column in (
        "create_by",
        "update_by",
        "create_date",
        "update_date",
        "queue_id",
        "project_id",
        "assignment_strategy",
        "assignment_weights",
    ):
        assert f"COMMENT ON COLUMN pa_annotation_queue_settings.{column}" in content


def test_contract_preflight_checks_audit_fields_without_rejecting_newer_rows() -> None:
    content = MIGRATION.read_text(encoding="utf-8")
    preflight_content = content.split("def _assert_contract_ready()", 1)[1].split(
        "def upgrade()", 1
    )[0]

    assert '"audit field mismatch"' in preflight_content
    assert "consolidated.create_by IS DISTINCT FROM legacy.create_by" in preflight_content
    assert "consolidated.create_date IS DISTINCT FROM legacy.create_date" in preflight_content
    assert "consolidated.update_date <= legacy.update_date" in preflight_content
    assert "consolidated.update_by IS DISTINCT FROM legacy.update_by" in preflight_content
    assert "consolidated.update_date IS DISTINCT FROM legacy.update_date" in preflight_content


def test_contract_preflight_checks_job_and_execution_discriminators() -> None:
    content = MIGRATION.read_text(encoding="utf-8")
    preflight_content = content.split("def _assert_contract_ready()", 1)[1].split(
        "def upgrade()", 1
    )[0]

    assert "legacy_source_type = 'AUTO_EVALUATION_TASK'\n                   AND trigger_type = 'MANUAL'" in preflight_content
    assert "legacy_source_type = 'SCHEDULED_JOB'\n                   AND trigger_type = 'SCHEDULED'" in preflight_content
    assert "'AUTO_EVALUATION'::text AS job_type" in preflight_content
    assert "'SCHEDULED_EVALUATION'" in preflight_content
    assert "'DATASET_EXPORT'" in preflight_content
    assert "'ANNOTATION_EXPORT'" in preflight_content
    assert "CASE job_type WHEN 'DATASET_IMPORT'" in preflight_content
    assert "'REPORT_FLOWBACK'" in preflight_content
    assert "execution.job_type IS DISTINCT FROM expected.job_type" in preflight_content


def test_contract_always_gates_lossless_execution_rollback_snapshots() -> None:
    content = MIGRATION.read_text(encoding="utf-8")
    normalized_content = " ".join(content.split())
    preflight_content = content.split("def _assert_contract_ready()", 1)[1].split(
        "def upgrade()", 1
    )[0]

    assert '"execution rollback snapshot mismatch"' in preflight_content
    for source_type in (
        "AUTO_EVALUATION_RUN",
        "SCHEDULED_JOB_EXECUTION_LOG",
        "DATASET_EXPORT_JOB",
        "ANNOTATION_EXPORT_JOB",
        "TRACE_BULK_JOB",
        "REPORT_FLOWBACK",
    ):
        assert source_type in preflight_content
    assert "execution.result_payload -> 'paLegacy'" in preflight_content
    assert "IS DISTINCT FROM legacy.snapshot" in preflight_content
    assert "(execution.result_payload - 'paLegacy')" in preflight_content
    assert "COALESCE(result_payload -> 'paLegacy' ->> 'duration_text'" in content
    assert "COALESCE(result_payload -> 'paLegacy' -> 'trigger_payload'" in content
    assert "result_payload - 'paLegacy'" in content
    for flowback_field in (
        "target_dataset_name",
        "target_dataset_created",
        "item_id",
        "target_type",
        "target_id",
        "payload",
        "result",
        "created_by",
        "created_at",
        "updated_at",
        "completed_at",
    ):
        assert (
            f"result_payload -> 'paLegacy' ->> '{flowback_field}'"
            in normalized_content
        ) or (
            f"result_payload -> 'paLegacy' -> '{flowback_field}'"
            in normalized_content
        )
