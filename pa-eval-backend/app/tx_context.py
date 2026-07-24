"""请求级 trace id 上下文。

通过 contextvars 在中间件中生成/透传 txId，并在日志、响应体中复用，
使三者保持一致，便于问题追踪。
"""

from __future__ import annotations

import contextvars
from uuid import uuid4

tx_id_var: contextvars.ContextVar[str] = contextvars.ContextVar(
    "pa_eval_tx_id",
    default="",
)


def new_tx_id() -> str:
    return uuid4().hex


def current_tx_id() -> str:
    """返回当前请求上下文中的 txId，未设置时返回空串。"""

    return tx_id_var.get()


def bind_tx_id(tx_id: str | None = None) -> contextvars.Token[str]:
    """绑定 txId 到当前上下文，返回 Token 用于 reset。"""

    return tx_id_var.set(tx_id or new_tx_id())


def reset_tx_id(token: contextvars.Token[str]) -> None:
    """恢复之前的 txId 绑定。"""

    tx_id_var.reset(token)
