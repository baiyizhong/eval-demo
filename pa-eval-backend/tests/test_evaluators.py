from fastapi.testclient import TestClient
import psycopg
import pytest

from app.auth_context import CurrentUserContext, get_current_user_context
from app.config import Settings
from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader
from app.main import app


class FakeDatabaseReader:
    def __init__(self) -> None:
        self.user_id = None
        self.created_langfuse_payload = None
        self.created_pa_payload = None
        self.updated_pa_payload = None
        self.detail_user_id = None
        self.deleted_pa_evaluator = None

    async def list_evaluators_for_user(self, user_id: str) -> list[dict]:
        self.user_id = user_id
        return [
            {
                "id": "eval-template-1",
                "name": "客服回答质量",
                "type": "LLM_AS_JUDGE",
                "version": "v3",
                "variables": ["input", "output"],
                "description": "OpenAI / gpt-4.1",
                "provider": "LANGFUSE",
                "projectId": "project-1",
                "projectName": "默认项目",
                "usageCount": 2,
                "updatedAt": "2026-07-02T09:00:00.000Z",
            },
            {
                "id": "eval-template-2",
                "name": "答案长度检查",
                "type": "CODE",
                "version": "v1",
                "variables": ["input", "output", "expected_output"],
                "description": "Code / PYTHON",
                "provider": "LANGFUSE",
                "projectId": "project-1",
                "projectName": "默认项目",
                "usageCount": 0,
                "updatedAt": "2026-07-01T09:00:00.000Z",
            },
            {
                "id": "pa-evaluator-1",
                "name": "Dify 客诉判断",
                "type": "WORKFLOW",
                "version": "v1",
                "variables": ["input", "output"],
                "description": "Dify 工作流评估器",
                "provider": "DIFY",
                "projectId": "project-1",
                "projectName": "默认项目",
                "usageCount": 0,
                "updatedAt": "2026-07-03T09:00:00.000Z",
            },
        ]

    async def create_langfuse_evaluator(
        self,
        payload: dict,
        user_id: str,
        user_email: str,
    ) -> dict:
        self.created_langfuse_payload = {
            "payload": payload,
            "user_id": user_id,
            "user_email": user_email,
        }
        return {
            "id": "eval-template-created",
            "name": payload["name"],
            "type": payload["type"],
            "version": "v1",
            "variables": payload["variables"],
            "description": "OpenAI / gpt-4.1",
            "provider": "LANGFUSE",
            "projectId": payload["project_id"],
            "projectName": "默认项目",
            "usageCount": 0,
            "updatedAt": "2026-07-04T09:00:00.000Z",
        }

    async def create_pa_evaluator(
        self,
        payload: dict,
        user_id: str,
        user_email: str,
    ) -> dict:
        self.created_pa_payload = {
            "payload": payload,
            "user_id": user_id,
            "user_email": user_email,
        }
        return {
            "id": "pa-evaluator-created",
            "name": payload["name"],
            "type": payload["type"],
            "version": "v1",
            "variables": payload["variables"],
            "description": payload["description"],
            "provider": payload["provider"],
            "projectId": payload["project_id"],
            "projectName": "默认项目",
            "usageCount": 0,
            "updatedAt": "2026-07-04T09:00:00.000Z",
        }

    async def get_evaluator_for_user(self, evaluator_id: str, user_id: str) -> dict:
        self.detail_user_id = user_id
        if evaluator_id == "pa-evaluator-1":
            return {
                "id": "pa-evaluator-1",
                "name": "Dify 客诉判断",
                "type": "WORKFLOW",
                "version": "v1",
                "variables": ["input", "output"],
                "description": "Dify 工作流评估器",
                "provider": "DIFY",
                "projectId": "project-1",
                "projectName": "默认项目",
                "usageCount": 0,
                "updatedAt": "2026-07-03T09:00:00.000Z",
                "config": {
                    "endpointUrl": "https://dify.example.com/v1/workflows/run",
                    "authType": "BEARER",
                    "hasAuthToken": True,
                    "inputMapping": {"query": "{{input}}"},
                    "outputMapping": {"score": "$.data.score"},
                },
            }

        return {
            "id": "eval-template-1",
            "name": "客服回答质量",
            "type": "LLM_AS_JUDGE",
            "version": "v3",
            "variables": ["input", "output"],
            "description": "OpenAI / gpt-4.1",
            "provider": "LANGFUSE",
            "projectId": "project-1",
            "projectName": "默认项目",
            "usageCount": 2,
            "updatedAt": "2026-07-02T09:00:00.000Z",
            "prompt": "请评分",
            "modelConfig": {"provider": "openai", "model": "gpt-4.1"},
            "outputDefinition": {"score": "number"},
        }

    async def delete_pa_evaluator_for_user(
        self,
        evaluator_id: str,
        user_id: str,
    ) -> None:
        self.deleted_pa_evaluator = {
            "evaluator_id": evaluator_id,
            "user_id": user_id,
        }

    async def update_pa_evaluator_for_user(
        self,
        evaluator_id: str,
        payload: dict,
        user_id: str,
        user_email: str,
    ) -> dict:
        self.updated_pa_payload = {
            "evaluator_id": evaluator_id,
            "payload": payload,
            "user_id": user_id,
            "user_email": user_email,
        }
        return {
            "id": evaluator_id,
            "name": payload["name"],
            "type": payload["type"],
            "version": "v2",
            "variables": payload["variables"],
            "outputVariables": payload["output_variables"],
            "description": payload["description"],
            "provider": payload["provider"],
            "projectId": payload["project_id"],
            "projectName": "默认项目",
            "usageCount": 0,
            "updatedAt": "2026-07-05T09:00:00.000Z",
        }


