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
    "pa_project_llm_connections",
    "pa_project_model_definitions",
    "pa_project_model_settings",
    "pa_audit_logs",
    "pa_dataset_export_jobs",
)


def test_pa_schema_migrations_are_defined_in_order() -> None:
    migration_files = sorted(
        path
        for path in MIGRATIONS_DIR.glob("*.py")
        if path.name != "__init__.py"
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
    ]


def test_audit_action_normalization_migration_is_defined() -> None:
    migration = MIGRATIONS_DIR / "20260707_0005_normalize_pa_audit_actions.py"
    content = migration.read_text(encoding="utf-8")

    assert "UPDATE pa_audit_logs" in content
    assert "UPPER(action)" in content
    assert "UPPER(status)" in content


def test_langfuse_score_config_normalization_migration_is_defined() -> None:
    migration = MIGRATIONS_DIR / "20260707_0007_normalize_langfuse_score_config_categories.py"
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
    assert "ON DELETE CASCADE" in content or "ondelete=\"CASCADE\"" in content

    for column in AUDIT_COLUMNS:
        assert f"\"{column}\"" in content

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


def test_final_migration_does_not_use_incremental_column_patches() -> None:
    migration = MIGRATIONS_DIR / "20260705_0001_create_pa_eval_tables.py"
    content = migration.read_text(encoding="utf-8")

    assert "_add_column_once" not in content
    assert "op.add_column" not in content


def _find_table_block(contents: list[str], table_name: str) -> str:
    for content in contents:
        marker = f"op.create_table(\n            \"{table_name}\""
        if marker not in content:
            continue
        table_start = content.index(marker)
        next_table_start = content.find("op.create_table(", table_start + 1)
        table_end = next_table_start if next_table_start != -1 else len(content)
        return content[table_start:table_end]
    raise AssertionError(f"table {table_name} not found in migrations")
