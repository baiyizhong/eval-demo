from pydantic import BaseModel, Field


class TaskCreateRequest(BaseModel):
    name: str
    evaluator_id: str
    trace_ids: list[str] = Field(min_length=1)
    runtime_config: dict = Field(default_factory=dict)


class TaskItemDraft(BaseModel):
    langfuse_trace_id: str
    langfuse_observation_id: str | None = None
    status: str = "pending"


class TaskCreateResponse(BaseModel):
    task_id: str
    status: str
    item_count: int