def override_reader(fake_reader: FakeDatabaseReader):
    async def _override() -> LangfuseDatabaseReader:
        return fake_reader  # type: ignore[return-value]

    app.dependency_overrides[get_langfuse_db_reader] = _override
    app.dependency_overrides[get_current_user_context] = lambda: CurrentUserContext(
        user_id="user-1",
        email="admin@163.com",
    )


def clear_overrides() -> None:
    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_pa_evaluator_list_falls_back_when_output_variables_column_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reader = LangfuseDatabaseReader(Settings())
    calls: list[str] = []

    async def fake_fetch_all(sql: str, params: dict) -> list[dict]:
        calls.append(sql)
        if "output_variables" in sql:
            raise psycopg.errors.UndefinedColumn("column pe.output_variables does not exist")
        return [
            {
                "id": "pa-evaluator-1",
                "name": "Dify 客诉判断",
                "type": "WORKFLOW",
                "provider": "DIFY",
                "version": 1,
                "description": "Dify 工作流评估器",
                "variables": ["input", "output"],
                "project_id": "project-1",
                "project_name": "默认项目",
                "updated_at": "2026-07-03T09:00:00.000Z",
            }
        ]

    monkeypatch.setattr(reader, "_fetch_all", fake_fetch_all)

    evaluators = await reader._list_pa_evaluators_for_user("user-1")

    assert len(calls) == 2
    assert evaluators[0]["id"] == "pa-evaluator-1"
    assert evaluators[0]["outputVariables"] == []


@pytest.mark.anyio
async def test_pa_evaluator_list_exposes_output_variable_mappings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reader = LangfuseDatabaseReader(Settings())

    async def fake_fetch_all(sql: str, params: dict) -> list[dict]:
        assert "pe.config" in sql
        return [
            {
                "id": "pa-evaluator-1",
                "name": "Dify 客诉判断",
                "type": "WORKFLOW",
                "provider": "DIFY",
                "version": 1,
                "description": "Dify 工作流评估器",
                "variables": ["input", "output"],
                "output_variables": ["quality_score"],
                "config": {
                    "outputVariableMappings": [
                        {
                            "variableName": "quality_score",
                            "scoreConfigName": "回答质量",
                        },
                    ],
                },
                "project_id": "project-1",
                "project_name": "默认项目",
                "updated_at": "2026-07-03T09:00:00.000Z",
            }
        ]

    monkeypatch.setattr(reader, "_fetch_all", fake_fetch_all)

    evaluators = await reader._list_pa_evaluators_for_user("user-1")

    assert evaluators[0]["outputVariableMappings"] == [
        {
            "variableName": "quality_score",
            "scoreConfigName": "回答质量",
        },
    ]


