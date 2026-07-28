"""contract legacy PA tables after consolidated cutover

Revision ID: 20260723_0016
Revises: 20260723_0015
Create Date: 2026-07-23 00:16:00.000000
"""

from importlib import import_module

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260723_0016"
down_revision = "20260723_0015"
branch_labels = None
depends_on = None


FINAL_PA_TABLES = (
    "pa_resource_extensions",
    "pa_evaluation_jobs",
    "pa_job_executions",
    "pa_evaluators",
    "pa_evaluation_report_templates",
    "pa_evaluation_reports",
    "pa_evaluation_report_items",
    "pa_audit_logs",
    "pa_annotation_queue_item_assignments",
    "pa_project_api_keys",
    "pa_project_llm_connections",
    "pa_project_model_definitions",
)
assert len(FINAL_PA_TABLES) == 12

LEGACY_PA_TABLES = (
    "pa_project_model_settings",
    "pa_annotation_queue_settings",
    "pa_auto_evaluation_tasks",
    "pa_scheduled_jobs",
    "pa_auto_evaluation_runs",
    "pa_scheduled_job_execution_logs",
    "pa_dataset_export_jobs",
    "pa_annotation_export_jobs",
    "pa_trace_bulk_jobs",
    "pa_evaluation_report_flowbacks",
    "pa_evaluation_report_badcases",
)


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    return _inspector().has_table(table_name)


def _drop_table_if_exists(table_name: str) -> None:
    if _table_exists(table_name):
        op.drop_table(table_name)


def _scalar(sql: str) -> int:
    value = op.get_bind().execute(sa.text(sql)).scalar_one()
    return int(value or 0)


def _assert_covered(label: str, legacy_sql: str, consolidated_sql: str) -> None:
    legacy = _scalar(legacy_sql)
    consolidated = _scalar(consolidated_sql)
    if legacy > consolidated:
        raise RuntimeError(
            f"PA Contract preflight failed for {label}: "
            f"legacy={legacy}, consolidated={consolidated}"
        )


def _assert_zero(label: str, sql: str) -> None:
    mismatches = _scalar(sql)
    if mismatches:
        raise RuntimeError(
            f"PA Contract preflight failed for {label}: mismatches={mismatches}"
        )


def _require_and_lock_contract_tables() -> None:
    required_tables = (*FINAL_PA_TABLES, *LEGACY_PA_TABLES)
    inspector = _inspector()
    for table_name in required_tables:
        if not inspector.has_table(table_name):
            raise RuntimeError(
                f"PA Contract preflight missing required table {table_name}"
            )
    actual_pa_tables = {
        table_name
        for table_name in inspector.get_table_names(schema="public")
        if table_name.startswith("pa_")
    }
    unexpected_pa_tables = sorted(actual_pa_tables - set(required_tables))
    if unexpected_pa_tables:
        raise RuntimeError(
            "PA Contract preflight found unexpected PA tables: "
            + ", ".join(unexpected_pa_tables)
        )
    op.execute("SET LOCAL lock_timeout = '30s'")
    op.execute(
        "LOCK TABLE "
        + ", ".join(required_tables)
        + " IN SHARE ROW EXCLUSIVE MODE"
    )


