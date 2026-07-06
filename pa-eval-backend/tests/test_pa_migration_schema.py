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
)


def test_pa_schema_is_defined_by_one_final_migration() -> None:
    migration_files = sorted(
        path
        for path in MIGRATIONS_DIR.glob("*.py")
        if path.name != "__init__.py"
    )

    assert [path.name for path in migration_files] == [
        "20260705_0001_create_pa_eval_tables.py"
    ]


def test_pa_tables_use_physical_delete_and_uniform_audit_fields() -> None:
    migration = MIGRATIONS_DIR / "20260705_0001_create_pa_eval_tables.py"
    content = migration.read_text(encoding="utf-8")

    assert "deleted_at" not in content
    assert "ON DELETE CASCADE" in content or "ondelete=\"CASCADE\"" in content

    for column in AUDIT_COLUMNS:
        assert f"\"{column}\"" in content

    for table_name in PA_TABLES:
        table_start = content.index(f"op.create_table(\n            \"{table_name}\"")
        next_table_start = content.find("op.create_table(", table_start + 1)
        table_end = next_table_start if next_table_start != -1 else len(content)
        table_block = content[table_start:table_end]

        assert "*_audit_columns()" in table_block


def test_pa_tables_define_audit_columns_first() -> None:
    migration = MIGRATIONS_DIR / "20260705_0001_create_pa_eval_tables.py"
    content = migration.read_text(encoding="utf-8")

    for table_name in PA_TABLES:
        table_start = content.index(f"op.create_table(\n            \"{table_name}\"")
        next_table_start = content.find("op.create_table(", table_start + 1)
        table_end = next_table_start if next_table_start != -1 else len(content)
        table_block = content[table_start:table_end]
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