def test_lists_evaluators_from_langfuse_with_pa_pagination_and_keyword() -> None:
    override_reader(FakeDatabaseReader())

    try:
        response = TestClient(app).get(
            "/api/evaluators",
            params={"page": 1, "pageSize": 10, "keyword": "客服"},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert body["message"] == "success"
    assert body["txId"]
    assert body["data"] == {
        "total": 1,
        "datas": [
            {
                "id": "eval-template-1",
                "name": "客服回答质量",
                "type": "LLM_AS_JUDGE",
                "version": "v3",
                "variables": ["input", "output"],
                "description": "OpenAI / gpt-4.1",
                "provider": "LANGFUSE",
                "projectId": "project-1",
                "projectName": "默认项目",
                "usageCount": 2,
                "updatedAt": "2026-07-02T09:00:00.000Z",
            }
        ],
    }


def test_lists_evaluators_for_current_user_id() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)
    app.dependency_overrides[get_current_user_context] = lambda: CurrentUserContext(
        user_id="user-octocat",
        email="octocat@example.com",
        login="octocat",
    )

    try:
        response = TestClient(app).get("/api/evaluators")
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert fake_reader.user_id == "user-octocat"


def test_filters_evaluators_by_type() -> None:
    override_reader(FakeDatabaseReader())

    try:
        response = TestClient(app).get(
            "/api/evaluators",
            params={"type": "CODE"},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["total"] == 1
    assert response.json()["data"]["datas"][0]["id"] == "eval-template-2"


def test_lists_custom_pa_evaluators_with_langfuse_evaluators() -> None:
    override_reader(FakeDatabaseReader())

    try:
        response = TestClient(app).get(
            "/api/evaluators",
            params={"keyword": "Dify"},
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["total"] == 1
    assert body["data"]["datas"][0]["id"] == "pa-evaluator-1"
    assert body["data"]["datas"][0]["provider"] == "DIFY"


def test_creates_langfuse_llm_as_judge_evaluator() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).post(
            "/api/evaluators",
            json={
                "name": "客服质量评分",
                "type": "LLM_AS_JUDGE",
                "provider": "LANGFUSE",
                "projectId": "project-1",
                "description": "检查客服回复是否准确",
                "variables": ["input", "output"],
                "prompt": "请根据 {{input}} 和 {{output}} 评分",
                "modelConfig": {
                    "provider": "openai",
                    "model": "gpt-4.1",
                },
                "outputDefinition": {"score": "number"},
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["id"] == "eval-template-created"
    assert fake_reader.created_langfuse_payload == {
        "user_id": "user-1",
        "user_email": "admin@163.com",
        "payload": {
            "name": "客服质量评分",
            "type": "LLM_AS_JUDGE",
            "provider": "LANGFUSE",
            "project_id": "project-1",
            "description": "检查客服回复是否准确",
            "variables": ["input", "output"],
            "input_variables": ["input", "output"],
            "output_variables": [],
            "prompt": "请根据 {{input}} 和 {{output}} 评分",
            "model_config": {
                "provider": "openai",
                "model": "gpt-4.1",
            },
            "output_definition": {"score": "number"},
        },
    }


def test_creates_workflow_evaluator_in_pa_table() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).post(
            "/api/evaluators",
            json={
                "name": "Dify 客诉判断",
                "type": "WORKFLOW",
                "provider": "DIFY",
                "projectId": "project-1",
                "description": "调用 Dify 工作流判断客诉风险",
                "variables": ["input", "output"],
                "inputVariables": ["input", "output"],
                "outputVariables": ["quality_score", "risk_score"],
                "outputVariableMappings": [
                    {
                        "variableName": "quality_score",
                        "scoreConfigName": "回答质量",
                    },
                    {
                        "variableName": "risk_score",
                        "scoreConfigName": "风险分",
                    },
                ],
                "endpointUrl": "https://dify.example.com/v1/workflows/run",
                "authType": "BEARER",
                "authToken": "secret-token",
                "inputMapping": {"query": "{{input}}"},
                "outputMapping": {"score": "$.data.score"},
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["id"] == "pa-evaluator-created"
    assert fake_reader.created_pa_payload == {
        "user_id": "user-1",
        "user_email": "admin@163.com",
        "payload": {
            "name": "Dify 客诉判断",
            "type": "WORKFLOW",
            "provider": "DIFY",
            "project_id": "project-1",
            "description": "调用 Dify 工作流判断客诉风险",
            "variables": ["input", "output"],
            "input_variables": ["input", "output"],
            "output_variables": ["quality_score", "risk_score"],
            "config": {
                "endpointUrl": "https://dify.example.com/v1/workflows/run",
                "authType": "BEARER",
                "authToken": "secret-token",
                "inputMapping": {"query": "{{input}}"},
                "outputMapping": {"score": "$.data.score"},
                "outputVariableMappings": [
                    {
                        "variableName": "quality_score",
                        "scoreConfigName": "回答质量",
                    },
                    {
                        "variableName": "risk_score",
                        "scoreConfigName": "风险分",
                    },
                ],
            },
        },
    }


def test_gets_workflow_evaluator_detail() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).get("/api/evaluators/pa-evaluator-1")
    finally:
        clear_overrides()

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["id"] == "pa-evaluator-1"
    assert body["data"]["config"]["hasAuthToken"] is True
    assert "authToken" not in body["data"]["config"]
    assert fake_reader.detail_user_id == "user-1"


def test_updates_pa_workflow_evaluator() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).patch(
            "/api/evaluators/pa-evaluator-1",
            json={
                "name": "Dify 客诉判断 v2",
                "type": "WORKFLOW",
                "provider": "DIFY",
                "projectId": "project-1",
                "description": "更新工作流配置",
                "variables": ["input", "output"],
                "inputVariables": ["input", "output"],
                "outputVariables": ["quality_score"],
                "outputVariableMappings": [
                    {
                        "variableName": "quality_score",
                        "scoreConfigName": "回答质量",
                    }
                ],
                "endpointUrl": "https://dify.example.com/v1/workflows/run",
                "authType": "NONE",
                "inputMapping": {"query": "{{input}}"},
                "outputMapping": {"score": "$.data.score"},
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"]["version"] == "v2"
    assert fake_reader.updated_pa_payload == {
        "evaluator_id": "pa-evaluator-1",
        "user_id": "user-1",
        "user_email": "admin@163.com",
        "payload": {
            "name": "Dify 客诉判断 v2",
            "type": "WORKFLOW",
            "provider": "DIFY",
            "project_id": "project-1",
            "description": "更新工作流配置",
            "variables": ["input", "output"],
            "input_variables": ["input", "output"],
            "output_variables": ["quality_score"],
            "config": {
                "endpointUrl": "https://dify.example.com/v1/workflows/run",
                "authType": "NONE",
                "authToken": None,
                "inputMapping": {"query": "{{input}}"},
                "outputMapping": {"score": "$.data.score"},
                "outputVariableMappings": [
                    {
                        "variableName": "quality_score",
                        "scoreConfigName": "回答质量",
                    }
                ],
            },
        },
    }


def test_rejects_updating_langfuse_evaluator() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).patch(
            "/api/evaluators/eval-template-1",
            json={
                "name": "客服回答质量",
                "type": "LLM_AS_JUDGE",
                "provider": "LANGFUSE",
                "projectId": "project-1",
                "description": "检查客服回复",
                "variables": ["input", "output"],
                "inputVariables": ["input", "output"],
                "prompt": "请评分",
                "modelConfig": {"provider": "openai", "model": "gpt-4.1"},
            },
        )
    finally:
        clear_overrides()

    assert response.status_code == 409
    assert response.json()["code"] == 4019
    assert response.json()["message"] == "Langfuse 原生评估器由 Langfuse 管理，请在 Langfuse 中编辑"
    assert fake_reader.updated_pa_payload is None


def test_deletes_pa_workflow_evaluator() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).delete("/api/evaluators/pa-evaluator-1")
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["data"] == {"id": "pa-evaluator-1"}
    assert fake_reader.deleted_pa_evaluator == {
        "evaluator_id": "pa-evaluator-1",
        "user_id": "user-1",
    }


def test_rejects_deleting_langfuse_evaluator() -> None:
    fake_reader = FakeDatabaseReader()
    override_reader(fake_reader)

    try:
        response = TestClient(app).delete("/api/evaluators/eval-template-1")
    finally:
        clear_overrides()

    assert response.status_code == 409
    assert response.json()["code"] == 4018
    assert response.json()["message"] == "Langfuse 原生评估器由 Langfuse 管理，请在 Langfuse 中删除"
    assert fake_reader.deleted_pa_evaluator is None