def _assert_contract_ready() -> None:
    _require_and_lock_contract_tables()

    checks = (
        (
            "project model settings",
            "SELECT COUNT(*) FROM pa_project_model_settings",
            """SELECT COUNT(*) FROM pa_resource_extensions
               WHERE extension_type = 'DEFAULT_EVALUATION_MODEL'
                 AND status = 'ACTIVE'""",
        ),
        (
            "annotation queue settings",
            "SELECT COUNT(*) FROM pa_annotation_queue_settings",
            """SELECT COUNT(*) FROM pa_resource_extensions
               WHERE extension_type = 'ITEM_ASSIGNMENT_POLICY'
                 AND status = 'ACTIVE'""",
        ),
        (
            "auto evaluation tasks",
            "SELECT COUNT(*) FROM pa_auto_evaluation_tasks",
            """SELECT COUNT(*) FROM pa_evaluation_jobs
               WHERE legacy_source_type = 'AUTO_EVALUATION_TASK'""",
        ),
        (
            "scheduled jobs",
            "SELECT COUNT(*) FROM pa_scheduled_jobs",
            """SELECT COUNT(*) FROM pa_evaluation_jobs
               WHERE legacy_source_type = 'SCHEDULED_JOB'""",
        ),
        (
            "auto evaluation runs",
            "SELECT COUNT(*) FROM pa_auto_evaluation_runs",
            """SELECT COUNT(*) FROM pa_job_executions
               WHERE legacy_source_type = 'AUTO_EVALUATION_RUN'""",
        ),
        (
            "scheduled execution logs",
            "SELECT COUNT(*) FROM pa_scheduled_job_execution_logs",
            """SELECT COUNT(*) FROM pa_job_executions
               WHERE legacy_source_type = 'SCHEDULED_JOB_EXECUTION_LOG'""",
        ),
        (
            "dataset exports",
            "SELECT COUNT(*) FROM pa_dataset_export_jobs",
            """SELECT COUNT(*) FROM pa_job_executions
               WHERE legacy_source_type = 'DATASET_EXPORT_JOB'""",
        ),
        (
            "annotation exports",
            "SELECT COUNT(*) FROM pa_annotation_export_jobs",
            """SELECT COUNT(*) FROM pa_job_executions
               WHERE legacy_source_type = 'ANNOTATION_EXPORT_JOB'""",
        ),
        (
            "trace bulk jobs",
            "SELECT COUNT(*) FROM pa_trace_bulk_jobs",
            """SELECT COUNT(*) FROM pa_job_executions
               WHERE legacy_source_type = 'TRACE_BULK_JOB'""",
        ),
        (
            "report flowbacks",
            "SELECT COUNT(*) FROM pa_evaluation_report_flowbacks",
            """SELECT COUNT(*) FROM pa_job_executions
               WHERE legacy_source_type = 'REPORT_FLOWBACK'""",
        ),
        (
            "report badcases",
            "SELECT COUNT(*) FROM pa_evaluation_report_badcases",
            """SELECT COALESCE(SUM(
                   CASE
                       WHEN jsonb_typeof(item.extra -> 'paLegacyBadcases') = 'array'
                        AND jsonb_array_length(item.extra -> 'paLegacyBadcases') > 0
                       THEN jsonb_array_length(item.extra -> 'paLegacyBadcases')
                       ELSE 1
                   END
               ), 0)
               FROM pa_evaluation_report_items item
               WHERE item.is_badcase""",
        ),
    )
    for label, legacy_sql, consolidated_sql in checks:
        _assert_covered(label, legacy_sql, consolidated_sql)

    _assert_zero(
        "contract reference mismatch",
        """
        SELECT COALESCE(SUM(orphan_count), 0)
        FROM (
            SELECT 'ORPHAN_AUTO_EXECUTION_DEFINITION'::text AS check_name,
                   COUNT(*)::bigint AS orphan_count
            FROM pa_job_executions execution
            WHERE execution.job_type IN ('AUTO_EVALUATION', 'SCHEDULED_EVALUATION')
              AND NOT EXISTS (
                  SELECT 1 FROM pa_evaluation_jobs job
                  WHERE job.project_id = execution.project_id
                    AND job.id = execution.definition_id
              )
            UNION ALL
            SELECT 'ORPHAN_REPORT_JOB', COUNT(*)::bigint
            FROM pa_evaluation_reports report
            WHERE report.source_type = 'AUTO_EVAL'
              AND COALESCE(report.source_task_id, '') <> ''
              AND NOT EXISTS (
                  SELECT 1 FROM pa_evaluation_jobs job
                  WHERE job.project_id = report.project_id
                    AND job.legacy_source_type = 'AUTO_EVALUATION_TASK'
                    AND job.legacy_source_id = report.source_task_id
              )
            UNION ALL
            SELECT 'ORPHAN_REPORT_ITEM', COUNT(*)::bigint
            FROM pa_evaluation_report_items item
            WHERE NOT EXISTS (
                SELECT 1 FROM pa_evaluation_reports report
                WHERE report.project_id = item.project_id
                  AND report.id = item.report_id
            )
            UNION ALL
            SELECT 'ORPHAN_FLOWBACK_REPORT', COUNT(*)::bigint
            FROM pa_job_executions execution
            WHERE execution.job_type = 'REPORT_FLOWBACK'
              AND NOT EXISTS (
                  SELECT 1 FROM pa_evaluation_reports report
                  WHERE report.project_id = execution.project_id
                    AND report.id = execution.request_payload ->> 'reportId'
              )
            UNION ALL
            SELECT 'ORPHAN_ANNOTATION_ASSIGNMENT', COUNT(*)::bigint
            FROM pa_annotation_queue_item_assignments assignment
            WHERE NOT EXISTS (
                SELECT 1 FROM annotation_queue_items item
                WHERE item.project_id = assignment.project_id
                  AND item.queue_id = assignment.queue_id
                  AND item.id = assignment.item_id
            )
            UNION ALL
            SELECT 'ORPHAN_ANNOTATION_ASSIGNMENT_QUEUE', COUNT(*)::bigint
            FROM pa_annotation_queue_item_assignments assignment
            WHERE NOT EXISTS (
                SELECT 1 FROM annotation_queues queue
                WHERE queue.project_id = assignment.project_id
                  AND queue.id = assignment.queue_id
            )
            UNION ALL
            SELECT 'ORPHAN_ANNOTATION_ASSIGNMENT_ASSIGNEE', COUNT(*)::bigint
            FROM pa_annotation_queue_item_assignments assignment
            WHERE NOT EXISTS (
                SELECT 1
                FROM organization_memberships om
                JOIN projects project
                  ON project.org_id = om.org_id
                 AND project.id = assignment.project_id
                 AND project.deleted_at IS NULL
                LEFT JOIN project_memberships pm
                  ON pm.org_membership_id = om.id
                 AND pm.project_id = project.id
                WHERE om.user_id = assignment.assignee_user_id
                  AND (om.role::text <> 'NONE' OR pm.role::text <> 'NONE')
            )
        ) reference_checks
        """,
    )

    _assert_zero(
        "resource extension field mismatch",
        """
        SELECT
            (SELECT COUNT(*)
             FROM pa_project_model_settings legacy
             LEFT JOIN (
                 SELECT *
                 FROM pa_resource_extensions
                 WHERE extension_type = 'DEFAULT_EVALUATION_MODEL'
                   AND status = 'ACTIVE'
                   AND resource_type = 'PROJECT'
             ) extension
               ON extension.project_id = legacy.project_id
              AND extension.resource_id = legacy.project_id
             WHERE extension.id IS NULL
                OR extension.payload ->> 'legacyId' IS DISTINCT FROM legacy.id
                OR (extension.update_date <= legacy.update_date AND (
                    extension.payload ->> 'llmConnectionId'
                        IS DISTINCT FROM legacy.llm_connection_id
                    OR extension.payload ->> 'model'
                        IS DISTINCT FROM legacy.model
                    OR (extension.payload ->> 'temperature')::numeric
                        IS DISTINCT FROM legacy.temperature::numeric
                )))
          + (SELECT COUNT(*)
             FROM pa_annotation_queue_settings legacy
             LEFT JOIN (
                 SELECT *
                 FROM pa_resource_extensions
                 WHERE extension_type = 'ITEM_ASSIGNMENT_POLICY'
                   AND status = 'ACTIVE'
             ) extension
               ON extension.project_id = legacy.project_id
              AND extension.resource_id = legacy.queue_id
             WHERE extension.id IS NULL
                OR (extension.update_date <= legacy.update_date AND (
                    extension.payload ->> 'assignmentStrategy'
                        IS DISTINCT FROM legacy.assignment_strategy
                    OR extension.payload -> 'assignmentWeights'
                        IS DISTINCT FROM legacy.assignment_weights
                )))
        """,
    )
    _assert_zero(
        "evaluation job field mismatch",
        """
        SELECT
            (SELECT COUNT(*)
             FROM pa_auto_evaluation_tasks legacy
             LEFT JOIN (
                 SELECT *
                 FROM pa_evaluation_jobs
                 WHERE legacy_source_type = 'AUTO_EVALUATION_TASK'
                   AND trigger_type = 'MANUAL'
             ) job
               ON job.project_id = legacy.project_id
              AND job.legacy_source_id = legacy.id
             WHERE job.id IS NULL
                OR job.id IS DISTINCT FROM 'paejob_auto_' || legacy.id
                OR job.schedule_config -> 'paLegacy' -> 'executionStats'
                   IS DISTINCT FROM legacy.execution_stats
                OR job.schedule_config -> 'paLegacy' -> 'reportConfig'
                   IS DISTINCT FROM legacy.report_config
                OR (job.update_date <= legacy.update_date AND (
                    job.name IS DISTINCT FROM legacy.name
                    OR job.description IS DISTINCT FROM legacy.description
                    OR job.status IS DISTINCT FROM legacy.status
                    OR job.score_name IS DISTINCT FROM legacy.score_name
                    OR job.evaluator_ids IS DISTINCT FROM
                       CASE WHEN legacy.evaluator_ids = '[]'::jsonb
                            THEN jsonb_build_array(legacy.evaluator_id)
                            ELSE legacy.evaluator_ids END
                    OR job.evaluator_snapshot IS DISTINCT FROM jsonb_build_object(
                        'id', legacy.evaluator_id,
                        'name', legacy.evaluator_name,
                        'type', legacy.evaluator_type,
                        'version', legacy.evaluator_version)
                    OR job.data_source IS DISTINCT FROM legacy.data_source
                    OR job.score_mapping IS DISTINCT FROM legacy.score_mapping
                    OR job.sample_rate IS DISTINCT FROM legacy.sample_rate
                    OR job.report_template_id
                       IS DISTINCT FROM legacy.report_template_id
                    OR job.report_template_snapshot
                       IS DISTINCT FROM legacy.report_template_snapshot
                    OR job.badcase_config IS DISTINCT FROM COALESCE(
                        legacy.report_config -> 'badcaseConfig', '{}'::jsonb)
                    OR job.last_run_at IS DISTINCT FROM legacy.last_run_at
                    OR job.latest_report_id
                       IS DISTINCT FROM legacy.latest_report_id
                )))
          + (SELECT COUNT(*)
             FROM pa_scheduled_jobs legacy
             LEFT JOIN (
                 SELECT *
                 FROM pa_evaluation_jobs
                 WHERE legacy_source_type = 'SCHEDULED_JOB'
                   AND trigger_type = 'SCHEDULED'
             ) job
               ON job.project_id = legacy.project_id
              AND job.legacy_source_id = legacy.id
             WHERE job.id IS NULL
                OR job.id IS DISTINCT FROM 'paejob_scheduled_' || legacy.id
                OR job.schedule_config -> 'paLegacy' ->> 'lockOwner'
                   IS DISTINCT FROM legacy.lock_owner
                OR (job.schedule_config -> 'paLegacy' ->> 'lockUntil')::timestamptz
                   IS DISTINCT FROM legacy.lock_until
                OR job.schedule_config -> 'paLegacy' ->> 'lastFireKey'
                   IS DISTINCT FROM legacy.last_fire_key
                OR job.schedule_config -> 'paLegacy'
                       ->> 'latestAutoEvaluationTaskId'
                   IS DISTINCT FROM legacy.latest_auto_evaluation_task_id
                OR (job.update_date <= legacy.update_date AND (
                    job.name IS DISTINCT FROM legacy.name
                    OR job.description IS DISTINCT FROM legacy.description
                    OR job.status IS DISTINCT FROM legacy.status
                    OR job.score_name IS DISTINCT FROM legacy.score_name
                    OR job.evaluator_ids
                       IS DISTINCT FROM jsonb_build_array(legacy.evaluator_id)
                    OR job.evaluator_snapshot
                       IS DISTINCT FROM legacy.evaluator_snapshot
                    OR job.data_source IS DISTINCT FROM legacy.data_source
                    OR job.variable_mapping
                       IS DISTINCT FROM legacy.variable_mapping
                    OR job.score_mapping IS DISTINCT FROM legacy.score_mapping
                    OR job.sample_rate IS DISTINCT FROM legacy.sample_rate
                    OR job.report_template_id
                       IS DISTINCT FROM legacy.report_template_id
                    OR job.report_template_snapshot
                       IS DISTINCT FROM legacy.report_template_snapshot
                    OR job.badcase_config IS DISTINCT FROM legacy.badcase_config
                    OR job.schedule_config ->> 'runMode'
                       IS DISTINCT FROM legacy.run_mode
                    OR job.schedule_config -> 'frequency'
                       IS DISTINCT FROM legacy.frequency
                    OR job.schedule_config ->> 'createdUserId'
                       IS DISTINCT FROM legacy.created_user_id
                    OR job.timezone IS DISTINCT FROM legacy.timezone
                    OR job.scheduler_enabled
                       IS DISTINCT FROM legacy.scheduler_enabled
                    OR job.next_run_at IS DISTINCT FROM legacy.next_run_at
                    OR job.last_run_at IS DISTINCT FROM legacy.last_run_at
                    OR job.latest_report_id
                       IS DISTINCT FROM legacy.latest_report_id
                )))
        """,
    )
    _assert_zero(
        "execution field mismatch",
        """
        WITH expected AS (
            SELECT project_id, 'AUTO_EVALUATION_RUN'::text AS source_type, id,
                   update_date AS legacy_update_date,
                   'AUTO_EVALUATION'::text AS job_type,
                   'paexec_auto_' || id AS execution_id,
                   CASE WHEN status = 'COMPLETED' AND failed_count > 0
                        THEN 'PARTIAL_FAILED'
                        WHEN status = 'COMPLETED' THEN 'SUCCEEDED'
                        WHEN status = 'RUNNING' THEN 'RUNNING'
                        ELSE 'FAILED' END AS status,
                   sample_count AS total_count,
                   completed_count + failed_count AS completed_count,
                   completed_count AS success_count, failed_count AS failure_count,
                   CASE WHEN sample_count > 0 THEN LEAST(100,
                       (completed_count + failed_count) * 100 / sample_count)
                       ELSE 0 END AS progress_percent
            FROM pa_auto_evaluation_runs
            UNION ALL
            SELECT project_id, 'SCHEDULED_JOB_EXECUTION_LOG', id, update_date,
                   'SCHEDULED_EVALUATION',
                   'paexec_scheduled_' || id,
                   CASE status WHEN 'SUCCEEDED' THEN 'SUCCEEDED'
                               WHEN 'RUNNING' THEN 'RUNNING' ELSE 'FAILED' END,
                   sample_count, sample_count,
                   CASE WHEN status = 'SUCCEEDED' THEN sample_count ELSE 0 END,
                   CASE WHEN status = 'FAILED' THEN GREATEST(sample_count, 1) ELSE 0 END,
                   CASE WHEN status IN ('SUCCEEDED', 'FAILED') THEN 100 ELSE 0 END
            FROM pa_scheduled_job_execution_logs
            UNION ALL
            SELECT project_id, 'DATASET_EXPORT_JOB', id, update_date,
                   'DATASET_EXPORT',
                   'paexec_dataset_export_' || id, status, total_count,
                   exported_count, exported_count,
                   CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END,
                   CASE WHEN status IN ('SUCCEEDED', 'FAILED') THEN 100
                        WHEN total_count > 0 THEN exported_count * 100 / total_count
                        ELSE 0 END
            FROM pa_dataset_export_jobs
            UNION ALL
            SELECT project_id, 'ANNOTATION_EXPORT_JOB', id, update_date,
                   'ANNOTATION_EXPORT',
                   'paexec_annotation_export_' || id, status, total_count,
                   exported_count, exported_count,
                   CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END,
                   CASE WHEN status IN ('SUCCEEDED', 'FAILED') THEN 100
                        WHEN total_count > 0 THEN exported_count * 100 / total_count
                        ELSE 0 END
            FROM pa_annotation_export_jobs
            UNION ALL
            SELECT project_id, 'TRACE_BULK_JOB', id, update_date,
                   CASE job_type WHEN 'DATASET_IMPORT'
                       THEN 'TRACE_DATASET_IMPORT'
                       ELSE 'TRACE_ANNOTATION_IMPORT' END,
                   'paexec_trace_bulk_' || id, status, total_count,
                   completed_count, success_count, failure_count,
                   CASE WHEN status IN ('SUCCEEDED', 'FAILED') THEN 100
                        WHEN total_count > 0 THEN completed_count * 100 / total_count
                        ELSE 0 END
            FROM pa_trace_bulk_jobs
            UNION ALL
            SELECT project_id, 'REPORT_FLOWBACK', id, update_date,
                   'REPORT_FLOWBACK',
                   'paexec_report_flowback_' || id,
                   CASE status WHEN 'COMPLETED' THEN 'SUCCEEDED'
                               WHEN 'PARTIAL_FAILED' THEN 'PARTIAL_FAILED'
                               ELSE 'FAILED' END,
                   requested_count, success_count + failed_count,
                   success_count, failed_count, 100
            FROM pa_evaluation_report_flowbacks
        )
        SELECT COUNT(*)
        FROM expected
        LEFT JOIN (
            SELECT *
            FROM pa_job_executions
            WHERE legacy_source_type IN (
                'AUTO_EVALUATION_RUN', 'SCHEDULED_JOB_EXECUTION_LOG',
                'DATASET_EXPORT_JOB', 'ANNOTATION_EXPORT_JOB',
                'TRACE_BULK_JOB', 'REPORT_FLOWBACK'
            )
        ) execution
          ON execution.project_id = expected.project_id
         AND execution.legacy_source_type = expected.source_type
         AND execution.legacy_source_id = expected.id
        WHERE execution.id IS NULL
           OR execution.id IS DISTINCT FROM expected.execution_id
           OR execution.job_type IS DISTINCT FROM expected.job_type
           OR (execution.update_date <= expected.legacy_update_date AND (
               execution.status IS DISTINCT FROM expected.status
               OR execution.total_count IS DISTINCT FROM expected.total_count
               OR execution.completed_count IS DISTINCT FROM expected.completed_count
               OR execution.success_count IS DISTINCT FROM expected.success_count
               OR execution.failure_count IS DISTINCT FROM expected.failure_count
               OR execution.progress_percent
                  IS DISTINCT FROM expected.progress_percent
           ))
        """,
    )
    _assert_zero(
        "execution snapshot mismatch",
        """
        SELECT
            (SELECT COUNT(*)
             FROM pa_auto_evaluation_runs legacy
             JOIN pa_job_executions execution
               ON execution.project_id = legacy.project_id
              AND execution.legacy_source_type = 'AUTO_EVALUATION_RUN'
              AND execution.legacy_source_id = legacy.id
             WHERE execution.update_date <= legacy.update_date
               AND (execution.definition_id
                       IS DISTINCT FROM 'paejob_auto_' || legacy.task_id
                OR execution.external_run_id IS DISTINCT FROM legacy.id
                OR execution.request_payload IS DISTINCT FROM jsonb_build_object(
                    'taskId', legacy.task_id, 'runId', legacy.id, 'reportId', '')
                OR (execution.result_payload - 'paLegacy')
                   IS DISTINCT FROM jsonb_build_object(
                    'badcaseCount', legacy.badcase_count,
                    'durationText', legacy.duration_text)
                OR execution.error_message
                   IS DISTINCT FROM COALESCE(legacy.error_message, '')
                OR execution.started_at IS DISTINCT FROM legacy.started_at
                OR execution.completed_at IS DISTINCT FROM legacy.ended_at))
          + (SELECT COUNT(*)
             FROM pa_scheduled_job_execution_logs legacy
             JOIN pa_job_executions execution
               ON execution.project_id = legacy.project_id
              AND execution.legacy_source_type = 'SCHEDULED_JOB_EXECUTION_LOG'
              AND execution.legacy_source_id = legacy.id
             WHERE execution.update_date <= legacy.update_date
               AND (execution.definition_id
                       IS DISTINCT FROM 'paejob_scheduled_' || legacy.scheduled_job_id
                OR execution.idempotency_key IS DISTINCT FROM legacy.fire_key
                OR execution.external_run_id
                   IS DISTINCT FROM COALESCE(legacy.auto_evaluation_run_id, '')
                OR execution.request_payload IS DISTINCT FROM jsonb_build_object(
                    'scheduledJobId', legacy.scheduled_job_id,
                    'fireKey', legacy.fire_key,
                    'autoEvaluationTaskId', COALESCE(legacy.auto_evaluation_task_id, ''),
                    'scheduledJobName', legacy.scheduled_job_name,
                    'triggerType', legacy.trigger_type,
                    'autoEvaluationTaskName', legacy.auto_evaluation_task_name,
                    'scheduledFireAt', legacy.scheduled_fire_at::text)
                OR (execution.result_payload - 'paLegacy')
                   IS DISTINCT FROM jsonb_build_object(
                    'autoEvaluationTaskId', legacy.auto_evaluation_task_id,
                    'autoEvaluationRunId', legacy.auto_evaluation_run_id,
                    'reportId', legacy.evaluation_report_id,
                    'durationText', legacy.duration_text,
                    'triggerPayload', legacy.trigger_payload)
                OR execution.error_message
                   IS DISTINCT FROM COALESCE(legacy.error_message, '')
                OR execution.started_at IS DISTINCT FROM legacy.started_at
                OR execution.completed_at IS DISTINCT FROM legacy.ended_at
                OR execution.lock_owner
                   IS DISTINCT FROM COALESCE(legacy.lock_owner, '')
                OR execution.lock_until IS DISTINCT FROM legacy.lock_until))
          + (SELECT COUNT(*)
             FROM pa_dataset_export_jobs legacy
             JOIN pa_job_executions execution
               ON execution.project_id = legacy.project_id
              AND execution.legacy_source_type = 'DATASET_EXPORT_JOB'
              AND execution.legacy_source_id = legacy.id
             WHERE execution.update_date <= legacy.update_date
               AND (execution.request_payload IS DISTINCT FROM jsonb_build_object(
                    'datasetId', legacy.dataset_id,
                    'format', legacy.format,
                    'metadata', legacy.metadata)
                OR execution.error_message
                   IS DISTINCT FROM legacy.error_message
                OR execution.started_at IS DISTINCT FROM legacy.started_at
                OR execution.completed_at IS DISTINCT FROM legacy.completed_at
                OR execution.expires_at IS DISTINCT FROM legacy.expires_at
                OR execution.artifact_uri IS DISTINCT FROM legacy.file_path
                OR execution.artifact_name IS DISTINCT FROM legacy.file_name
                OR execution.artifact_size IS DISTINCT FROM legacy.file_size))
          + (SELECT COUNT(*)
             FROM pa_annotation_export_jobs legacy
             JOIN pa_job_executions execution
               ON execution.project_id = legacy.project_id
              AND execution.legacy_source_type = 'ANNOTATION_EXPORT_JOB'
              AND execution.legacy_source_id = legacy.id
             WHERE execution.update_date <= legacy.update_date
               AND (execution.request_payload IS DISTINCT FROM jsonb_build_object(
                    'queueId', legacy.queue_id,
                    'scope', legacy.scope,
                    'format', legacy.format,
                    'metadata', legacy.metadata)
                OR execution.error_message
                   IS DISTINCT FROM legacy.error_message
                OR execution.started_at IS DISTINCT FROM legacy.started_at
                OR execution.completed_at IS DISTINCT FROM legacy.completed_at
                OR execution.expires_at IS DISTINCT FROM legacy.expires_at
                OR execution.artifact_uri IS DISTINCT FROM legacy.file_path
                OR execution.artifact_name IS DISTINCT FROM legacy.file_name
                OR execution.artifact_size IS DISTINCT FROM legacy.file_size))
          + (SELECT COUNT(*)
             FROM pa_trace_bulk_jobs legacy
             JOIN pa_job_executions execution
               ON execution.project_id = legacy.project_id
              AND execution.legacy_source_type = 'TRACE_BULK_JOB'
              AND execution.legacy_source_id = legacy.id
             WHERE execution.update_date <= legacy.update_date
               AND (execution.request_payload IS DISTINCT FROM jsonb_build_object(
                    'selectionType', legacy.selection_type,
                    'selectionPayload', legacy.selection_payload,
                    'operationPayload', legacy.operation_payload,
                    'userId', legacy.user_id)
                OR execution.cursor_payload IS DISTINCT FROM legacy.cursor_payload
                OR (execution.result_payload - 'paLegacy')
                   IS DISTINCT FROM legacy.result_payload
                OR execution.attempt_count IS DISTINCT FROM legacy.attempt_count
                OR execution.error_message
                   IS DISTINCT FROM legacy.error_message
                OR execution.started_at IS DISTINCT FROM legacy.started_at
                OR execution.completed_at IS DISTINCT FROM legacy.completed_at
                OR execution.expires_at IS DISTINCT FROM legacy.expires_at
                OR execution.lock_owner IS DISTINCT FROM legacy.lock_owner
                OR execution.lock_until IS DISTINCT FROM legacy.lock_until))
          + (SELECT COUNT(*)
             FROM pa_evaluation_report_flowbacks legacy
             JOIN pa_job_executions execution
               ON execution.project_id = legacy.project_id
              AND execution.legacy_source_type = 'REPORT_FLOWBACK'
              AND execution.legacy_source_id = legacy.id
             WHERE execution.update_date <= legacy.update_date
               AND (execution.request_payload IS DISTINCT FROM jsonb_build_object(
                    'reportId', legacy.report_id,
                    'flowbackType', legacy.flowback_type,
                    'targetDatasetId', legacy.target_dataset_id)
                OR (execution.result_payload - 'paLegacy') IS DISTINCT FROM
                   COALESCE(legacy.result, '{}'::jsonb) || jsonb_build_object(
                    'targetDatasetId', legacy.target_dataset_id,
                    'targetDatasetName', legacy.target_dataset_name,
                    'targetDatasetCreated', legacy.target_dataset_created,
                    'errorDetail', legacy.error_detail,
                    'requestedCount', legacy.requested_count,
                    'successCount', legacy.success_count,
                    'failedCount', legacy.failed_count,
                    'legacyResult', legacy.result,
                    'itemId', legacy.item_id,
                    'targetType', legacy.target_type,
                    'targetId', legacy.target_id,
                    'payload', legacy.payload,
                    'createdBy', legacy.created_by,
                    'createdAt', legacy.created_at,
                    'updatedAt', legacy.updated_at,
                    'completedAt', legacy.completed_at)
                OR execution.completed_at IS DISTINCT FROM legacy.completed_at))
        """,
    )
    _assert_zero(
        "execution rollback snapshot mismatch",
        """
        WITH legacy_snapshots AS (
            SELECT project_id, 'AUTO_EVALUATION_RUN'::text AS source_type,
                   id AS source_id, to_jsonb(legacy) AS snapshot
            FROM pa_auto_evaluation_runs legacy
            UNION ALL
            SELECT project_id, 'SCHEDULED_JOB_EXECUTION_LOG', id, to_jsonb(legacy)
            FROM pa_scheduled_job_execution_logs legacy
            UNION ALL
            SELECT project_id, 'DATASET_EXPORT_JOB', id, to_jsonb(legacy)
            FROM pa_dataset_export_jobs legacy
            UNION ALL
            SELECT project_id, 'ANNOTATION_EXPORT_JOB', id, to_jsonb(legacy)
            FROM pa_annotation_export_jobs legacy
            UNION ALL
            SELECT project_id, 'TRACE_BULK_JOB', id, to_jsonb(legacy)
            FROM pa_trace_bulk_jobs legacy
            UNION ALL
            SELECT project_id, 'REPORT_FLOWBACK', id, to_jsonb(legacy)
            FROM pa_evaluation_report_flowbacks legacy
        )
        SELECT COUNT(*)
        FROM legacy_snapshots legacy
        LEFT JOIN pa_job_executions execution
          ON execution.project_id = legacy.project_id
         AND execution.legacy_source_type = legacy.source_type
         AND execution.legacy_source_id = legacy.source_id
        WHERE execution.id IS NULL
           OR execution.result_payload -> 'paLegacy'
              IS DISTINCT FROM legacy.snapshot
        """,
    )
    _assert_zero(
        "badcase snapshot mismatch",
        """
        WITH snapshots AS (
            SELECT item.project_id, item.report_id, item.source_id,
                   legacy.value AS legacy
            FROM pa_evaluation_report_items item
            CROSS JOIN LATERAL jsonb_array_elements(
                COALESCE(item.extra -> 'paLegacyBadcases', '[]'::jsonb)
            ) legacy
            WHERE item.is_badcase
        )
        SELECT COUNT(*)
        FROM pa_evaluation_report_badcases badcase
        LEFT JOIN snapshots snapshot
          ON snapshot.project_id = badcase.project_id
         AND snapshot.report_id = badcase.report_id
         AND snapshot.source_id = badcase.dataset_item_id
         AND snapshot.legacy ->> 'id' = badcase.id
        WHERE badcase.id IS NULL OR snapshot.legacy IS NULL
           OR snapshot.legacy ->> 'scoreName' IS DISTINCT FROM badcase.score_name
           OR (snapshot.legacy ->> 'scoreValue')::double precision
              IS DISTINCT FROM badcase.score_value
           OR snapshot.legacy ->> 'reason' IS DISTINCT FROM badcase.reason
           OR snapshot.legacy ->> 'comment' IS DISTINCT FROM badcase.comment
           OR snapshot.legacy ->> 'sourceType' IS DISTINCT FROM badcase.source_type
           OR snapshot.legacy ->> 'flowbackStatus'
              IS DISTINCT FROM badcase.flowback_status
           OR snapshot.legacy ->> 'createBy' IS DISTINCT FROM badcase.create_by
           OR snapshot.legacy ->> 'updateBy' IS DISTINCT FROM badcase.update_by
           OR (snapshot.legacy ->> 'createDate')::timestamptz
              IS DISTINCT FROM badcase.create_date
           OR (snapshot.legacy ->> 'updateDate')::timestamptz
              IS DISTINCT FROM badcase.update_date
        """,
    )
    _assert_zero(
        "audit field mismatch",
        """
        WITH legacy AS (
            SELECT project_id, 'PROJECT_MODEL_SETTING'::text AS source_type,
                   id AS source_id, create_by, update_by, create_date, update_date
            FROM pa_project_model_settings
            UNION ALL
            SELECT project_id, 'ANNOTATION_QUEUE_SETTING', queue_id,
                   create_by, update_by, create_date, update_date
            FROM pa_annotation_queue_settings
            UNION ALL
            SELECT project_id, 'AUTO_EVALUATION_TASK', id,
                   create_by, update_by, create_date, update_date
            FROM pa_auto_evaluation_tasks
            UNION ALL
            SELECT project_id, 'SCHEDULED_JOB', id,
                   create_by, update_by, create_date, update_date
            FROM pa_scheduled_jobs
            UNION ALL
            SELECT project_id, 'AUTO_EVALUATION_RUN', id,
                   create_by, update_by, create_date, update_date
            FROM pa_auto_evaluation_runs
            UNION ALL
            SELECT project_id, 'SCHEDULED_JOB_EXECUTION_LOG', id,
                   create_by, update_by, create_date, update_date
            FROM pa_scheduled_job_execution_logs
            UNION ALL
            SELECT project_id, 'DATASET_EXPORT_JOB', id,
                   create_by, update_by, create_date, update_date
            FROM pa_dataset_export_jobs
            UNION ALL
            SELECT project_id, 'ANNOTATION_EXPORT_JOB', id,
                   create_by, update_by, create_date, update_date
            FROM pa_annotation_export_jobs
            UNION ALL
            SELECT project_id, 'TRACE_BULK_JOB', id,
                   create_by, update_by, create_date, update_date
            FROM pa_trace_bulk_jobs
            UNION ALL
            SELECT project_id, 'REPORT_FLOWBACK', id,
                   create_by, update_by, create_date, update_date
            FROM pa_evaluation_report_flowbacks
        ), consolidated AS (
            SELECT project_id, 'PROJECT_MODEL_SETTING'::text AS source_type,
                   payload ->> 'legacyId' AS source_id,
                   create_by, update_by, create_date, update_date
            FROM pa_resource_extensions
            WHERE extension_type = 'DEFAULT_EVALUATION_MODEL'
              AND resource_type = 'PROJECT'
              AND status = 'ACTIVE'
            UNION ALL
            SELECT project_id, 'ANNOTATION_QUEUE_SETTING', resource_id,
                   create_by, update_by, create_date, update_date
            FROM pa_resource_extensions
            WHERE extension_type = 'ITEM_ASSIGNMENT_POLICY'
              AND resource_type = 'ANNOTATION_QUEUE'
              AND status = 'ACTIVE'
            UNION ALL
            SELECT project_id, legacy_source_type, legacy_source_id,
                   create_by, update_by, create_date, update_date
            FROM pa_evaluation_jobs
            WHERE legacy_source_type IN ('AUTO_EVALUATION_TASK', 'SCHEDULED_JOB')
            UNION ALL
            SELECT project_id, legacy_source_type, legacy_source_id,
                   create_by, update_by, create_date, update_date
            FROM pa_job_executions
            WHERE legacy_source_type IN (
                'AUTO_EVALUATION_RUN', 'SCHEDULED_JOB_EXECUTION_LOG',
                'DATASET_EXPORT_JOB', 'ANNOTATION_EXPORT_JOB',
                'TRACE_BULK_JOB', 'REPORT_FLOWBACK'
            )
        )
        SELECT COUNT(*)
        FROM legacy
        LEFT JOIN consolidated
          ON consolidated.project_id = legacy.project_id
         AND consolidated.source_type = legacy.source_type
         AND consolidated.source_id = legacy.source_id
        WHERE consolidated.source_id IS NULL
           OR consolidated.create_by IS DISTINCT FROM legacy.create_by
           OR consolidated.create_date IS DISTINCT FROM legacy.create_date
           OR (consolidated.update_date <= legacy.update_date AND (
               consolidated.update_by IS DISTINCT FROM legacy.update_by
               OR consolidated.update_date IS DISTINCT FROM legacy.update_date
           ))
        """,
    )

    running = _scalar(
        """
        SELECT COUNT(*)
        FROM pa_job_executions
        WHERE status IN ('PENDING', 'RUNNING')
          AND legacy_source_type IN (
            'AUTO_EVALUATION_RUN', 'SCHEDULED_JOB_EXECUTION_LOG',
            'DATASET_EXPORT_JOB', 'ANNOTATION_EXPORT_JOB', 'TRACE_BULK_JOB',
            'REPORT_FLOWBACK'
          )
        """
    )
    if running:
        raise RuntimeError(
            f"PA Contract preflight found {running} mutable consolidated executions"
        )
    running_jobs = _scalar(
        """
        SELECT COUNT(*)
        FROM pa_evaluation_jobs
        WHERE status = 'RUNNING'
          AND legacy_source_type IN ('AUTO_EVALUATION_TASK', 'SCHEDULED_JOB')
        """
    )
    if running_jobs:
        raise RuntimeError(
            f"PA Contract preflight found {running_jobs} RUNNING consolidated jobs"
        )


