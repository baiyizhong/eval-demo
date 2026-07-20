from app.langfuse_db import _score_config_storage_payload


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
