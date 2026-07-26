from typing import Any


PA_BOOLEAN_SCORE_CONFIG_REPAIR_MARKER = "_paRepairBooleanScoreConfig"
PA_CLICKHOUSE_SCORE_VALUE = "_paClickHouseScoreValue"

_LANGFUSE_BOOLEAN_CATEGORIES = (
    ("True", 1),
    ("False", 0),
)


def langfuse_boolean_categories() -> list[dict[str, int | str]]:
    return [
        {"label": label, "value": value}
        for label, value in _LANGFUSE_BOOLEAN_CATEGORIES
    ]


def is_langfuse_boolean_categories(value: Any) -> bool:
    if not isinstance(value, list) or len(value) != 2:
        return False

    for item, (expected_label, expected_value) in zip(
        value,
        _LANGFUSE_BOOLEAN_CATEGORIES,
        strict=True,
    ):
        if not isinstance(item, dict):
            return False
        if str(item.get("label") or "") != expected_label:
            return False
        try:
            numeric_value = float(item.get("value"))
        except (TypeError, ValueError):
            return False
        if numeric_value != expected_value:
            return False
    return True


def langfuse_boolean_label(value: float | int | bool) -> str:
    return "True" if float(value) == 1 else "False"


def strip_pa_score_fields(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if not key.startswith("_pa")}


def clickhouse_score_payload(payload: dict[str, Any]) -> dict[str, Any]:
    clickhouse_payload = strip_pa_score_fields(payload)
    if PA_CLICKHOUSE_SCORE_VALUE in payload:
        clickhouse_payload["value"] = payload[PA_CLICKHOUSE_SCORE_VALUE]
    return clickhouse_payload
