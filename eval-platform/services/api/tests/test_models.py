from sqlalchemy import create_engine, event, inspect
from sqlalchemy.orm import Session

from eval_platform_api.db.base import Base
from eval_platform_api.models.platform import (
    EvalPlatformEvaluator,
    EvalPlatformProject,
    EvalPlatformTask,
)


def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def test_platform_tables_use_eval_platform_prefix():
    table_names = sorted(Base.metadata.tables.keys())

    assert "eval_platform_projects" in table_names
    assert "eval_platform_tasks" in table_names
    assert all(name.startswith("eval_platform_") for name in table_names)


def test_project_and_task_can_persist_in_memory():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    event.listen(engine, "connect", _enable_sqlite_foreign_keys)
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        project = EvalPlatformProject(
            name="医疗问答助手",
            langfuse_base_url="http://localhost:3000",
            langfuse_project_id="project-1",
            langfuse_public_key="pk-lf-test",
            langfuse_secret_key_encrypted="encrypted-secret",
            status="active",
            created_by="user-1",
        )
        session.add(project)
        session.flush()
        evaluator = EvalPlatformEvaluator(
            project_id=project.id,
            name="安全性评分器",
            evaluator_type="llm",
            status="active",
            created_by="user-1",
        )
        session.add(evaluator)
        session.flush()
        task = EvalPlatformTask(
            project_id=project.id,
            name="安全性评测",
            status="pending",
            source_type="trace",
            evaluator_id=evaluator.id,
            total_items=0,
            completed_items=0,
            failed_items=0,
            created_by="user-1",
        )
        session.add(task)
        session.commit()
        task_id = task.id
        evaluator_id = evaluator.id

    with Session(engine) as session:
        loaded_task = session.get(EvalPlatformTask, task_id)

    inspector = inspect(engine)
    assert "eval_platform_projects" in inspector.get_table_names()
    assert loaded_task is not None
    assert loaded_task.evaluator_id == evaluator_id
