import pytest

from app.langfuse_db import LangfuseDatabaseReader, _score_config_storage_payload


class ScoreConfigPageReader(LangfuseDatabaseReader):
    def __init__(self) -> None:
        self.queries: list[tuple[str, dict]] = []

    async def _ensure_project_visible(self, project_id: str, user_id: str) -> None:
        return None

    async def _fetch_all(self, sql: str, params: dict | None = None) -> list[dict]:
        self.queries.append((sql, params or {}))
        if "COUNT(*)" in sql:
            return [{"total": 12}]
        return [
            {
                "id": "score-6",
                "project_id": "project-1",
                "name": "准确性",
                "data_type": "NUMERIC",
                "description": "答案是否准确",
                "min_value": 1,
                "max_value": 5,
                "categories": None,
                "is_archived": False,
                "created_at": "2026-07-01T08:00:00.000Z",
                "updated_at": "2026-07-02T08:00:00.000Z",
            }
        ]


def _jsonb_value(value):
    return getattr(value, "obj", value)


def test_numeric_score_config_stores_null_categories_for_langfuse_ui() -> None:
    payload = _score_config_storage_payload(
        {
            "name": "accuracy",
            "dataType": "NUMERIC",
            "description": "",
            "minValue": 0,
            "maxValue": 1,
            "categories": [],
        }
    )

    assert payload["categories"] is None


def test_text_score_config_stores_null_categories_for_langfuse_ui() -> None:
    payload = _score_config_storage_payload(
        {
            "name": "comment",
            "dataType": "TEXT",
            "description": "",
            "categories": [],
        }
    )

    assert payload["categories"] is None


def test_boolean_score_config_stores_langfuse_standard_categories() -> None:
    payload = _score_config_storage_payload(
        {
            "name": "passed",
            "dataType": "BOOLEAN",
            "description": "",
            "categories": [
                {"label": "合格", "value": 99},
                {"label": "不合格", "value": -1},
            ],
        }
    )

    assert _jsonb_value(payload["categories"]) == [
        {"label": "True", "value": 1},
        {"label": "False", "value": 0},
    ]


@pytest.mark.anyio
async def test_score_config_reader_returns_paginated_data() -> None:
    reader = ScoreConfigPageReader()

    result = await reader.list_score_configs_for_user(
        "project-1",
        "user-1",
        include_archived=True,
        keyword="准确",
        page=2,
        page_size=5,
    )

    assert result["total"] == 12
    assert [item["id"] for item in result["datas"]] == ["score-6"]
    assert len(reader.queries) == 2
    count_sql, count_params = reader.queries[0]
    list_sql, list_params = reader.queries[1]
    assert "COUNT(*)" in count_sql
    assert count_params == {
        "project_id": "project-1",
        "include_archived": True,
        "keyword": "准确",
        "like": "%准确%",
    }
    assert "name ILIKE %(like)s" in count_sql
    assert "description ILIKE %(like)s" not in count_sql
    assert "LIMIT %(limit)s OFFSET %(offset)s" in list_sql
    assert list_params == {
        "project_id": "project-1",
        "include_archived": True,
        "keyword": "准确",
        "like": "%准确%",
        "limit": 5,
        "offset": 5,
    }
