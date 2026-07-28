"""Contract tests for the Langfuse Public API evaluation adapter.

Covers Langfuse-native evaluator (LLM_AS_JUDGE / CODE) create/get/delete/list
through the typed ``LangfusePublicClient``. PA-only evaluators (WORKFLOW / SDK)
remain reader-managed and are merged into list results by the adapter.
"""

from importlib.util import find_spec

import pytest

from app.langfuse import evaluation_adapter


def test_langfuse_evaluation_adapter_module_exists() -> None:
    assert find_spec("app.langfuse.evaluation_adapter") is not None


class FakePublicClient:
    def __init__(self) -> None:
        self.calls: list[tuple] = []
        self.evaluators: list[dict] = []
        self.created: dict | None = None
        self.deleted: list[str] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args) -> None:
        return None

    async def list_evaluators(self, *, page: int = 1, limit: int = 50) -> dict:
        self.calls.append(("list_evaluators", page, limit))
        start = (page - 1) * limit
        page_items = self.evaluators[start : start + limit]
        return {
            "data": page_items,
            "meta": {
                "page": page,
                "limit": limit,
                "totalItems": len(self.evaluators),
                "totalPages": max(1, (len(self.evaluators) + limit - 1) // limit),
            },
        }

    async def create_evaluator(self, payload: dict) -> dict:
        self.calls.append(("create_evaluator", payload))
        self.created = {
            "id": "eval-new",
            "name": payload.get("name", ""),
            "type": payload.get("type", ""),
            "version": 1,
        }
        self.evaluators.append(self.created)
        return self.created

    async def get_evaluator(self, evaluator_id: str) -> dict:
        self.calls.append(("get_evaluator", evaluator_id))
        for ev in self.evaluators:
            if ev["id"] == evaluator_id:
                return ev
        raise AssertionError(f"unexpected evaluator id: {evaluator_id}")

    async def delete_evaluator(self, evaluator_id: str) -> dict:
        self.calls.append(("delete_evaluator", evaluator_id))
        self.deleted.append(evaluator_id)
        return {}


class FakeProjectClients:
    def __init__(self, client: FakePublicClient) -> None:
        self.client = client

    async def project_public_client_for_user(self, project_id: str, user_id: str):
        return self.client


class FakePaEvaluatorReader:
    """Simulates the reader returning Langfuse + PA evaluators."""

    def __init__(self, evaluators: list[dict] | None = None) -> None:
        self._evaluators = evaluators or []

    async def list_pa_evaluators_for_user(self, user_id: str) -> list:
        return list(self._evaluators)

    async def list_evaluators_for_user(self, user_id: str) -> list:
        return list(self._evaluators)


def _adapter(client: FakePublicClient, pa_reader=None):
    cls = getattr(evaluation_adapter, "LangfuseEvaluationAdapter")
    return cls(FakeProjectClients(client), pa_reader or FakePaEvaluatorReader())


def _seed(client: FakePublicClient) -> None:
    client.evaluators = [
        {
            "id": "eval-1",
            "name": "质量评估",
            "type": "LLM_AS_JUDGE",
            "version": 2,
            "projectId": "project-1",
            "updatedAt": "2026-07-24T02:00:00.000Z",
        },
        {
            "id": "eval-2",
            "name": "安全检查",
            "type": "CODE",
            "version": 1,
            "projectId": "project-1",
            "updatedAt": "2026-07-24T01:00:00.000Z",
        },
    ]


@pytest.mark.anyio
async def test_list_evaluators_merges_public_and_pa_evaluators() -> None:
    client = FakePublicClient()
    pa_reader = FakePaEvaluatorReader([
        {
            "id": "eval-1",
            "name": "质量评估",
            "type": "LLM_AS_JUDGE",
            "updatedAt": "2026-07-24T02:00:00.000Z",
        },
        {
            "id": "pa-eval-1",
            "name": "Dify工作流",
            "type": "WORKFLOW",
            "provider": "DIFY",
            "updatedAt": "2026-07-24T03:00:00.000Z",
        }
    ])
    adapter = _adapter(client, pa_reader)

    result = await adapter.list_evaluators("user-1")

    names = [ev["name"] for ev in result]
    assert "质量评估" in names
    assert "Dify工作流" in names


@pytest.mark.anyio
async def test_list_evaluators_keyword_filter() -> None:
    client = FakePublicClient()
    pa_reader = FakePaEvaluatorReader([
        {"id": "eval-1", "name": "质量评估", "type": "LLM_AS_JUDGE"},
        {"id": "eval-2", "name": "安全检查", "type": "CODE"},
    ])
    adapter = _adapter(client, pa_reader)

    result = await adapter.list_evaluators("user-1", keyword="质量")
    assert all("质量" in ev["name"] for ev in result)


@pytest.mark.anyio
async def test_create_langfuse_evaluator_routes_to_public_api() -> None:
    client = FakePublicClient()
    adapter = _adapter(client)

    result = await adapter.create_langfuse_evaluator(
        "project-1",
        "user-1",
        {
            "name": "新评估器",
            "type": "LLM_AS_JUDGE",
            "project_id": "project-1",
            "prompt": "test",
            "model_config": {"provider": "openai", "model": "gpt-4"},
            "variables": ["input"],
            "score_configs": [],
        },
    )

    assert result["name"] == "新评估器"
    assert client.created is not None
    create_call = [c for c in client.calls if c[0] == "create_evaluator"][0]
    assert create_call[1]["name"] == "新评估器"


@pytest.mark.anyio
async def test_delete_langfuse_evaluator_routes_to_public_api() -> None:
    client = FakePublicClient()
    adapter = _adapter(client)

    await adapter.delete_langfuse_evaluator("project-1", "user-1", "eval-1")

    assert "eval-1" in client.deleted


@pytest.mark.anyio
async def test_get_langfuse_evaluator_from_public_api() -> None:
    client = FakePublicClient()
    _seed(client)
    adapter = _adapter(client)

    result = await adapter.get_langfuse_evaluator("project-1", "user-1", "eval-1")

    assert result["id"] == "eval-1"
    assert ("get_evaluator", "eval-1") in client.calls
