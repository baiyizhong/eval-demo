from fastapi.testclient import TestClient

from app.main import app


def test_get_permissions_returns_default_admin_context() -> None:
    response = TestClient(app).get("/api/permissions")

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert body["data"]["user"]["name"] == "admin@163.com"
    assert body["data"]["superAdmin"] is True
    assert body["data"]["orgs"] == []


def test_get_sidebar_returns_layout_payload() -> None:
    response = TestClient(app).get("/api/sidebar")

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert body["data"]["user"]["email"] == "admin@163.com"
    assert body["data"]["teams"][0]["name"] == "PA Eval"
    assert body["data"]["menuGroups"][0]["items"][0]["url"] == "/apps"
