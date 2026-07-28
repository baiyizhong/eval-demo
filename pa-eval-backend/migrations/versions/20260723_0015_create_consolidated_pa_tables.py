"""create consolidated PA tables

Revision ID: 20260723_0015
Revises: 20260719_0014
Create Date: 2026-07-23 00:15:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260723_0015"
down_revision = "20260719_0014"
branch_labels = None
depends_on = None


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    return _inspector().has_table(table_name)


def _column_exists(table_name: str, column_name: str) -> bool:
    return _table_exists(table_name) and any(
        column["name"] == column_name
        for column in _inspector().get_columns(table_name)
    )


def _index_exists(table_name: str, index_name: str) -> bool:
    return _table_exists(table_name) and any(
        index["name"] == index_name
        for index in _inspector().get_indexes(table_name)
    )


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


def _create_index_once(
    index_name: str,
    table_name: str,
    columns: list[str],
    *,
    unique: bool = False,
    postgresql_where: sa.TextClause | None = None,
) -> None:
    if not _index_exists(table_name, index_name):
        op.create_index(
            index_name,
            table_name,
            columns,
            unique=unique,
            postgresql_where=postgresql_where,
        )


def _drop_index_if_exists(index_name: str, table_name: str) -> None:
    if _index_exists(table_name, index_name):
        op.drop_index(index_name, table_name=table_name)


def _drop_table_if_exists(table_name: str) -> None:
    if _table_exists(table_name):
        op.drop_table(table_name)


def _quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _comment_table(table_name: str, comment: str) -> None:
    op.execute(sa.text(f"COMMENT ON TABLE {table_name} IS {_quote(comment)}"))


def _comment_column(table_name: str, column_name: str, comment: str) -> None:
    op.execute(
        sa.text(
            f"COMMENT ON COLUMN {table_name}.{column_name} IS {_quote(comment)}"
        )
    )


def _comment_audit_columns(table_name: str) -> None:
    for column_name, comment in {
        "create_by": "创建人",
        "update_by": "更新人",
        "create_date": "创建时间",
        "update_date": "更新时间",
    }.items():
        _comment_column(table_name, column_name, comment)


def _add_column_once(table_name: str, column: sa.Column, comment: str) -> None:
    if not _column_exists(table_name, column.name):
        op.add_column(table_name, column)
    _comment_column(table_name, column.name, comment)


def upgrade() -> None:
    if not _table_exists("pa_resource_extensions"):
        op.create_table(
            "pa_resource_extensions",
            *_audit_columns(),
            sa.Column("id", sa.Text(), primary_key=True),
            sa.Column("project_id", sa.Text(), nullable=False),
            sa.Column("resource_type", sa.Text(), nullable=False),
            sa.Column("resource_id", sa.Text(), nullable=False),
            sa.Column("extension_type", sa.Text(), nullable=False),
            sa.Column("schema_version", sa.Integer(), nullable=False, server_default="1"),
            sa.Column(
                "payload",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            sa.Column("status", sa.Text(), nullable=False, server_default="ACTIVE"),
            sa.CheckConstraint(
                "status IN ('ACTIVE', 'INACTIVE')",
                name="pa_resource_extensions_status_check",
            ),
        )
    _create_index_once(
        "pa_resource_extensions_resource_uidx",
        "pa_resource_extensions",
        ["project_id", "resource_type", "resource_id", "extension_type"],
        unique=True,
    )
    _create_index_once(
        "pa_resource_extensions_project_update_idx",
        "pa_resource_extensions",
        ["project_id", "update_date", "id"],
    )

    if not _table_exists("pa_evaluation_jobs"):
        op.create_table(
            "pa_evaluation_jobs",
            *_audit_columns(),
            sa.Column("id", sa.Text(), primary_key=True),
            sa.Column("project_id", sa.Text(), nullable=False),
            sa.Column("name", sa.Text(), nullable=False),
            sa.Column("description", sa.Text(), nullable=False, server_default=""),
            sa.Column("trigger_type", sa.Text(), nullable=False),
            sa.Column("status", sa.Text(), nullable=False, server_default="ACTIVE"),
            sa.Column("score_name", sa.Text(), nullable=False, server_default=""),
            sa.Column("evaluator_ids", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column("evaluator_snapshot", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("data_source", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("variable_mapping", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("score_mapping", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("sample_rate", sa.Integer(), nullable=False, server_default="100"),
            sa.Column("report_template_id", sa.Text(), nullable=True),
            sa.Column("report_template_snapshot", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("badcase_config", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("schedule_config", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("timezone", sa.Text(), nullable=False, server_default="Asia/Shanghai"),
            sa.Column("scheduler_enabled", sa.Boolean(), nullable=False, server_default=sa.text("FALSE")),
            sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("latest_execution_id", sa.Text(), nullable=True),
            sa.Column("latest_report_id", sa.Text(), nullable=True),
            sa.Column("legacy_source_type", sa.Text(), nullable=False),
            sa.Column("legacy_source_id", sa.Text(), nullable=False),
            sa.CheckConstraint(
                "trigger_type IN ('MANUAL', 'SCHEDULED', 'ONLINE')",
                name="pa_evaluation_jobs_trigger_type_check",
            ),
            sa.CheckConstraint(
                "sample_rate BETWEEN 1 AND 100",
                name="pa_evaluation_jobs_sample_rate_check",
            ),
        )
    _create_index_once(
        "pa_evaluation_jobs_legacy_uidx",
        "pa_evaluation_jobs",
        ["project_id", "legacy_source_type", "legacy_source_id"],
        unique=True,
    )
    _create_index_once(
        "pa_evaluation_jobs_project_update_idx",
        "pa_evaluation_jobs",
        ["project_id", "update_date", "id"],
    )
    _create_index_once(
        "pa_evaluation_jobs_due_idx",
        "pa_evaluation_jobs",
        ["scheduler_enabled", "status", "next_run_at"],
    )

    if not _table_exists("pa_job_executions"):
        op.create_table(
            "pa_job_executions",
            *_audit_columns(),
            sa.Column("id", sa.Text(), primary_key=True),
            sa.Column("project_id", sa.Text(), nullable=False),
            sa.Column("job_type", sa.Text(), nullable=False),
            sa.Column("definition_id", sa.Text(), nullable=True),
            sa.Column("parent_execution_id", sa.Text(), nullable=True),
            sa.Column("status", sa.Text(), nullable=False, server_default="PENDING"),
            sa.Column("schema_version", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("idempotency_key", sa.Text(), nullable=False, server_default=""),
            sa.Column("external_run_id", sa.Text(), nullable=False, server_default=""),
            sa.Column("request_payload", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("cursor_payload", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("result_payload", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("total_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("completed_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("success_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("failure_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("progress_percent", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("error_code", sa.Text(), nullable=False, server_default=""),
            sa.Column("error_message", sa.Text(), nullable=False, server_default=""),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("artifact_uri", sa.Text(), nullable=False, server_default=""),
            sa.Column("artifact_name", sa.Text(), nullable=False, server_default=""),
            sa.Column("artifact_content_type", sa.Text(), nullable=False, server_default=""),
            sa.Column("artifact_size", sa.BigInteger(), nullable=False, server_default="0"),
            sa.Column("artifact_checksum", sa.Text(), nullable=False, server_default=""),
            sa.Column("lock_owner", sa.Text(), nullable=False, server_default=""),
            sa.Column("lock_until", sa.DateTime(timezone=True), nullable=True),
            sa.Column("legacy_source_type", sa.Text(), nullable=False),
            sa.Column("legacy_source_id", sa.Text(), nullable=False),
            sa.CheckConstraint(
                "status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'PARTIAL_FAILED', 'FAILED', 'CANCELLED')",
                name="pa_job_executions_status_check",
            ),
            sa.CheckConstraint(
                "progress_percent BETWEEN 0 AND 100",
                name="pa_job_executions_progress_check",
            ),
        )
    _create_index_once(
        "pa_job_executions_legacy_uidx",
        "pa_job_executions",
        ["project_id", "legacy_source_type", "legacy_source_id"],
        unique=True,
    )
    if not _index_exists(
        "pa_job_executions", "pa_job_executions_idempotency_uidx"
    ):
        op.execute(
            """
            CREATE UNIQUE INDEX pa_job_executions_idempotency_uidx
            ON pa_job_executions (
                project_id,
                job_type,
                COALESCE(definition_id, ''),
                idempotency_key
            )
            WHERE idempotency_key <> ''
            """
        )
    _create_index_once(
        "pa_job_executions_claim_idx",
        "pa_job_executions",
        ["status", "lock_until", "create_date"],
    )
    _create_index_once(
        "pa_job_executions_project_update_idx",
        "pa_job_executions",
        ["project_id", "update_date", "id"],
    )

    if _table_exists("pa_evaluation_report_items"):
        for column, comment in [
            (sa.Column("is_badcase", sa.Boolean(), nullable=False, server_default=sa.text("FALSE")), "是否为Badcase快照"),
            (sa.Column("badcase_rule_snapshot", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")), "Badcase判定规则快照"),
            (sa.Column("primary_score_value", sa.Float(), nullable=True), "主评分值"),
            (sa.Column("badcase_reason", sa.Text(), nullable=False, server_default=""), "Badcase原因"),
            (sa.Column("badcase_comment", sa.Text(), nullable=False, server_default=""), "Badcase备注"),
            (sa.Column("badcase_source_type", sa.Text(), nullable=False, server_default=""), "Badcase来源类型"),
        ]:
            _add_column_once("pa_evaluation_report_items", column, comment)

    _comment_table("pa_resource_extensions", "PA Langfuse资源强类型扩展表")
    _comment_audit_columns("pa_resource_extensions")
    _comment_table("pa_evaluation_jobs", "PA统一评测任务定义表")
    _comment_audit_columns("pa_evaluation_jobs")
    _comment_table("pa_job_executions", "PA统一异步任务执行表")
    _comment_audit_columns("pa_job_executions")

    comments = {
        "pa_resource_extensions": {
            "id": "扩展记录ID", "project_id": "Langfuse项目ID", "resource_type": "资源类型",
            "resource_id": "资源ID", "extension_type": "扩展类型", "schema_version": "载荷结构版本",
            "payload": "经类型校验的扩展载荷", "status": "扩展状态",
        },
        "pa_evaluation_jobs": {
            "id": "评测定义ID", "project_id": "Langfuse项目ID", "name": "任务名称", "description": "任务描述",
            "trigger_type": "触发类型", "status": "定义状态", "score_name": "评分名称", "evaluator_ids": "评估器ID列表",
            "evaluator_snapshot": "评估器快照", "data_source": "数据源配置", "variable_mapping": "变量映射",
            "score_mapping": "评分映射", "sample_rate": "采样率", "report_template_id": "报告模板ID",
            "report_template_snapshot": "报告模板快照", "badcase_config": "Badcase配置", "schedule_config": "调度配置",
            "timezone": "调度时区", "scheduler_enabled": "是否启用调度", "next_run_at": "下次运行时间",
            "last_run_at": "最近运行时间", "latest_execution_id": "最近执行ID", "latest_report_id": "最近报告ID",
            "legacy_source_type": "旧表来源类型", "legacy_source_id": "旧表来源ID",
        },
        "pa_job_executions": {
            "id": "执行ID", "project_id": "Langfuse项目ID", "job_type": "任务类型", "definition_id": "任务定义ID",
            "parent_execution_id": "父执行ID", "status": "执行状态", "schema_version": "载荷结构版本",
            "idempotency_key": "幂等键", "external_run_id": "Langfuse或外部运行ID", "request_payload": "请求快照",
            "cursor_payload": "可恢复游标", "result_payload": "执行结果", "total_count": "总数", "completed_count": "完成数",
            "success_count": "成功数", "failure_count": "失败数", "attempt_count": "执行尝试次数",
            "progress_percent": "进度百分比", "error_code": "稳定错误码", "error_message": "脱敏错误信息",
            "started_at": "开始时间", "completed_at": "完成时间", "expires_at": "结果过期时间",
            "artifact_uri": "产物对象引用", "artifact_name": "产物文件名", "artifact_content_type": "产物媒体类型",
            "artifact_size": "产物字节数", "artifact_checksum": "产物校验值", "lock_owner": "租约持有实例",
            "lock_until": "租约到期时间", "legacy_source_type": "旧表来源类型", "legacy_source_id": "旧表来源ID",
        },
    }
    for table_name, column_comments in comments.items():
        for column_name, comment in column_comments.items():
            _comment_column(table_name, column_name, comment)


def downgrade() -> None:
    if _table_exists("pa_evaluation_report_items"):
        for column_name in [
            "badcase_source_type",
            "badcase_comment",
            "badcase_reason",
            "primary_score_value",
            "badcase_rule_snapshot",
            "is_badcase",
        ]:
            if _column_exists("pa_evaluation_report_items", column_name):
                op.drop_column("pa_evaluation_report_items", column_name)

    for index_name in [
        "pa_job_executions_project_update_idx",
        "pa_job_executions_claim_idx",
        "pa_job_executions_idempotency_uidx",
        "pa_job_executions_legacy_uidx",
    ]:
        _drop_index_if_exists(index_name, "pa_job_executions")
    _drop_table_if_exists("pa_job_executions")

    for index_name in [
        "pa_evaluation_jobs_due_idx",
        "pa_evaluation_jobs_project_update_idx",
        "pa_evaluation_jobs_legacy_uidx",
    ]:
        _drop_index_if_exists(index_name, "pa_evaluation_jobs")
    _drop_table_if_exists("pa_evaluation_jobs")

    for index_name in [
        "pa_resource_extensions_project_update_idx",
        "pa_resource_extensions_resource_uidx",
    ]:
        _drop_index_if_exists(index_name, "pa_resource_extensions")
    _drop_table_if_exists("pa_resource_extensions")
