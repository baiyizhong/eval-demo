from eval_platform_api.schemas.tasks import TaskCreateRequest, TaskItemDraft


def build_task_items(payload: TaskCreateRequest) -> list[TaskItemDraft]:
    return [TaskItemDraft(langfuse_trace_id=trace_id) for trace_id in payload.trace_ids]
