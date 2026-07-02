from typing import Any
from uuid import uuid4


def new_tx_id() -> str:
    return uuid4().hex


def success(data: Any, tx_id: str | None = None) -> dict[str, Any]:
    return {
        "code": 0,
        "message": "success",
        "data": data,
        "txId": tx_id or new_tx_id(),
    }


def failure(code: int, message: str, data: Any | None = None) -> dict[str, Any]:
    return {
        "code": code,
        "message": message,
        "data": data or {},
        "txId": new_tx_id(),
    }

