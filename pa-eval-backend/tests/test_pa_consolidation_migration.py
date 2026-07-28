from pathlib import Path


MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "versions"
    / "20260723_0015_create_consolidated_pa_tables.py"
)


def test_consolidation_migration_has_expand_only_tables_and_report_columns() -> None:
    content = MIGRATION.read_text(encoding="utf-8")

    assert 'down_revision = "20260719_0014"' in content
    for table in (
        "pa_resource_extensions",
        "pa_evaluation_jobs",
        "pa_job_executions",
    ):
        assert f'"{table}"' in content
        assert f'_comment_table("{table}"' in content
        assert f'_comment_audit_columns("{table}")' in content

    for column in (
        "is_badcase",
        "badcase_rule_snapshot",
        "primary_score_value",
        "badcase_reason",
        "badcase_comment",
        "badcase_source_type",
    ):
        assert f'sa.Column("{column}"' in content


def test_consolidation_migration_defines_constraints_indexes_and_downgrade() -> None:
    content = MIGRATION.read_text(encoding="utf-8")

    for expected in (
        "pa_resource_extensions_resource_uidx",
        "pa_evaluation_jobs_project_update_idx",
        "pa_job_executions_idempotency_uidx",
        "pa_job_executions_claim_idx",
        "pa_job_executions_project_update_idx",
        "pa_evaluation_jobs_trigger_type_check",
        "pa_job_executions_status_check",
    ):
        assert expected in content

    assert '_drop_table_if_exists("pa_job_executions")' in content
    assert '_drop_table_if_exists("pa_evaluation_jobs")' in content
    assert '_drop_table_if_exists("pa_resource_extensions")' in content
    assert 'op.drop_column("pa_evaluation_report_items", column_name)' in content


def test_consolidation_migration_never_drops_legacy_tables_on_upgrade() -> None:
    content = MIGRATION.read_text(encoding="utf-8")
    upgrade = content.split("def upgrade()", 1)[1].split("def downgrade()", 1)[0]

    assert "op.drop_table" not in upgrade
    assert "DROP TABLE" not in upgrade.upper()


def test_execution_idempotency_index_coalesces_nullable_definition_id() -> None:
    content = MIGRATION.read_text(encoding="utf-8")

    assert "CREATE UNIQUE INDEX pa_job_executions_idempotency_uidx" in content
    assert "COALESCE(definition_id, '')" in content
    assert "WHERE idempotency_key <> ''" in content
