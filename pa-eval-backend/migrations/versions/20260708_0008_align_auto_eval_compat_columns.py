"""align auto evaluation compatibility columns

Revision ID: 20260708_0008
Revises: 20260707_0007
Create Date: 2026-07-08 19:40:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260708_0008"
down_revision = "20260707_0007"
branch_labels = None
depends_on = None


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    return _inspector().has_table(table_name)


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(
        column["name"] == column_name for column in _inspector().get_columns(table_name)
    )


def _add_column_once(table_name: str, column: sa.Column, comment: str) -> None:
    if not _column_exists(table_name, column.name):
        op.add_column(table_name, column)
    op.execute(
        sa.text(
            f"COMMENT ON COLUMN {table_name}.{column.name} IS {_quote_literal(comment)}"
        )
    )


def _drop_column_if_exists(table_name: str, column_name: str) -> None:
    if _column_exists(table_name, column_name):
        op.drop_column(table_name, column_name)


def _quote_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def upgrade() -> None:
    if _table_exists("pa_auto_evaluation_tasks"):
        _add_column_once(
            "pa_auto_evaluation_tasks",
            sa.Column(
                "data_source_type",
                sa.Text(),
                nullable=False,
                server_default="TRACE_FILTER",
            ),
            "自动评测数据来源类型",
        )
        _add_column_once(
            "pa_auto_evaluation_tasks",
            sa.Column("dataset_id", sa.Text(), nullable=True),
            "自动评测关联数据集 ID",
        )
        _add_column_once(
            "pa_auto_evaluation_tasks",
            sa.Column(
                "trace_query",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            "自动评测 Trace 过滤查询条件",
        )
        _add_column_once(
            "pa_auto_evaluation_tasks",
            sa.Column(
                "evaluator_ids",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'[]'::jsonb"),
            ),
            "自动评测使用的评估器 ID 列表",
        )
        _add_column_once(
            "pa_auto_evaluation_tasks",
            sa.Column(
                "run_config",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            "自动评测运行配置",
        )
        _add_column_once(
            "pa_auto_evaluation_tasks",
            sa.Column(
                "report_config",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
            "自动评测报告配置",
        )

    if _table_exists("pa_evaluation_reports"):
        for column, comment in [
            (sa.Column("task_id", sa.Text(), nullable=True), "自动评测任务 ID"),
            (sa.Column("run_id", sa.Text(), nullable=True), "自动评测运行 ID"),
            (sa.Column("name", sa.Text(), nullable=True), "评测报告名称"),
            (
                sa.Column("dataset_id", sa.Text(), nullable=True),
                "评测报告关联数据集 ID",
            ),
            (
                sa.Column(
                    "evaluator_ids",
                    postgresql.JSONB(astext_type=sa.Text()),
                    nullable=False,
                    server_default=sa.text("'[]'::jsonb"),
                ),
                "评测报告关联评估器 ID 列表",
            ),
            (sa.Column("generated_by", sa.Text(), nullable=True), "评测报告生成人"),
            (
                sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
                "评测报告创建时间",
            ),
            (
                sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
                "评测报告更新时间",
            ),
        ]:
            _add_column_once("pa_evaluation_reports", column, comment)

    if _table_exists("pa_evaluation_report_items"):
        for column, comment in [
            (
                sa.Column("source_item_id", sa.Text(), nullable=True),
                "评测报告明细来源样本 ID",
            ),
            (
                sa.Column("trace_id", sa.Text(), nullable=True),
                "评测报告明细来源 Trace ID",
            ),
            (
                sa.Column("observation_id", sa.Text(), nullable=True),
                "评测报告明细来源 Observation ID",
            ),
            (
                sa.Column(
                    "input",
                    postgresql.JSONB(astext_type=sa.Text()),
                    nullable=False,
                    server_default=sa.text("'{}'::jsonb"),
                ),
                "评测报告明细输入内容",
            ),
            (
                sa.Column(
                    "output",
                    postgresql.JSONB(astext_type=sa.Text()),
                    nullable=False,
                    server_default=sa.text("'{}'::jsonb"),
                ),
                "评测报告明细输出内容",
            ),
            (
                sa.Column(
                    "expected_output",
                    postgresql.JSONB(astext_type=sa.Text()),
                    nullable=False,
                    server_default=sa.text("'{}'::jsonb"),
                ),
                "评测报告明细期望输出",
            ),
            (
                sa.Column(
                    "scores",
                    postgresql.JSONB(astext_type=sa.Text()),
                    nullable=False,
                    server_default=sa.text("'[]'::jsonb"),
                ),
                "评测报告明细评分结果",
            ),
            (
                sa.Column("reason", sa.Text(), nullable=False, server_default=""),
                "评测报告明细评分原因",
            ),
            (
                sa.Column(
                    "status", sa.Text(), nullable=False, server_default="COMPLETED"
                ),
                "评测报告明细状态",
            ),
            (
                sa.Column("error_type", sa.Text(), nullable=False, server_default=""),
                "评测报告明细错误类型",
            ),
            (
                sa.Column(
                    "extra",
                    postgresql.JSONB(astext_type=sa.Text()),
                    nullable=False,
                    server_default=sa.text("'{}'::jsonb"),
                ),
                "评测报告明细扩展信息",
            ),
            (
                sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
                "评测报告明细创建时间",
            ),
            (
                sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
                "评测报告明细更新时间",
            ),
        ]:
            _add_column_once("pa_evaluation_report_items", column, comment)


def downgrade() -> None:
    for table_name, columns in {
        "pa_evaluation_report_items": [
            "updated_at",
            "created_at",
            "extra",
            "error_type",
            "status",
            "reason",
            "scores",
            "expected_output",
            "output",
            "input",
            "observation_id",
            "trace_id",
            "source_item_id",
        ],
        "pa_evaluation_reports": [
            "updated_at",
            "created_at",
            "generated_by",
            "evaluator_ids",
            "dataset_id",
            "name",
            "run_id",
            "task_id",
        ],
        "pa_auto_evaluation_tasks": [
            "report_config",
            "run_config",
            "evaluator_ids",
            "trace_query",
            "dataset_id",
            "data_source_type",
        ],
    }.items():
        for column_name in columns:
            _drop_column_if_exists(table_name, column_name)