def upgrade() -> None:
    _assert_contract_ready()
    _drop_table_if_exists("pa_evaluation_report_badcases")
    _drop_table_if_exists("pa_evaluation_report_flowbacks")
    _drop_table_if_exists("pa_trace_bulk_jobs")
    _drop_table_if_exists("pa_annotation_export_jobs")
    _drop_table_if_exists("pa_dataset_export_jobs")
    _drop_table_if_exists("pa_scheduled_job_execution_logs")
    _drop_table_if_exists("pa_auto_evaluation_runs")
    _drop_table_if_exists("pa_scheduled_jobs")
    op.execute(
        "ALTER TABLE pa_evaluation_reports DROP CONSTRAINT IF EXISTS "
        "pa_evaluation_reports_source_task_id_fkey"
    )
    _drop_table_if_exists("pa_auto_evaluation_tasks")
    _drop_table_if_exists("pa_annotation_queue_settings")
    _drop_table_if_exists("pa_project_model_settings")


def _restore_legacy_schema() -> None:
    modules = (
        "migrations.versions.20260705_0001_create_pa_eval_tables",
        "migrations.versions.20260707_0002_create_project_model_settings",
        "migrations.versions.20260707_0006_create_pa_dataset_export_jobs",
        "migrations.versions.20260708_0008_align_auto_eval_compat_columns",
        "migrations.versions.20260708_0009_add_report_flowback_compat_columns",
        "migrations.versions.20260709_0010_create_scheduled_jobs",
        "migrations.versions.20260711_0012_create_pa_annotation_export_jobs",
        "migrations.versions.20260714_0013_add_evaluator_outputs_and_score_mapping",
        "migrations.versions.20260719_0014_create_pa_trace_bulk_jobs",
    )
    for module_name in modules:
        import_module(module_name).upgrade()
    if not _table_exists("pa_annotation_queue_settings"):
        op.create_table(
            "pa_annotation_queue_settings",
            sa.Column("create_by", sa.Text(), nullable=False),
            sa.Column("update_by", sa.Text(), nullable=False),
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
            sa.Column("queue_id", sa.Text(), primary_key=True),
            sa.Column("project_id", sa.Text(), nullable=False),
            sa.Column(
                "assignment_strategy",
                sa.Text(),
                nullable=False,
                server_default="average",
            ),
            sa.Column(
                "assignment_weights",
                postgresql.JSONB(),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
        )
        op.create_index(
            "pa_annotation_queue_settings_project_id_idx",
            "pa_annotation_queue_settings",
            ["project_id"],
        )
        op.execute("COMMENT ON COLUMN pa_annotation_queue_settings.create_by IS '创建人'")
        op.execute("COMMENT ON COLUMN pa_annotation_queue_settings.update_by IS '更新人'")
        op.execute("COMMENT ON COLUMN pa_annotation_queue_settings.create_date IS '创建时间'")
        op.execute("COMMENT ON COLUMN pa_annotation_queue_settings.update_date IS '更新时间'")
        op.execute("COMMENT ON COLUMN pa_annotation_queue_settings.queue_id IS '人工标注任务ID'")
        op.execute("COMMENT ON COLUMN pa_annotation_queue_settings.project_id IS '项目ID'")
        op.execute(
            "COMMENT ON COLUMN pa_annotation_queue_settings.assignment_strategy "
            "IS '任务分配策略：average/random/weighted'"
        )
        op.execute(
            "COMMENT ON COLUMN pa_annotation_queue_settings.assignment_weights "
            "IS '按权重分配时的处理人权重配置'"
        )


def _restore_pa_project_model_settings() -> None:
    op.execute(
        """
        INSERT INTO pa_project_model_settings (
            create_by, update_by, create_date, update_date, id, project_id,
            llm_connection_id, model, temperature
        )
        SELECT create_by, update_by, create_date, update_date,
               COALESCE(NULLIF(payload ->> 'legacyId', ''), id), project_id,
               payload ->> 'llmConnectionId', payload ->> 'model',
               COALESCE(payload ->> 'temperature', '0.2')
        FROM pa_resource_extensions
        WHERE extension_type = 'DEFAULT_EVALUATION_MODEL' AND status = 'ACTIVE'
        ON CONFLICT (project_id) DO NOTHING
        """
    )
    op.execute("COMMENT ON TABLE pa_project_model_settings IS 'PA项目默认评估模型兼容表'")


def _restore_pa_annotation_queue_settings() -> None:
    op.execute(
        """
        INSERT INTO pa_annotation_queue_settings (
            create_by, update_by, create_date, update_date, queue_id, project_id,
            assignment_strategy, assignment_weights
        )
        SELECT create_by, update_by, create_date, update_date, resource_id,
               project_id, COALESCE(payload ->> 'assignmentStrategy', 'average'),
               COALESCE(payload -> 'assignmentWeights', '{}'::jsonb)
        FROM pa_resource_extensions
        WHERE extension_type = 'ITEM_ASSIGNMENT_POLICY' AND status = 'ACTIVE'
        ON CONFLICT (queue_id) DO NOTHING
        """
    )
    op.execute("COMMENT ON TABLE pa_annotation_queue_settings IS 'PA人工标注任务分配设置兼容表'")


def _restore_pa_auto_evaluation_tasks() -> None:
    op.execute(
        """
        INSERT INTO pa_auto_evaluation_tasks (
            create_by, update_by, create_date, update_date, id, project_id, name,
            description, score_name, status, evaluator_id, evaluator_name,
            evaluator_type, evaluator_version, data_source, sample_rate,
            execution_stats, badcase_count, latest_report_id, report_template_id,
            report_template_snapshot, last_run_at, evaluator_ids, report_config,
            score_mapping
        )
        SELECT job.create_by, job.update_by, job.create_date, job.update_date,
               job.legacy_source_id, job.project_id, job.name, job.description,
               job.score_name, job.status, COALESCE(job.evaluator_ids ->> 0, ''),
               COALESCE(job.evaluator_snapshot ->> 'name', ''),
               COALESCE(job.evaluator_snapshot ->> 'type', 'LLM'),
               COALESCE(job.evaluator_snapshot ->> 'version', 'v1'),
               job.data_source, job.sample_rate,
               COALESCE(
                   job.schedule_config -> 'paLegacy' -> 'executionStats',
                   '{}'::jsonb
               ),
               COALESCE((SELECT COUNT(*) FROM pa_evaluation_report_items item
                         WHERE item.report_id = job.latest_report_id
                           AND item.is_badcase), 0),
               job.latest_report_id, job.report_template_id,
               job.report_template_snapshot, job.last_run_at, job.evaluator_ids,
               COALESCE(
                   job.schedule_config -> 'paLegacy' -> 'reportConfig',
                   jsonb_build_object('badcaseConfig', job.badcase_config)
               ),
               job.score_mapping
        FROM pa_evaluation_jobs job
        WHERE job.legacy_source_type = 'AUTO_EVALUATION_TASK'
        ON CONFLICT (id) DO NOTHING
        """
    )
    op.execute("COMMENT ON TABLE pa_auto_evaluation_tasks IS 'PA自动评测任务兼容表'")


def _restore_report_task_foreign_key() -> None:
    foreign_keys = _inspector().get_foreign_keys("pa_evaluation_reports")
    if any(
        foreign_key.get("referred_table") == "pa_auto_evaluation_tasks"
        and foreign_key.get("constrained_columns") == ["source_task_id"]
        for foreign_key in foreign_keys
    ):
        return
    op.create_foreign_key(
        "pa_evaluation_reports_source_task_id_fkey",
        "pa_evaluation_reports",
        "pa_auto_evaluation_tasks",
        ["source_task_id"],
        ["id"],
        ondelete="CASCADE",
    )


def _restore_pa_scheduled_jobs() -> None:
    op.execute(
        """
        INSERT INTO pa_scheduled_jobs (
            create_by, update_by, create_date, update_date, id, project_id,
            task_type, name, description, score_name, score_mapping, run_mode,
            frequency, timezone, status, scheduler_enabled, next_run_at,
            last_run_at, lock_owner, lock_until, last_fire_key,
            evaluator_id, evaluator_snapshot, variable_mapping,
            data_source, sample_rate, report_template_id,
            report_template_snapshot, badcase_config,
            latest_auto_evaluation_task_id, latest_report_id, created_user_id
        )
        SELECT job.create_by, job.update_by, job.create_date, job.update_date,
               job.legacy_source_id, job.project_id, 'AUTO_EVALUATION', job.name,
               job.description, job.score_name, job.score_mapping,
               COALESCE(job.schedule_config ->> 'runMode', 'ONCE'),
               COALESCE(job.schedule_config -> 'frequency', '{}'::jsonb),
               job.timezone, job.status, job.scheduler_enabled, job.next_run_at,
               job.last_run_at,
               NULLIF(job.schedule_config -> 'paLegacy' ->> 'lockOwner', ''),
               (job.schedule_config -> 'paLegacy' ->> 'lockUntil')::timestamptz,
               NULLIF(job.schedule_config -> 'paLegacy' ->> 'lastFireKey', ''),
               COALESCE(job.evaluator_ids ->> 0, ''),
               job.evaluator_snapshot, job.variable_mapping, job.data_source,
               job.sample_rate, job.report_template_id,
               job.report_template_snapshot, job.badcase_config,
               COALESCE(
                        NULLIF(job.schedule_config -> 'paLegacy'
                               ->> 'latestAutoEvaluationTaskId', ''),
                        NULLIF(latest.result_payload ->> 'autoEvaluationTaskId', ''),
                        latest.request_payload ->> 'autoEvaluationTaskId'),
               job.latest_report_id,
               COALESCE(job.schedule_config ->> 'createdUserId', job.create_by)
        FROM pa_evaluation_jobs job
        LEFT JOIN pa_job_executions latest
          ON latest.id = job.latest_execution_id
        WHERE job.legacy_source_type = 'SCHEDULED_JOB'
        ON CONFLICT (id) DO NOTHING
        """
    )
    op.execute("COMMENT ON TABLE pa_scheduled_jobs IS 'PA定时任务兼容表'")


def _restore_pa_auto_evaluation_runs() -> None:
    op.execute(
        """
        INSERT INTO pa_auto_evaluation_runs (
            create_by, update_by, create_date, update_date, id, project_id,
            task_id, status, sample_count, completed_count, failed_count,
            badcase_count, started_at, ended_at, duration_text, error_message
        )
        SELECT create_by, update_by, create_date, update_date, legacy_source_id,
               project_id, request_payload ->> 'taskId',
               CASE status WHEN 'SUCCEEDED' THEN 'COMPLETED'
                           WHEN 'PARTIAL_FAILED' THEN 'COMPLETED'
                           ELSE status END,
               total_count, success_count, failure_count,
               COALESCE(
                   (result_payload -> 'paLegacy' ->> 'badcase_count')::int,
                   (result_payload ->> 'badcaseCount')::int,
                   0
               ),
               COALESCE(started_at, create_date), completed_at,
               COALESCE(result_payload -> 'paLegacy' ->> 'duration_text',
                        result_payload ->> 'durationText', ''),
               NULLIF(error_message, '')
        FROM pa_job_executions
        WHERE legacy_source_type = 'AUTO_EVALUATION_RUN'
        ON CONFLICT (id) DO NOTHING
        """
    )
    op.execute("COMMENT ON TABLE pa_auto_evaluation_runs IS 'PA自动评测运行兼容表'")


def _restore_pa_scheduled_job_execution_logs() -> None:
    op.execute(
        """
        INSERT INTO pa_scheduled_job_execution_logs (
            create_by, update_by, create_date, update_date, id, project_id,
            scheduled_job_id, scheduled_job_name, task_type, trigger_type,
            fire_key, scheduled_fire_at, auto_evaluation_task_id,
            auto_evaluation_task_name, auto_evaluation_run_id,
            evaluation_report_id, status, sample_count, started_at, ended_at,
            duration_text, error_message, lock_owner, lock_until, trigger_payload
        )
        SELECT create_by, update_by, create_date, update_date, legacy_source_id,
               project_id, request_payload ->> 'scheduledJobId',
               request_payload ->> 'scheduledJobName', 'AUTO_EVALUATION',
               request_payload ->> 'triggerType',
               request_payload ->> 'fireKey',
               COALESCE((request_payload ->> 'scheduledFireAt')::timestamptz,
                        create_date),
               COALESCE(NULLIF(result_payload -> 'paLegacy'
                                      ->> 'auto_evaluation_task_id', ''),
                        NULLIF(result_payload ->> 'autoEvaluationTaskId', ''),
                        request_payload ->> 'autoEvaluationTaskId'),
               request_payload ->> 'autoEvaluationTaskName',
               COALESCE(NULLIF(result_payload -> 'paLegacy'
                                      ->> 'auto_evaluation_run_id', ''),
                        NULLIF(result_payload ->> 'autoEvaluationRunId', ''),
                        external_run_id),
               COALESCE(result_payload -> 'paLegacy'
                                      ->> 'evaluation_report_id',
                        result_payload ->> 'reportId'),
               status, total_count,
               COALESCE(started_at, create_date), completed_at,
               COALESCE(result_payload -> 'paLegacy' ->> 'duration_text',
                        result_payload ->> 'durationText', ''),
               NULLIF(error_message, ''), NULLIF(lock_owner, ''), lock_until,
               COALESCE(result_payload -> 'paLegacy' -> 'trigger_payload',
                        result_payload -> 'triggerPayload', request_payload)
        FROM pa_job_executions
        WHERE legacy_source_type = 'SCHEDULED_JOB_EXECUTION_LOG'
        ON CONFLICT (id) DO NOTHING
        """
    )
    op.execute("COMMENT ON TABLE pa_scheduled_job_execution_logs IS 'PA定时任务执行日志兼容表'")


def _restore_pa_dataset_export_jobs() -> None:
    op.execute(
        """
        INSERT INTO pa_dataset_export_jobs (
            create_by, update_by, create_date, update_date, id, project_id,
            dataset_id, format, status, total_count, exported_count, file_name,
            file_path, file_size, error_message, started_at, completed_at,
            expires_at, metadata
        )
        SELECT create_by, update_by, create_date, update_date, legacy_source_id,
               project_id, request_payload ->> 'datasetId',
               request_payload ->> 'format', status, total_count, success_count,
               artifact_name, artifact_uri, artifact_size, error_message,
               started_at, completed_at, expires_at,
               COALESCE(request_payload -> 'metadata', '{}'::jsonb)
        FROM pa_job_executions
        WHERE legacy_source_type = 'DATASET_EXPORT_JOB'
        ON CONFLICT (id) DO NOTHING
        """
    )
    op.execute("COMMENT ON TABLE pa_dataset_export_jobs IS 'PA数据集导出任务兼容表'")


def _restore_pa_annotation_export_jobs() -> None:
    op.execute(
        """
        INSERT INTO pa_annotation_export_jobs (
            create_by, update_by, create_date, update_date, id, project_id,
            queue_id, scope, format, status, total_count, exported_count,
            file_name, file_path, file_size, error_message, started_at,
            completed_at, expires_at, metadata
        )
        SELECT create_by, update_by, create_date, update_date, legacy_source_id,
               project_id, request_payload ->> 'queueId',
               request_payload ->> 'scope', request_payload ->> 'format', status,
               total_count, success_count, artifact_name, artifact_uri,
               artifact_size, error_message, started_at, completed_at,
               expires_at, COALESCE(request_payload -> 'metadata', '{}'::jsonb)
        FROM pa_job_executions
        WHERE legacy_source_type = 'ANNOTATION_EXPORT_JOB'
        ON CONFLICT (id) DO NOTHING
        """
    )
    op.execute("COMMENT ON TABLE pa_annotation_export_jobs IS 'PA人工标注导出任务兼容表'")


def _restore_pa_trace_bulk_jobs() -> None:
    op.execute(
        """
        INSERT INTO pa_trace_bulk_jobs (
            create_by, update_by, create_date, update_date, id, project_id,
            user_id, job_type, status, selection_type, selection_payload,
            operation_payload, cursor_payload, result_payload, total_count,
            completed_count, success_count, failure_count, attempt_count,
            error_message, started_at, completed_at, expires_at, lock_owner,
            lock_until
        )
        SELECT create_by, update_by, create_date, update_date, legacy_source_id,
               project_id, request_payload ->> 'userId',
               CASE job_type WHEN 'TRACE_DATASET_IMPORT' THEN 'DATASET_IMPORT'
                             ELSE 'ANNOTATION_TASK' END,
               status, request_payload ->> 'selectionType',
               request_payload -> 'selectionPayload',
               request_payload -> 'operationPayload', cursor_payload,
               result_payload - 'paLegacy', total_count, completed_count, success_count,
               failure_count, attempt_count, error_message, started_at,
               completed_at, expires_at, lock_owner, lock_until
        FROM pa_job_executions
        WHERE legacy_source_type = 'TRACE_BULK_JOB'
        ON CONFLICT (id) DO NOTHING
        """
    )
    op.execute("COMMENT ON TABLE pa_trace_bulk_jobs IS 'PA Trace批量任务兼容表'")


def _restore_pa_evaluation_report_flowbacks() -> None:
    op.execute(
        """
        INSERT INTO pa_evaluation_report_flowbacks (
            create_by, update_by, create_date, update_date, id, project_id,
            report_id, flowback_type, target_dataset_id, target_dataset_name,
            target_dataset_created, requested_count, success_count,
            failed_count, status, error_detail, item_id, target_type, target_id,
            payload, result, created_by, created_at, updated_at, completed_at
        )
        SELECT create_by, update_by, create_date, update_date, legacy_source_id,
               project_id,
               COALESCE(result_payload -> 'paLegacy' ->> 'report_id',
                        request_payload ->> 'reportId'),
               COALESCE(result_payload -> 'paLegacy' ->> 'flowback_type',
                        request_payload ->> 'flowbackType'),
               COALESCE(result_payload -> 'paLegacy' ->> 'target_dataset_id',
                        request_payload ->> 'targetDatasetId'),
               COALESCE(result_payload -> 'paLegacy'
                                      ->> 'target_dataset_name',
                        result_payload ->> 'targetDatasetName', ''),
               COALESCE((result_payload -> 'paLegacy'
                                        ->> 'target_dataset_created')::boolean,
                        (result_payload ->> 'targetDatasetCreated')::boolean,
                        FALSE),
               total_count, success_count, failure_count,
               CASE status WHEN 'SUCCEEDED' THEN 'COMPLETED' ELSE status END,
               COALESCE(result_payload -> 'paLegacy' -> 'error_detail',
                        result_payload -> 'errorDetail', '[]'::jsonb),
               NULLIF(COALESCE(result_payload -> 'paLegacy' ->> 'item_id',
                               result_payload ->> 'itemId'), ''),
               NULLIF(COALESCE(result_payload -> 'paLegacy' ->> 'target_type',
                               result_payload ->> 'targetType'), ''),
               NULLIF(COALESCE(result_payload -> 'paLegacy' ->> 'target_id',
                               result_payload ->> 'targetId'), ''),
               COALESCE(result_payload -> 'paLegacy' -> 'payload',
                        result_payload -> 'payload'),
               COALESCE(result_payload -> 'paLegacy' -> 'result',
                        result_payload -> 'legacyResult'),
               NULLIF(COALESCE(result_payload -> 'paLegacy' ->> 'created_by',
                               result_payload ->> 'createdBy'), ''),
               COALESCE((result_payload -> 'paLegacy' ->> 'created_at')::timestamptz,
                        (result_payload ->> 'createdAt')::timestamptz),
               COALESCE((result_payload -> 'paLegacy' ->> 'updated_at')::timestamptz,
                        (result_payload ->> 'updatedAt')::timestamptz),
               COALESCE((result_payload -> 'paLegacy' ->> 'completed_at')::timestamptz,
                        (result_payload ->> 'completedAt')::timestamptz,
                        completed_at)
        FROM pa_job_executions
        WHERE legacy_source_type = 'REPORT_FLOWBACK'
        ON CONFLICT (id) DO NOTHING
        """
    )
    op.execute("COMMENT ON TABLE pa_evaluation_report_flowbacks IS 'PA报告回流兼容表'")


def _restore_pa_evaluation_report_badcases() -> None:
    op.execute(
        """
        INSERT INTO pa_evaluation_report_badcases (
            create_by, update_by, create_date, update_date, id, project_id,
            report_id, trace_id, observation_id, dataset_item_id, score_name,
            score_value, reason, comment, source_type, flowback_status
        )
        SELECT
               COALESCE(legacy ->> 'createBy', item.create_by),
               COALESCE(legacy ->> 'updateBy', item.update_by),
               COALESCE((legacy ->> 'createDate')::timestamptz, item.create_date),
               COALESCE((legacy ->> 'updateDate')::timestamptz, item.update_date),
               COALESCE(NULLIF(legacy ->> 'id', ''), item.id), item.project_id,
               item.report_id,
               COALESCE(legacy ->> 'traceId', item.trace_id, ''),
               COALESCE(legacy ->> 'observationId', item.observation_id, ''),
               item.source_id,
               COALESCE(legacy ->> 'scoreName', item.badcase_rule_snapshot ->> 'scoreName', ''),
               COALESCE((legacy ->> 'scoreValue')::double precision,
                        item.primary_score_value, 0),
               COALESCE(legacy ->> 'reason', item.badcase_reason, ''),
               COALESCE(legacy ->> 'comment', item.badcase_comment, ''),
               COALESCE(legacy ->> 'sourceType', item.badcase_source_type, 'SCORE'),
               COALESCE(legacy ->> 'flowbackStatus', item.dataset_flowback_status)
        FROM pa_evaluation_report_items item
        CROSS JOIN LATERAL jsonb_array_elements(
            CASE
                WHEN jsonb_typeof(item.extra -> 'paLegacyBadcases') = 'array'
                 AND jsonb_array_length(item.extra -> 'paLegacyBadcases') > 0
                THEN item.extra -> 'paLegacyBadcases'
                ELSE jsonb_build_array(jsonb_build_object(
                    'id', item.id,
                    'scoreName', item.badcase_rule_snapshot ->> 'scoreName',
                    'scoreValue', item.primary_score_value,
                    'reason', item.badcase_reason,
                    'comment', item.badcase_comment,
                    'sourceType', item.badcase_source_type,
                    'flowbackStatus', item.dataset_flowback_status,
                    'traceId', item.trace_id,
                    'observationId', item.observation_id,
                    'createBy', item.create_by,
                    'updateBy', item.update_by,
                    'createDate', item.create_date,
                    'updateDate', item.update_date
                ))
            END
        ) AS legacy
        WHERE item.is_badcase
        ON CONFLICT (id) DO NOTHING
        """
    )
    op.execute("COMMENT ON TABLE pa_evaluation_report_badcases IS 'PA报告Badcase兼容表'")


def downgrade() -> None:
    _restore_legacy_schema()
    _restore_pa_project_model_settings()
    _restore_pa_annotation_queue_settings()
    _restore_pa_auto_evaluation_tasks()
    _restore_report_task_foreign_key()
    _restore_pa_scheduled_jobs()
    _restore_pa_auto_evaluation_runs()
    _restore_pa_scheduled_job_execution_logs()
    _restore_pa_dataset_export_jobs()
    _restore_pa_annotation_export_jobs()
    _restore_pa_trace_bulk_jobs()
    _restore_pa_evaluation_report_flowbacks()
    _restore_pa_evaluation_report_badcases()
