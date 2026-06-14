from eval_platform_api.schemas.tasks import TaskCreateRequest
from eval_platform_api.services.tasks import build_task_items


def test_build_task_items_from_trace_ids():
    payload = TaskCreateRequest(
        name="安全性评测",
        evaluator_id="eval-1",
        trace_ids=["trace-1", "trace-2"],
        runtime_config={"concurrency": 2, "retries": 1},
    )

    items = build_task_items(payload)

    assert [item.langfuse_trace_id for item in items] == ["trace-1", "trace-2"]
    assert all(item.status == "pending" for item in items)
