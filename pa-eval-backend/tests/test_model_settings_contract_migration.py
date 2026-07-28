from pathlib import Path


MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "migrations/versions/20260723_0017_drop_model_setting_shadow_tables.py"
)


def test_migration_preflights_mappings_then_drops_both_shadow_tables() -> None:
    content = MIGRATION.read_text(encoding="utf-8")

    assert 'revision = "20260723_0017"' in content
    assert 'down_revision = "20260723_0016"' in content
    assert "NATIVE_RESOURCE_SYNC" in content
    assert "externalResourceId" in content
    assert "llm_api_keys" in content
    assert "models" in content
    assert "LOCK TABLE" in content
    assert '_drop_table_if_exists("pa_project_llm_connections")' in content
    assert '_drop_table_if_exists("pa_project_model_definitions")' in content


def test_migration_downgrade_recreates_commented_audited_tables() -> None:
    content = MIGRATION.read_text(encoding="utf-8")

    for table in (
        "pa_project_llm_connections",
        "pa_project_model_definitions",
    ):
        assert f'op.create_table(\n        "{table}"' in content
        assert f"COMMENT ON TABLE {table}" in content
    for audit_column in ("create_by", "update_by", "create_date", "update_date"):
        assert content.count(f'"{audit_column}"') >= 2
    assert "LANGFUSE_ENCRYPTION_KEY" in content
    assert "Settings().langfuse_encryption_key" in content
    assert 'os.environ.get("LANGFUSE_ENCRYPTION_KEY"' not in content
    assert "_restore_current_native_resources" in content
    assert "INSERT INTO pa_project_llm_connections" in content
    assert "INSERT INTO pa_project_model_definitions" in content


def test_online_reader_has_no_shadow_table_references() -> None:
    backend = Path(__file__).resolve().parents[1]
    content = (backend / "app/langfuse_db.py").read_text(encoding="utf-8")

    assert "pa_project_llm_connections" not in content
    assert "pa_project_model_definitions" not in content
