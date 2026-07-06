from pathlib import Path


MIGRATIONS_DIR = Path(__file__).resolve().parents[1] / "migrations" / "versions"
AUDIT_COLUMNS = ("create_by", "create_date", "update_by", "update_date")
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
