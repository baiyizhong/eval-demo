"""验证 txId 上下文绑定与请求日志中间件。"""

import json
import logging

from fastapi.testclient import TestClient

from app.main import app
from app.tx_context import bind_tx_id, current_tx_id, reset_tx_id


def test_health_returns_tx_id_in_body_and_header():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["txId"]
    # 响应头回写 X-Request-Id，与响应体 txId 一致
    assert response.headers["X-Request-Id"] == body["txId"]


def test_inbound_request_id_header_is_reused():
    client = TestClient(app)
    fixed = "fixed-request-id-123"
    response = client.get("/health", headers={"X-Request-Id": fixed})
    assert response.status_code == 200
    body = response.json()
    assert body["txId"] == fixed
    assert response.headers["X-Request-Id"] == fixed


def test_access_log_emitted_with_context_fields(caplog):
    client = TestClient(app)
    with caplog.at_level(logging.INFO, logger="app.main"):
        response = client.get("/health")
    assert response.status_code == 200
    records = [r for r in caplog.records if r.name == "app.main"]
    assert records, "expected at least one app.main log record"
    access = records[-1]
    assert getattr(access, "tx_id", "") == response.json()["txId"]
    assert getattr(access, "method", "") == "GET"
    assert getattr(access, "path", "") == "/health"
    assert getattr(access, "status", None) == 200
    assert isinstance(getattr(access, "duration_ms", None), int)


def test_current_tx_id_reflects_contextvar_binding():
    token = bind_tx_id("ctx-bound-id")
    try:
        assert current_tx_id() == "ctx-bound-id"
    finally:
        reset_tx_id(token)
    assert current_tx_id() == ""


def test_json_formatter_produces_valid_json_with_tx_id():
    from app.logging_config import JsonFormatter

    formatter = JsonFormatter()
    record = logging.LogRecord(
        name="app.test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="hello %s",
        args=("world",),
        exc_info=None,
    )
    record.tx_id = "abc123"
    rendered = formatter.format(record)
    payload = json.loads(rendered)
    assert payload["msg"] == "hello world"
    assert payload["tx_id"] == "abc123"
    assert payload["level"] == "INFO"
    assert payload["logger"] == "app.test"
